"""
Run the university scenario (make_university.py) for a whole year and save what the jury workbook needs.

  python -m sim.university --algorithm greedy     # ~2 min
  python -m sim.university --algorithm mpc        # longer (one LP per 15-min slot)

Writes results/university/<algorithm>/: the usual raw files (timeline.csv ...) and jury.json with
  physical year balance, server hours (running / sold, per customer group), missed deadlines, monthly table.
Money is NOT computed here: tools/make_jury_excel.py does it with live Excel formulas from these physical figures.
"""
import argparse
import json
import os
import time

import pandas as pd

import config
from core.data import load_all
from core.engine import Engine
from core.metrics import job_outcomes, server_hours

DATA = os.path.join(config.DATA_DIR, "university")


URGENT_SLACK_SLOTS = 32     # deadline-first: a batch task must start once its slack is below 8 h. Tested:
                            # 1 h -> 3.2 % jobs missed, 4 h -> 0.4 %, 8 h -> 0.01 %; coverage unchanged (20.6 %),
                            # dumped heat 2.8 % -> 5.2 % of produced (summer). A paid SLA is worth more than the heat.


def run(algorithm):
    config.FILLER_ENABLED = False                     # only the university's and external customers' jobs
    config.URGENT_SLACK_SLOTS = URGENT_SLACK_SLOTS
    t0 = time.time()
    e = Engine(*load_all(DATA, demand_file=os.path.join(DATA, "demand.csv")), algorithm=algorithm).run()
    return e, time.time() - t0


def summarise(e, seconds, algorithm):
    slots = pd.DataFrame(e.slot_rows)
    hours = server_hours(e.server_rows)
    with open(os.path.join(DATA, "jobs.json")) as f:
        jobs = json.load(f)
    customer = {j["job_id"]: j["customer"] for j in jobs}
    jtype = {j["job_id"]: j["type"] for j in jobs}
    every = e.all_tasks()
    sold_by_group, sold_by_type = {}, {}
    for t in every.values():
        g = customer.get(t.job_id, "other")
        sold_by_group[g] = sold_by_group.get(g, 0.0) + t.energy_kwh          # 1 kW servers: kWh = server-hours
        k = jtype.get(t.job_id, "other")
        sold_by_type[k] = sold_by_type.get(k, 0.0) + t.energy_kwh
    by_type = {}
    for j in e.jobs.values():
        k = jtype.get(j.job_id, "other")
        st = [every[x].state for x in j.task_ids if x in every]
        d = by_type.setdefault(k, {"jobs": 0, "done": 0, "missed": 0})
        d["jobs"] += 1
        d["done"] += all(s == "done" for s in st)
        d["missed"] += any(s == "missed" for s in st)
    slots["month"] = slots.time.dt.month
    monthly = slots.groupby("month").agg(demand_kwh=("demand_kwh", "sum"), server_heat_kwh=("delivered_kwh", "sum"),
                                         backup_kwh=("unmet_kwh", "sum"), dumped_kwh=("dumped_kwh", "sum"),
                                         produced_kwh=("produced_kwh", "sum"),
                                         electricity_kwh=("load_kw", lambda s: s.sum() * config.SLOT_H))
    out = {
        "algorithm": algorithm, "run_seconds": round(seconds),
        "servers": hours["servers"], "period_h": hours["period_h"],
        "tank_kwh": next(iter(e.sites.values())).tank_cap_kwh,
        "demand_kwh": slots.demand_kwh.sum(), "server_heat_kwh": slots.delivered_kwh.sum(),
        "backup_kwh": slots.unmet_kwh.sum(), "dumped_kwh": slots.dumped_kwh.sum(),
        "produced_kwh": slots.produced_kwh.sum(), "final_tank_kwh": slots.tank_kwh.iloc[-1],
        "it_electricity_kwh": slots.load_kw.sum() * config.SLOT_H,
        "server_running_h": hours["running_h"], "server_hours_sold": hours["sold_h"],
        "utilisation_pct": hours["utilisation_pct"], "load_factor_pct": hours["load_factor_pct"],
        "sold_h_by_group": sold_by_group, "sold_h_by_type": sold_by_type, "jobs_by_type": by_type,
        **job_outcomes(e.jobs.values(), every),
        "pauses": sum(1 for x in e.events if x["kind"] == "paused"),
        "monthly": monthly.reset_index().to_dict("records"),
    }
    return {k: (float(v) if hasattr(v, "item") else v) for k, v in out.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--algorithm", default="greedy", choices=["greedy", "mpc"])
    a = ap.parse_args()
    from sim.run import save
    e, secs = run(a.algorithm)
    out = os.path.join(config.RESULTS_DIR, "university", a.algorithm)
    save(e, out)
    s = summarise(e, secs, a.algorithm)
    with open(os.path.join(out, "jury.json"), "w") as f:
        json.dump(s, f, indent=1, default=float)
    print(json.dumps({k: (round(v, 2) if isinstance(v, float) else v) for k, v in s.items() if k != "monthly"},
                     indent=1, default=float))
    print(f"wrote {out}/jury.json")


if __name__ == "__main__":
    main()
