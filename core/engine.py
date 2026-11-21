"""
The engine runs one slot at a time. The offline simulation and the live master both use it,
so the yearly/weekly numbers and the live demo come from the same code.
"""
import heapq
import itertools
from collections import defaultdict

import pandas as pd

import config
from core import mpc, scheduler
from core.models import FINISHED, RUNNING
from core.physics import tank_step


class Engine:
    def __init__(self, times, demand, sites, servers, jobs, tasks, algorithm=None):
        self.times, self.demand = times, demand
        self.sites, self.servers, self.jobs = sites, servers, jobs
        # Only tasks that have arrived and are still needed sit in self.tasks (the hot loop).
        # Future tasks wait in self.pending; finished ones move to self.archive. This keeps a
        # full year with ~100k tasks fast: each slot only looks at the tasks that matter now.
        self.tasks, self.pending, self.archive = {}, {}, {}
        self.children = defaultdict(list)         # task_id -> ids of tasks that depend on it
        self._arrivals = []                       # heap of (arrival slot, task_id) for pending tasks
        self.algorithm = algorithm or config.ALGORITHM
        self.now = 0                              # current slot
        self.slot_rows = []                       # one row per site per slot
        self.server_rows = []                     # one row per server per slot
        self.events = []                          # task lifecycle events (all tasks)
        self.alerts = []                          # things a human should notice
        self.filler_ids = itertools.count(1)
        self.last_running = {}                    # server_id -> task ids that ran in the last slot (for display)
        self._last_unmet = defaultdict(float)
        self._last_dumped = defaultdict(float)
        self._add_tasks(tasks.values())

    # ------------------------------------------------------------ helpers
    @property
    def n_slots(self):
        return len(self.times)

    @property
    def finished(self):
        return self.now >= self.n_slots

    def time_of(self, slot):
        return pd.Timestamp(self.times[0]) + pd.Timedelta(minutes=config.SLOT_MIN * slot)

    def all_tasks(self):
        return {**self.archive, **self.pending, **self.tasks}

    def add_job(self, job, tasks):
        self.jobs[job.job_id] = job
        self._add_tasks(tasks)

    def _add_tasks(self, tasks):
        for t in tasks:
            self.pending[t.task_id] = t
            heapq.heappush(self._arrivals, (t.arrival, t.task_id))
            for d in t.depends_on:
                self.children[d].append(t.task_id)
        self._promote()

    def task(self, task_id):
        """One task by id, wherever it is (active, pending or archived). None if unknown."""
        return self.tasks.get(task_id) or self.pending.get(task_id) or self.archive.get(task_id)

    def has_task(self, task_id):
        return task_id in self.tasks or task_id in self.pending or task_id in self.archive

    _find = task

    def _promote(self):
        """Move tasks that have arrived (and the tasks they depend on) from pending into the hot loop."""
        due = []
        while self._arrivals and self._arrivals[0][0] <= self.now + scheduler.EPS:
            due.append(heapq.heappop(self._arrivals)[1])
        while due:
            t = self.pending.pop(due.pop(), None)
            if t is None:                          # already promoted as someone's dependency
                continue
            self.tasks[t.task_id] = t
            due += [d for d in t.depends_on if d in self.pending]

    def _retire(self):
        """Move finished tasks out of the hot loop once nothing still waiting depends on them."""
        for t in list(self.tasks.values()):
            if t.state not in FINISHED:
                continue
            kids = (self._find(k) for k in self.children.get(t.task_id, ()))
            if any(k is not None and k.state not in FINISHED for k in kids):
                continue
            self.archive[t.task_id] = self.tasks.pop(t.task_id)

    def alert(self, severity, kind, message, site_id=None, server_id=None, job_id=None):
        self.alerts.append({"id": len(self.alerts) + 1, "slot": self.now, "time": self.time_of(self.now),
                            "severity": severity, "kind": kind, "site_id": site_id, "server_id": server_id,
                            "job_id": job_id, "message": message, "acknowledged": False})

    # ------------------------------------------------------------ one slot
    def step(self, progress_reports=None):
        """Run one slot. Returns commands for live servers (see scheduler.apply_plan)."""
        now = self.now
        self._promote()
        n_events = {t.task_id: len(t.events) for t in self.tasks.values()}

        for t in scheduler.update_states(now, self.tasks, self.servers):
            if not t.filler:
                self.alert("warning", "deadline_missed", f"Task {t.task_id} of job {t.job_id} missed its deadline",
                           job_id=t.job_id)

        demand_now = {sid: self.demand[sid][now] for sid in self.sites}
        targets = None
        if self.algorithm == "mpc":
            targets = mpc.plan_targets(now, self.sites, self.servers, self.tasks, self.demand, self.n_slots)
        assign, fillers = scheduler.plan(now, self.sites, self.servers, self.tasks, demand_now, targets,
                                         self.filler_ids)
        for f in fillers:
            self.tasks[f.task_id] = f
        cmds = scheduler.apply_plan(now, assign, self.tasks)
        # progress at the moment of the command (before this slot is simulated): where a laptop must start
        self.cmd_progress = {t.task_id: t.progress for _, t, _ in cmds}

        # heat produced per site and load per server in this slot
        produced, load = defaultdict(float), defaultdict(float)
        self.last_running = defaultdict(list)
        for t in self.tasks.values():
            if t.state == RUNNING:
                produced[self.servers[t.server_id].site_id] += t.heat_this_slot()
                load[t.server_id] += t.power_kw * min(1.0, t.remaining_slots)
                self.last_running[t.server_id].append(t.task_id)

        time = self.time_of(now)
        for sid, site in self.sites.items():
            before = site.tank_kwh
            site.tank_kwh, delivered, dumped, unmet = tank_step(before, produced[sid], demand_now[sid],
                                                                 site.tank_cap_kwh)
            my = [s for s in self.servers.values() if s.site_id == sid]
            self.slot_rows.append({
                "slot": now, "time": time, "site_id": sid, "demand_kwh": demand_now[sid],
                "produced_kwh": produced[sid], "delivered_kwh": delivered, "dumped_kwh": dumped,
                "unmet_kwh": unmet, "tank_kwh": site.tank_kwh,
                "load_kw": sum(load[s.server_id] for s in my),
                "capacity_kw": sum(s.capacity_kw for s in my if s.online),
                "servers_running": sum(1 for s in my if load[s.server_id] > 0),
                "servers_total": len(my)})
            if unmet > 0 and self._last_unmet[sid] == 0:
                self.alert("warning", "unmet_demand", f"{site.name}: backup heater needed", site_id=sid)
            if dumped > 0 and self._last_dumped[sid] == 0:
                self.alert("info", "heat_dumped", f"{site.name}: tank full, heat dumped", site_id=sid)
            self._last_unmet[sid], self._last_dumped[sid] = unmet, dumped

        for s in self.servers.values():
            self.server_rows.append({"slot": now, "time": time, "server_id": s.server_id, "site_id": s.site_id,
                                     "load_kw": load[s.server_id], "capacity_kw": s.capacity_kw,
                                     "online": s.online, "cpu_pct": s.cpu_pct})

        scheduler.advance(now, self.tasks, progress_reports)

        # collect new lifecycle events, then move finished tasks out of the hot loop
        for t in self.tasks.values():
            for slot, kind, src, dst in t.events[n_events.get(t.task_id, 0):]:
                self.events.append({"slot": slot, "time": self.time_of(slot), "kind": kind, "task_id": t.task_id,
                                    "job_id": t.job_id, "filler": t.filler, "from_server": src, "to_server": dst})
        self._retire()

        self.now += 1
        return cmds

    def run(self):
        while not self.finished:
            self.step()
        return self
