"""
MPC planner (rolling-horizon optimisation).

Every slot it looks MPC_HORIZON_SLOTS ahead and solves a linear program that decides how much
server power each site should run per slot, so that demand is met, as little heat as possible is
dumped and tanks are pre-charged before peaks. Only the first slot's result is used: it becomes the
heat target for the greedy placement in scheduler.plan(). Deadlines, dependencies, priorities and
server fit stay in the greedy step, which handles them exactly.

LP per horizon (s = site, k = slot ahead):
  P[s,k]  server power at site s       0 <= P <= online capacity (k=0: >= power of pinned tasks)
  e[s,k]  tank level                    0 <= e <= tank capacity
  e[s,k] = e[s,k-1] + RECOVERY*SLOT_H*P[s,k] - demand[s,k] + unmet[s,k] - dumped[s,k]
  minimise  W_UNMET*unmet + W_DUMP*dumped + W_ELEC*electricity + W_RESERVE*(tank below safety buffer)
            - W_TANK_END*tank at horizon end
  (without filler work: total energy <= remaining work of all tasks)
"""
import pulp

import config
from core.models import ACTIVE, RUNNING, WAITING


def _var(prob, name, low=None, up=None):
    """Works with PuLP 4.x and 2.x/3.x."""
    if hasattr(prob, "add_variable"):
        return prob.add_variable(name, lowBound=low, upBound=up)
    return pulp.LpVariable(name, low, up)


def _solver():
    highs = pulp.HiGHS(msg=False, timeLimit=config.MPC_TIME_LIMIT_S)
    return highs if highs.available() else pulp.PULP_CBC_CMD(msg=False, timeLimit=config.MPC_TIME_LIMIT_S)


def forecast(demand, site_id, now, k):
    """Expected demand k slots ahead. 'persistence' = same slot one day earlier."""
    series = demand[site_id]
    if config.FORECAST == "perfect" or k == 0:
        return series[now + k]
    day = int(24 * 60 / config.SLOT_MIN)
    back = now + k - day * ((k + day - 1) // day)          # same time of day, before now
    return series[back] if back >= 0 else series[now]


def plan_targets(now, sites, servers, tasks, demand, n_slots):
    """Returns {site_id: heat target for this slot (kWh)}, or None if the LP fails."""
    H = min(config.MPC_HORIZON_SLOTS, n_slots - now)
    cap = {sid: 0.0 for sid in sites}
    pinned = {sid: 0.0 for sid in sites}
    for s in servers.values():
        if s.online:
            cap[s.site_id] += s.capacity_kw
    for t in tasks.values():
        if t.state == RUNNING and not t.interruptible and servers[t.server_id].online:
            pinned[servers[t.server_id].site_id] += t.power_kw

    prob = pulp.LpProblem("mpc", pulp.LpMinimize)
    P, cost, energy = {}, [], []
    tank_end = []
    for sid, site in sites.items():
        prev = site.tank_kwh
        for k in range(H):
            p = _var(prob, f"P_{sid}_{k}", pinned[sid] if k == 0 else 0, cap[sid])
            e = _var(prob, f"e_{sid}_{k}", 0, site.tank_cap_kwh)
            u = _var(prob, f"u_{sid}_{k}", 0)
            q = _var(prob, f"q_{sid}_{k}", 0)
            r = _var(prob, f"r_{sid}_{k}", 0)                     # how far the tank is below the buffer
            prob += e == prev + config.RECOVERY * config.SLOT_H * p - forecast(demand, sid, now, k) + u - q
            prob += e + r >= min(config.MPC_RESERVE_KWH, site.tank_cap_kwh)
            cost += [config.W_UNMET * u, config.W_DUMP * q, config.W_ELEC * config.SLOT_H * p, config.W_RESERVE * r]
            energy.append(config.SLOT_H * p)
            P[sid, k], prev = p, e
        tank_end.append(prev)

    if not config.FILLER_ENABLED:          # only as much work as the queue holds
        work = sum(t.remaining_slots * t.power_kw * config.SLOT_H
                   for t in tasks.values() if t.state in ACTIVE or t.state == WAITING)
        prob += pulp.lpSum(energy) <= work

    prob += pulp.lpSum(cost) - config.W_TANK_END * pulp.lpSum(tank_end)
    prob.solve(_solver())
    try:
        return {sid: config.RECOVERY * config.SLOT_H * (P[sid, 0].value() or 0.0) for sid in sites}
    except (TypeError, AttributeError):
        return None
