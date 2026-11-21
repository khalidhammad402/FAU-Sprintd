"""
Key figures from an engine run, with the definitions of the case brief (must-have 3):

  coverage         = heat delivered by servers / total heat demand (rest = backup heater)
  utilisation      = server running hours / (servers x hours in the period)      [8,760 h for a year]
                     a server counts as running in a 15-min slot when it has any load
  missed deadlines = jobs with a missed task / jobs that finished (done or missed), in %
  server-hours sold = full-load server-hours of compute: sum over servers of load / capacity x hours
                      (= kWh of electricity for the 1 kW reference server)
  break-even       = (electricity cost - value of the heat actually used) / server-hours sold   [CHF per server-hour]
  heat value       = heat delivered x electricity price / HEAT_PUMP_COP (the heat replaces a heat pump)
"""
import pandas as pd

import config
from core.models import CANCELLED, DONE, MISSED


def _pct(a, b):
    return 100.0 * a / b if b else 0.0


# ---------------------------------------------------------------- building blocks (also used by the API)
def server_hours(server_rows):
    """Running hours, full-load hours sold, number of servers and hours in the period, from per-server rows."""
    df = pd.DataFrame(server_rows)
    if df.empty:
        return {"servers": 0, "period_h": 0.0, "running_h": 0.0, "sold_h": 0.0, "utilisation_pct": 0.0,
                "load_factor_pct": 0.0}
    n = df.server_id.nunique()
    period_h = df.slot.nunique() * config.SLOT_H
    running_h = (df.load_kw > 1e-9).sum() * config.SLOT_H
    sold_h = (df.load_kw / df.capacity_kw).sum() * config.SLOT_H
    return {"servers": int(n), "period_h": float(period_h), "running_h": float(running_h), "sold_h": float(sold_h),
            "utilisation_pct": _pct(running_h, n * period_h),           # brief: running hours / (servers x 8,760)
            "load_factor_pct": _pct(sold_h, n * period_h)}              # energy view: average load / capacity


def economics(electricity_kwh, heat_used_kwh, income_chf, sold_h):
    """Cost, heat value, margin, break-even and a plain statement of when the model does not pay off."""
    price = config.ELECTRICITY_CHF_PER_KWH
    cost = electricity_kwh * price
    heat_value = heat_used_kwh * price / config.HEAT_PUMP_COP
    margin = income_chf + heat_value - cost
    break_even = (cost - heat_value) / sold_h if sold_h else 0.0
    avg_price = income_chf / sold_h if sold_h else 0.0
    # highest electricity price at which income + heat value still cover the electricity
    net_kwh = electricity_kwh - heat_used_kwh / config.HEAT_PUMP_COP
    max_elec_price = income_chf / net_kwh if net_kwh > 0 else float("inf")
    statement = (
        f"Electricity costs {cost:,.0f} CHF, the heat used is worth {heat_value:,.0f} CHF. "
        f"The model does NOT pay off if computing sells for less than {break_even:.2f} CHF per server-hour "
        f"(achieved here: {avg_price:.2f} CHF), or if electricity costs more than "
        f"{max_elec_price:.2f} CHF/kWh at these computing prices (used: {price:.2f}). "
        "Hardware, installation, maintenance and network costs are NOT included: the margin per server-hour "
        f"({(margin / sold_h if sold_h else 0):.2f} CHF) must also pay for those.")
    return {"electricity_cost_chf": cost, "heat_value_chf": heat_value, "compute_income_chf": income_chf,
            "margin_chf": margin, "server_hours_sold": sold_h,
            "break_even_chf_per_server_hour": break_even, "avg_compute_price_chf_per_server_hour": avg_price,
            "max_electricity_price_chf_per_kwh": max_elec_price,
            "margin_chf_per_server_hour": margin / sold_h if sold_h else 0.0,
            "pays_off_before_hardware": margin > 0, "pay_off_statement": statement}


