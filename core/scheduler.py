"""
Greedy scheduler, called once per slot.

Each slot it:
  1. updates task states   (arrivals, dependencies, deadlines, servers that went offline)
  2. orders the ready tasks (pinned > critical > urgent > normal > flexible, then least slack)
  3. places them on servers (fits server capacity; mandatory tasks run anyway,
                             normal/flexible tasks only where heat is still wanted)
  4. fills remaining heat gaps with background filler work (if enabled)
plan() is pure: it only returns a plan. apply_plan() turns the plan into state changes + commands.
"""
from collections import defaultdict

import config
from core.models import ACTIVE, DONE, FINISHED, MISSED, CANCELLED, PAUSED, READY, RUNNING, WAITING, Task

EPS = 1e-9
PRIORITY_RANK = {"critical": 1, "normal": 3, "flexible": 4}


def log(task, now, kind, src=None, dst=None):
    task.events.append((now, kind, src, dst))


# ---------------------------------------------------------------- 1. states
def update_states(now, tasks, servers):
    """Move tasks between waiting / ready / missed. Returns tasks that were just marked missed."""
    newly_missed = []

    # a task on a server that went offline loses that server and will be placed elsewhere
    for t in tasks.values():
        if t.state in (RUNNING, PAUSED) and t.server_id and not servers[t.server_id].online:
            if t.state == RUNNING:
                t.state = PAUSED
                log(t, now, "server_lost", t.server_id, None)

    # deadline passed and not finished -> missed (a running task is stopped)
    for t in tasks.values():
        if t.state not in FINISHED and now >= t.deadline - EPS and t.remaining_slots > EPS:
            t.state = MISSED
            log(t, now, "missed", t.server_id, None)
            newly_missed.append(t)

    # a task whose dependency was missed or cancelled can never run
    changed = True
    while changed:
        changed = False
        for t in tasks.values():
            if t.state not in FINISHED and any(tasks[d].state in (MISSED, CANCELLED) for d in t.depends_on):
                t.state = MISSED
                log(t, now, "missed", t.server_id, None)
                newly_missed.append(t)
                changed = True

    # arrived and all dependencies done -> ready
    for t in tasks.values():
        if t.state == WAITING and t.arrival <= now + EPS and all(tasks[d].state == DONE for d in t.depends_on):
            t.state = READY
            log(t, now, "ready")
    return newly_missed


def effective_deadlines(tasks):
    """
    A task that others depend on must finish early enough for them to finish too:
        effective deadline = min(own deadline, effective deadline of each dependent - its remaining runtime)
    (latest-start rule used in dependency scheduling)
    """
    children = defaultdict(list)
    for t in tasks.values():
        if t.state not in FINISHED:
            for d in t.depends_on:
                children[d].append(t)
    eff = {}

    def calc(t):
        if t.task_id not in eff:
            e = t.deadline
            for c in children[t.task_id]:
                e = min(e, calc(c) - c.remaining_slots)
            eff[t.task_id] = e
        return eff[t.task_id]

    for t in tasks.values():
        if t.state not in FINISHED:
            calc(t)
    return eff


# ---------------------------------------------------------------- 2-4. plan
def plan(now, sites, servers, tasks, demand_now, targets=None, filler_ids=None):
    """
    demand_now  {site_id: heat needed this slot, kWh}
    targets     {site_id: heat to aim for this slot, kWh} from the MPC planner;
                None = greedy default (keep each tank TARGET_FRACTION full)
    filler_ids  iterator giving ids for new filler tasks (None = no filler)
    Returns (assign {task_id: server_id}, new filler tasks).
    """
    eff = effective_deadlines(tasks)
    slack = lambda t: eff[t.task_id] - now - t.remaining_slots

    free = {sid: (s.capacity_kw if s.online else 0.0) for sid, s in servers.items()}
    heat = {sid: 0.0 for sid in sites}
    low, high, target = {}, {}, {}
    for sid, site in sites.items():
        low[sid] = demand_now[sid] - site.tank_kwh                 # below: house not warm
        high[sid] = low[sid] + site.tank_cap_kwh                   # above: heat dumped
        if targets:                                                # MPC plan, but never below meeting demand
            target[sid] = max(targets[sid], low[sid])
        else:                                                      # greedy: keep the tank TARGET_FRACTION full
            target[sid] = low[sid] + config.TARGET_FRACTION * site.tank_cap_kwh
    site_of = {sid: s.site_id for sid, s in servers.items()}
    assign = {}

    def put(t, server_id):
        assign[t.task_id] = server_id
        free[server_id] -= t.power_kw
        heat[site_of[server_id]] += t.heat_this_slot()

    def rank(t):
        if t.state == RUNNING and not t.interruptible and servers[t.server_id].online:
            return 0                                              # pinned: cannot be paused
        if t.priority == "critical":
            return 1
        if slack(t) < config.URGENT_SLACK_SLOTS:
            return 2                                              # must run now to meet its deadline
        return PRIORITY_RANK.get(t.priority, 3)

    active = [t for t in tasks.values() if t.state in ACTIVE and not t.hold]
    # within a rank, tasks already running go first (fewer pauses and migrations), then least slack
    for t in sorted(active, key=lambda t: (rank(t), t.state != RUNNING, slack(t), t.task_id)):
        r = rank(t)
        if r == 0:
            put(t, t.server_id)
            continue
        h = t.heat_this_slot()
        fits = [sid for sid in free if free[sid] >= t.power_kw - EPS]          # threads: whole task on one server
        useful = lambda sid: heat[site_of[sid]] + h <= high[site_of[sid]] + EPS
        if r <= 2:
            # mandatory: run now; prefer a site that can use the heat, then its own server, then best fit
            if fits:
                put(t, min(fits, key=lambda sid: (not useful(sid), sid != t.server_id, free[sid] - t.power_kw)))
        elif t.state == RUNNING and t.server_id in fits and useful(t.server_id):
            # already running and its heat is still useful (house or tank takes it): keep it going
            put(t, t.server_id)
        else:
            # normal / flexible: start only where heat is still wanted; stay on own server if possible
            wanted =[sid for sid in fits if useful(sid) and heat[site_of[sid]] < target[site_of[sid]] - EPS]
            if wanted:
                put(t, min(wanted, key=lambda sid: (sid != t.server_id,
                                                    abs(target[site_of[sid]] - heat[site_of[sid]] - h),
                                                    free[sid] - t.power_kw)))

    fillers = []
    if config.FILLER_ENABLED and filler_ids is not None:
        for site_id in sites:
            fillers += _fill_site(now, site_id, servers, free, heat, low[site_id], high[site_id],
                                  target[site_id], filler_ids, put)
    return assign, fillers


