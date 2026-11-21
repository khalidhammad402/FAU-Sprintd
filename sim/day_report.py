"""
Detailed results for single days, taken from a full-year run (so the tank levels are realistic).

  python -m sim.day_report                                   # 2021-01-19 (winter) and 2021-07-17 (summer)
  python -m sim.day_report --days 2021-02-10 2021-08-03

Runs the year twice: with filler work (config default) and with only the customer jobs.
For each chosen day it writes results/days/<date>_hourly.csv and <date>_summary.json and prints a summary.
Heat is split into heat from customer jobs and heat from filler (background spot-market work).
"""
import argparse
import json
import os
from collections import defaultdict

import pandas as pd

import config
from core.data import load_all
from core.metrics import economics, job_outcomes, server_hours

DEFAULT_DAYS = ["2021-01-19", "2021-07-17"]


def run_year(filler, days):
    old = config.FILLER_ENABLED
    config.FILLER_ENABLED = filler
    from core.engine import Engine
    e = Engine(*load_all(), algorithm="greedy")
    slots_per_day = 24 * 60 // config.SLOT_MIN
    t0 = pd.Timestamp(e.times[0])
    wanted = {}
    for d in days:
        first = int((pd.Timestamp(d) - t0) / pd.Timedelta(minutes=config.SLOT_MIN))
        wanted.update({s: d for s in range(first, first + slots_per_day)})
    # per day: {(slot, site, kind): kWh electricity} with kind = job/filler, plus income by priority
    split = {d: defaultdict(float) for d in days}
    income = {d: defaultdict(float) for d in days}
    while not e.finished:
        slot = e.now
        if slot in wanted:
            before = {tid: t.energy_kwh for tid, t in e.all_tasks().items()}
            e.step()
            d = wanted[slot]
            for t in e.all_tasks().values():
                ran = t.energy_kwh - before.get(t.task_id, 0.0)
                if ran > 1e-12:
                    site = e.servers[t.server_id].site_id
                    split[d][(slot, site, "filler" if t.filler else "job")] += ran
                    income[d]["filler" if t.filler else t.priority] += \
                        ran * config.COMPUTE_CHF_PER_SERVER_HOUR.get(t.priority, 0)
        else:
            e.step()
    config.FILLER_ENABLED = old
    return e, split, income


def day_tables(e, split, day):
    rows = pd.DataFrame(e.slot_rows)
    rows = rows[rows.time.dt.strftime("%Y-%m-%d") == day].copy()
    sp = split[day]
    rows["job_elec_kwh"] = [sp.get((r.slot, r.site_id, "job"), 0.0) for r in rows.itertuples()]
    rows["filler_elec_kwh"] = [sp.get((r.slot, r.site_id, "filler"), 0.0) for r in rows.itertuples()]
    rows["heat_from_jobs_kwh"] = rows.job_elec_kwh * config.RECOVERY
    rows["heat_from_filler_kwh"] = rows.filler_elec_kwh * config.RECOVERY
    return rows