def job_outcomes(jobs, every):
    """Jobs done / missed and missed deadlines in % of finished jobs (a job misses if any of its tasks misses)."""
    done = missed = cancelled = 0
    for j in jobs:
        states = [every[x].state for x in j.task_ids if x in every]
        if any(s == MISSED for s in states):
            missed += 1
        elif states and all(s == DONE for s in states):
            done += 1
        elif any(s == CANCELLED for s in states):
            cancelled += 1
    return {"jobs_total": len(jobs), "jobs_done": done, "jobs_missed": missed, "jobs_cancelled": cancelled,
            "missed_deadlines_pct": _pct(missed, done + missed)}


def income_of(tasks):
    return sum(t.energy_kwh * config.COMPUTE_CHF_PER_SERVER_HOUR.get(t.priority, 0) for t in tasks)


# ---------------------------------------------------------------- summaries
def site_summary(engine):
    rows = []
    df = pd.DataFrame(engine.slot_rows)
    srv = pd.DataFrame(engine.server_rows)
    for sid, g in df.groupby("site_id", sort=False):
        demand, produced = g.demand_kwh.sum(), g.produced_kwh.sum()
        hours = server_hours(srv[srv.site_id == sid].to_dict("records"))
        rows.append({
            "site_id": sid, "servers": hours["servers"], "demand_kwh": demand, "produced_kwh": produced,
            "delivered_kwh": g.delivered_kwh.sum(), "dumped_kwh": g.dumped_kwh.sum(), "unmet_kwh": g.unmet_kwh.sum(),
            "coverage_pct": _pct(g.delivered_kwh.sum(), demand),
            "dumped_share_pct": _pct(g.dumped_kwh.sum(), produced),
            "utilisation_pct": hours["utilisation_pct"], "load_factor_pct": hours["load_factor_pct"],
            "server_running_h": hours["running_h"], "server_hours_sold": hours["sold_h"],
            "electricity_kwh": g.load_kw.sum() * config.SLOT_H,
            "final_tank_kwh": g.tank_kwh.iloc[-1]})
    return pd.DataFrame(rows)


def fleet_summary(engine):
    df = pd.DataFrame(engine.slot_rows)
    every = engine.all_tasks()
    tasks = every.values()
    real = [t for t in tasks if not t.filler]
    finished = [t for t in real if t.state in (DONE, MISSED)]
    missed = [t for t in real if t.state == MISSED]
    hours = server_hours(engine.server_rows)
    electricity = sum(t.energy_kwh for t in tasks)
    heat_used = df.delivered_kwh.sum()

    by_priority = {}
    for p in ("critical", "normal", "flexible"):
        fin = [t for t in finished if t.priority == p]
        by_priority[p] = _pct(sum(1 for t in fin if t.state == MISSED), len(fin))

    out = {
        "algorithm": engine.algorithm,
        "filler_enabled": config.FILLER_ENABLED,
        "slots": engine.now,
        "period_h": hours["period_h"],
        "servers": hours["servers"],
        "sites": len(engine.sites),
        "servers_per_site": hours["servers"] / len(engine.sites) if engine.sites else 0,
        "demand_kwh": df.demand_kwh.sum(),
        "delivered_kwh": heat_used,
        "coverage_pct": _pct(heat_used, df.demand_kwh.sum()),
        "unmet_kwh": df.unmet_kwh.sum(),
        "dumped_kwh": df.dumped_kwh.sum(),
        "utilisation_pct": hours["utilisation_pct"],
        "load_factor_pct": hours["load_factor_pct"],
        "server_running_h": hours["running_h"],
        **job_outcomes(engine.jobs.values(), every),
        "tasks_total": len(real),
        "tasks_done": sum(1 for t in real if t.state == DONE),
        "tasks_missed": len(missed),
        "tasks_cancelled": sum(1 for t in real if t.state == CANCELLED),
        "missed_tasks_pct": _pct(len(missed), len(finished)),
        "missed_tasks_pct_by_priority": by_priority,
        "filler_tasks": sum(1 for t in tasks if t.filler),
        "migrations": sum(1 for e in engine.events if e["kind"] == "migrated"),
        "pauses": sum(1 for e in engine.events if e["kind"] == "paused"),
        "electricity_kwh": electricity,
        **economics(electricity, heat_used, income_of(tasks), hours["sold_h"]),
    }
    return {k: (float(v) if hasattr(v, "item") else v) for k, v in out.items()}   # numpy -> plain numbers
