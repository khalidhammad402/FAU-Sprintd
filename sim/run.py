"""
Offline simulation over the whole demand file.

  python -m sim.run                      # algorithm from config.py
  python -m sim.run --algorithm mpc
  python -m sim.run --algorithm both     # greedy and mpc side by side
  python -m sim.run --demand data/my.xlsx
"""
import argparse
import json
import os
import time

import pandas as pd

import config
from core import assumptions
from core.data import load_all
from core.engine import Engine
from core.metrics import fleet_summary, site_summary


def simulate(algorithm, demand_file=None):
    times, demand, sites, servers, jobs, tasks = load_all(demand_file=demand_file)
    return Engine(times, demand, sites, servers, jobs, tasks, algorithm=algorithm).run()


def task_table(engine):
    rows = []
    for t in engine.all_tasks().values():
        rows.append({"task_id": t.task_id, "job_id": t.job_id, "name": t.name, "priority": t.priority,
                     "filler": t.filler, "state": t.state, "power_kw": t.power_kw, "threads": t.threads,
                     "runtime_min": t.runtime_slots * config.SLOT_MIN, "interruptible": t.interruptible,
                     "depends_on": ",".join(t.depends_on), "arrival": engine.time_of(t.arrival),
                     "deadline": engine.time_of(t.deadline),
                     "finished": engine.time_of(t.finished_slot) if t.finished_slot is not None else None,
                     "server_id": t.server_id, "energy_kwh": t.energy_kwh, "heat_kwh": t.heat_kwh})
    return pd.DataFrame(rows)


def save(engine, out):
    os.makedirs(out, exist_ok=True)
    pd.DataFrame(engine.slot_rows).to_csv(os.path.join(out, "timeline.csv"), index=False)
    pd.DataFrame(engine.server_rows).to_csv(os.path.join(out, "servers_timeline.csv"), index=False)
    pd.DataFrame(engine.events).to_csv(os.path.join(out, "events.csv"), index=False)
    task_table(engine).to_csv(os.path.join(out, "tasks.csv"), index=False)
    sites = site_summary(engine)
    sites.to_csv(os.path.join(out, "summary_sites.csv"), index=False)
    fleet = fleet_summary(engine)
    with open(os.path.join(out, "summary_fleet.json"), "w") as f:
        json.dump(fleet, f, indent=1, default=float)
    pd.DataFrame(assumptions.collect()).to_csv(os.path.join(out, "assumptions.csv"), index=False)
    return sites, fleet


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--algorithm", default=config.ALGORITHM, choices=["greedy", "mpc", "both"])
    ap.add_argument("--demand", default=None)
    a = ap.parse_args()
    pd.set_option("display.width", 200)
    algos = ["greedy", "mpc"] if a.algorithm == "both" else [a.algorithm]
    fleets = {}
    for algo in algos:
        t0 = time.time()
        engine = simulate(algo, a.demand)
        sites, fleet = save(engine, os.path.join(config.RESULTS_DIR, algo))
        fleets[algo] = fleet
        print(f"\n=== {algo}  ({engine.now} slots, {time.time() - t0:.0f} s) ===")
        print(sites.round(1).to_string(index=False))
        for k, v in fleet.items():
            if k != "pay_off_statement":
                print(f"  {k:38s} {round(v, 2) if isinstance(v, float) else v}")
        print("\n  " + fleet["pay_off_statement"])
        flagged = [r for r in assumptions.collect() if r["status"] in ("MOCK", "ASSUMPTION")]
        print(f"\n  {len(flagged)} values are ASSUMPTION or MOCK: see {config.RESULTS_DIR}/{algo}/assumptions.csv "
              "or ASSUMPTIONS.md")
    if len(fleets) == 2:
        keys = ["coverage_pct", "unmet_kwh", "dumped_kwh", "utilisation_pct", "missed_deadlines_pct",
                "migrations", "electricity_kwh", "break_even_chf_per_server_hour"]
        cmp = pd.DataFrame({algo: {k: fleets[algo][k] for k in keys} for algo in fleets})
        cmp.to_csv(os.path.join(config.RESULTS_DIR, "comparison.csv"))
        print("\n=== greedy vs mpc ===\n" + cmp.round(2).to_string())
    print(f"\nResults in {config.RESULTS_DIR}/")


if __name__ == "__main__":
    main()