def _fill_site(now, site_id, servers, free, heat, low, high, target, filler_ids, put):
    """Greedy best-fit with background work until the site's heat reaches its target."""
    my_servers = [sid for sid, s in servers.items() if s.site_id == site_id and s.online]
    kinds = [(f, f["runtime_min"] / config.SLOT_MIN) for f in config.FILLER_TASKS]
    made = []
    while heat[site_id] < target - EPS:
        best = None
        for f, slots in kinds:
            h = f["power_kw"] * min(1.0, slots) * config.SLOT_H * config.RECOVERY
            if heat[site_id] + h > high + EPS:
                continue
            for sid in my_servers:
                if free[sid] >= f["power_kw"] - EPS:
                    score = (abs(target - heat[site_id] - h), free[sid] - f["power_kw"])
                    if best is None or score < best[0]:
                        best = (score, f, slots, sid)
        if best is None or best[0][0] >= abs(target - heat[site_id]) - EPS:
            if heat[site_id] >= low - EPS:
                break                                   # target reached as close as possible
            # demand still not met: smallest filler that fits anywhere here, accept some dumping
            options = [(f["power_kw"], f, slots, sid) for f, slots in kinds for sid in my_servers
                       if free[sid] >= f["power_kw"] - EPS]
            if not options:
                break                                   # servers full: backup heater covers the rest
            _, f, slots, sid = min(options, key=lambda o: o[0])
        else:
            _, f, slots, sid = best
        t = Task(task_id=f"F{next(filler_ids)}", job_id="filler", name=f["name"], runtime_slots=slots,
                 power_kw=f["power_kw"], arrival=now, deadline=now + 10_000, priority="flexible",
                 interruptible=True, filler=True, state=READY)
        put(t, sid)
        made.append(t)
    return made


# ---------------------------------------------------------------- apply
def apply_plan(now, assign, tasks):
    """
    Turn the plan into state changes. Returns commands for live servers:
      ("run", task, server)  start or continue from task.progress on that server
      ("resume", task, server) / ("pause", task, server) / ("stop", task, server)
    """
    cmds = []
    for t in tasks.values():
        if t.state not in ACTIVE:
            continue
        new = assign.get(t.task_id)
        old = t.server_id
        if new is None:
            if t.state == RUNNING:
                t.state = PAUSED
                log(t, now, "paused", old, None)
                cmds.append(("pause", t, old))
            continue
        if t.state == RUNNING and old == new:
            continue
        if t.state == PAUSED and old == new:
            log(t, now, "resumed", old, new)
            cmds.append(("resume", t, new))
        elif old is not None and old != new:
            log(t, now, "migrated", old, new)
            cmds.append(("stop", t, old))
            cmds.append(("run", t, new))
        else:
            log(t, now, "started", None, new)
            cmds.append(("run", t, new))
        t.state, t.server_id, t.started = RUNNING, new, True
    return cmds


def advance(now, tasks, progress_reports=None):
    """
    Move running tasks forward by one slot.
    progress_reports {task_id: progress 0..1} from real agents overrides the simulated progress.
    """
    finished = []
    for t in tasks.values():
        if t.state != RUNNING:
            continue
        before = t.remaining_slots
        if progress_reports and t.task_id in progress_reports:
            t.remaining_slots = max(0.0, t.runtime_slots * (1 - progress_reports[t.task_id]))
        else:
            t.remaining_slots = max(0.0, t.remaining_slots - 1.0)
        ran = max(0.0, before - t.remaining_slots)
        t.energy_kwh += t.power_kw * ran * config.SLOT_H
        t.heat_kwh += t.power_kw * ran * config.SLOT_H * config.RECOVERY
        if t.remaining_slots <= EPS:
            t.state, t.finished_slot = DONE, now + 1
            log(t, now + 1, "completed", t.server_id, None)
            finished.append(t)
    return finished