def summarise(e, rows, income, day):
    first, last = rows.slot.min(), rows.slot.max()
    ev = pd.DataFrame(e.events)
    ev = ev[(ev.slot >= first) & (ev.slot <= last + 1) & ~ev.filler]
    jobs_in = [j for j in e.jobs.values() if first <= j.arrival <= last]
    every = e.all_tasks()
    elec = rows.job_elec_kwh.sum() + rows.filler_elec_kwh.sum()
    by_site = rows.groupby("site_id").agg(
        demand=("demand_kwh", "sum"), heat_jobs=("heat_from_jobs_kwh", "sum"),
        heat_filler=("heat_from_filler_kwh", "sum"), delivered=("delivered_kwh", "sum"),
        dumped=("dumped_kwh", "sum"), unmet=("unmet_kwh", "sum"),
        tank_end=("tank_kwh", "last"))
    tank_start = {}
    prev = pd.DataFrame(e.slot_rows)
    prev = prev[prev.slot == first - 1].set_index("site_id").tank_kwh if first > 0 else None
    for sid in by_site.index:
        tank_start[sid] = float(prev[sid]) if prev is not None else 0.0
    by_site["tank_start"] = pd.Series(tank_start)
    by_site["coverage_pct"] = 100 * by_site.delivered / by_site.demand
    srv = [r for r in e.server_rows if first <= r["slot"] <= last]
    by_site["utilisation_pct"] = pd.Series({sid: server_hours([r for r in srv if r["site_id"] == sid])
                                            ["utilisation_pct"] for sid in by_site.index})
    hours = server_hours(srv)
    hourly = rows.assign(hour=rows.time.dt.hour).groupby("hour")[
        ["demand_kwh", "heat_from_jobs_kwh", "heat_from_filler_kwh", "dumped_kwh", "unmet_kwh"]].sum()
    money = economics(elec, rows.delivered_kwh.sum(), sum(income.values()), hours["sold_h"])
    cost, heat_value = money["electricity_cost_chf"], money["heat_value_chf"]
    jobs_out = job_outcomes(jobs_in, every)
    return {
        "day": day,
        "demand_kwh": rows.demand_kwh.sum(),
        "peak_demand_hour": int(hourly.demand_kwh.idxmax()), "peak_hour_demand_kwh": hourly.demand_kwh.max(),
        "lowest_demand_hour": int(hourly.demand_kwh.idxmin()),
        "heat_from_jobs_kwh": rows.heat_from_jobs_kwh.sum(),
        "heat_from_filler_kwh": rows.heat_from_filler_kwh.sum(),
        "delivered_kwh": rows.delivered_kwh.sum(), "dumped_kwh": rows.dumped_kwh.sum(),
        "unmet_kwh": rows.unmet_kwh.sum(),
        "coverage_pct": 100 * rows.delivered_kwh.sum() / rows.demand_kwh.sum(),
        "tank_start_kwh_total": sum(tank_start.values()), "tank_end_kwh_total": float(by_site.tank_end.sum()),
        "electricity_kwh": elec, "electricity_from_jobs_kwh": rows.job_elec_kwh.sum(),
        "utilisation_pct": hours["utilisation_pct"], "server_running_h": hours["running_h"],
        "server_hours_sold": hours["sold_h"],
        "electricity_cost_chf": cost, "heat_value_chf": heat_value,
        "compute_income_chf": dict(income), "compute_income_total_chf": sum(income.values()),
        "margin_chf": money["margin_chf"],
        "break_even_chf_per_server_hour": money["break_even_chf_per_server_hour"],
        "missed_deadlines_pct_of_arrived_jobs": jobs_out["missed_deadlines_pct"],
        "jobs_arrived": len(jobs_in),
        "jobs_arrived_by_type": pd.Series([j.name for j in jobs_in]).value_counts().to_dict(),
        "tasks_started": int((ev.kind == "started").sum()), "tasks_completed": int((ev.kind == "completed").sum()),
        "tasks_paused": int((ev.kind == "paused").sum()), "tasks_resumed": int((ev.kind == "resumed").sum()),
        "tasks_migrated": int((ev.kind == "migrated").sum()), "tasks_missed": int((ev.kind == "missed").sum()),
        "jobs_arrived_done_on_time": sum(all(every[t].state == "done" for t in j.task_ids) for j in jobs_in),
        "by_site": by_site.round(3).reset_index().to_dict("records"),
        "hourly": hourly.round(3).reset_index().to_dict("records"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", nargs="+", default=DEFAULT_DAYS)
    a = ap.parse_args()
    out = os.path.join(config.RESULTS_DIR, "days")
    os.makedirs(out, exist_ok=True)
    full, split, income = run_year(True, a.days)
    only, split_o, income_o = run_year(False, a.days)
    for d in a.days:
        rows = day_tables(full, split, d)
        s = summarise(full, rows, income[d], d)
        rows_o = day_tables(only, split_o, d)
        s_o = summarise(only, rows_o, income_o[d], d)
        s["jobs_only"] = {k: s_o[k] for k in ("coverage_pct", "unmet_kwh", "dumped_kwh", "heat_from_jobs_kwh",
                                              "tank_start_kwh_total", "tank_end_kwh_total", "electricity_kwh",
                                              "utilisation_pct", "tasks_paused", "tasks_migrated", "tasks_missed",
                                              "compute_income_total_chf", "margin_chf")}
        rows.to_csv(os.path.join(out, f"{d}_hourly.csv"), index=False)
        with open(os.path.join(out, f"{d}_summary.json"), "w") as f:
            json.dump(s, f, indent=1, default=float)
        print(f"\n=== {d} ===")
        print(json.dumps({k: v for k, v in s.items() if k not in ("by_site", "hourly")}, indent=1, default=float))
        print(pd.DataFrame(s["by_site"]).round(2).to_string(index=False))
        print(pd.DataFrame(s["hourly"]).round(2).to_string(index=False))
    print(f"\nResults in {out}/")


if __name__ == "__main__":
    main()
