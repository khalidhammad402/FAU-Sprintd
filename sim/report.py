"""
Results workbook with the key figures the problem statement asks for (must-have 3), per house and year.

  python -m sim.report                       # algorithm from config.py
  python -m sim.report --algorithm mpc

Runs the year twice on the active demand file (config.DEMAND_FILE):
  A. main scenario: settings of config.py (by default only the customer jobs of data/jobs.json)
  B. comparison:    the same plus unlimited filler jobs (a model that assumes unlimited jobs must say so)
and writes results/DigitalHeat_results_<algorithm>.xlsx with the sheets
  Key figures | Pay-off | Monthly | Daily | Job types | Scenarios | Assumptions | Definitions
Scenario A's raw files are also saved to results/<algorithm>/ (as python -m sim.run does).
Compare algorithms afterwards with: python -m sim.compare   (greedy ~2.5 min, mpc ~80 min)
"""
import argparse
import json
import os
import time

import pandas as pd

import config
from core import assumptions
from core.metrics import economics, fleet_summary, income_of, job_outcomes, server_hours, site_summary

def out_path(algorithm):
    return os.path.join(config.RESULTS_DIR, f"DigitalHeat_results_{algorithm}.xlsx")


def run(algorithm, filler):
    from sim.run import simulate
    old = config.FILLER_ENABLED
    config.FILLER_ENABLED = filler
    try:
        t0 = time.time()
        e = simulate(algorithm)
        print(f"  {'with' if filler else 'without'} filler: {e.now} slots in {time.time() - t0:.0f} s")
        return e
    finally:
        config.FILLER_ENABLED = old


def key_figures(e):
    """One row per house + one fleet row, exactly the must-have-3 list."""
    slots, srv = pd.DataFrame(e.slot_rows), pd.DataFrame(e.server_rows)
    tasks = list(e.all_tasks().values())
    site_of = {sid: s.site_id for sid, s in e.servers.items()}
    by_site_tasks = {sid: [t for t in tasks if t.server_id and site_of[t.server_id] == sid] for sid in e.sites}
    rows = []

    def row(name, n_servers, g, srv_rows, task_list, jobs_out=None):
        hours = server_hours(srv_rows)
        elec = g.load_kw.sum() * config.SLOT_H
        money = economics(elec, g.delivered_kwh.sum(), income_of(task_list), hours["sold_h"])
        demand = g.demand_kwh.sum()
        r = {"House / site": name, "Servers (1 kW)": n_servers,
             "Heat demand (kWh)": demand,
             "Heat from servers (kWh)": g.delivered_kwh.sum(),
             "Coverage: share of demand from server heat (%)": 100 * g.delivered_kwh.sum() / demand if demand else 0,
             "Backup heater (kWh)": g.unmet_kwh.sum(),
             "Heat produced (kWh)": g.produced_kwh.sum(),
             "Heat dumped (kWh)": g.dumped_kwh.sum(),
             "Dumped share of produced heat (%)": 100 * g.dumped_kwh.sum() / g.produced_kwh.sum()
             if g.produced_kwh.sum() else 0,
             "Server running hours (h)": hours["running_h"],
             "Utilisation: running h / (servers x 8760) (%)": hours["utilisation_pct"],
             "Load factor: avg load / capacity (%)": hours["load_factor_pct"],
             "Server-hours sold (1 kW full load)": hours["sold_h"],
             "Missed deadlines (% of jobs)": jobs_out["missed_deadlines_pct"] if jobs_out else None,
             "Jobs done": jobs_out["jobs_done"] if jobs_out else None,
             "Jobs missed": jobs_out["jobs_missed"] if jobs_out else None,
             "Electricity (kWh)": elec,
             "Electricity cost (CHF)": money["electricity_cost_chf"],
             "Value of heat used (CHF)": money["heat_value_chf"],
             "Computing income (CHF)": money["compute_income_chf"],
             "Margin before hardware (CHF)": money["margin_chf"],
             "Break-even computing price (CHF/server-hour)": money["break_even_chf_per_server_hour"],
             "Achieved computing price (CHF/server-hour)": money["avg_compute_price_chf_per_server_hour"],
             "Margin per server-hour (CHF)": money["margin_chf_per_server_hour"],
             "Final tank (kWh)": g.groupby("site_id").tank_kwh.last().sum()}
        rows.append(r)
        return money

    for sid, site in e.sites.items():
        row(f"{sid} ({site.type})", sum(1 for s in e.servers.values() if s.site_id == sid),
            slots[slots.site_id == sid], srv[srv.site_id == sid].to_dict("records"), by_site_tasks[sid])
    money = row("FLEET (all houses)", len(e.servers), slots, e.server_rows, tasks,
                job_outcomes(e.jobs.values(), e.all_tasks()))
    return pd.DataFrame(rows), money


def monthly(e):
    df = pd.DataFrame(e.slot_rows)
    df["month"] = df.time.dt.to_period("M").astype(str)
    g = df.groupby(["site_id", "month"]).agg(
        demand_kwh=("demand_kwh", "sum"), server_heat_kwh=("delivered_kwh", "sum"),
        backup_kwh=("unmet_kwh", "sum"), produced_kwh=("produced_kwh", "sum"), dumped_kwh=("dumped_kwh", "sum"),
        electricity_kwh=("load_kw", lambda s: s.sum() * config.SLOT_H), tank_end_kwh=("tank_kwh", "last"))
    g["coverage_pct"] = 100 * g.server_heat_kwh / g.demand_kwh
    g["electricity_cost_chf"] = g.electricity_kwh * config.ELECTRICITY_CHF_PER_KWH
    g["heat_value_chf"] = g.server_heat_kwh * config.ELECTRICITY_CHF_PER_KWH / config.HEAT_PUMP_COP
    fleet = g.groupby(level="month").sum()
    fleet["coverage_pct"] = 100 * fleet.server_heat_kwh / fleet.demand_kwh
    fleet["tank_end_kwh"] = g.groupby(level="month").tank_end_kwh.sum()
    fleet = pd.concat({"FLEET": fleet}, names=["site_id"])
    return pd.concat([g, fleet]).reset_index()


def daily(e):
    df = pd.DataFrame(e.slot_rows)
    df["date"] = df.time.dt.date
    g = df.groupby(["date", "site_id"]).agg(demand_kwh=("demand_kwh", "sum"), server_heat_kwh=("delivered_kwh", "sum"),
                                           backup_kwh=("unmet_kwh", "sum"), dumped_kwh=("dumped_kwh", "sum"),
                                           tank_end_kwh=("tank_kwh", "last"))
    return g.unstack("site_id").swaplevel(axis=1).sort_index(axis=1).round(3)


def job_types(e):
    path = os.path.join(config.DATA_DIR, config.JOBS_FILE)
    with open(path) as f:
        jtype = {j["job_id"]: (j.get("type", "?"), j["name"]) for j in json.load(f)}
    every = e.all_tasks()
    rows = []
    for j in e.jobs.values():
        tasks = [every[x] for x in j.task_ids if x in every]
        st = [t.state for t in tasks]
        rows.append({"type": jtype.get(j.job_id, ("submitted", j.name))[0],
                     "name": jtype.get(j.job_id, ("submitted", j.name))[1], "priority": j.priority,
                     "done": all(s == "done" for s in st), "missed": any(s == "missed" for s in st),
                     "tasks": len(tasks), "energy_kwh": sum(t.energy_kwh for t in tasks),
                     "income_chf": income_of(tasks),
                     "pauses": sum(1 for t in tasks for ev in t.events if ev[1] == "paused"),
                     "migrations": sum(1 for t in tasks for ev in t.events if ev[1] == "migrated")})
    df = pd.DataFrame(rows)
    g = df.groupby(["type", "name", "priority"]).agg(
        jobs=("done", "size"), jobs_done=("done", "sum"), jobs_missed=("missed", "sum"), tasks=("tasks", "sum"),
        electricity_kwh=("energy_kwh", "sum"), computing_income_chf=("income_chf", "sum"),
        pauses=("pauses", "sum"), migrations=("migrations", "sum")).reset_index()
    g["missed_deadlines_pct"] = 100 * g.jobs_missed / (g.jobs_done + g.jobs_missed).clip(lower=1)
    g["jobs_per_day"] = g.jobs / (e.n_slots * config.SLOT_H / 24)
    g["heat_produced_kwh"] = g.electricity_kwh * config.RECOVERY
    return g


def payoff(money):
    be, avg = money["break_even_chf_per_server_hour"], money["avg_compute_price_chf_per_server_hour"]
    rows = [("Break-even computing price (CHF per server-hour)", be),
            ("Achieved average computing price (CHF per server-hour)", avg),
            ("Margin per server-hour before hardware (CHF)", money["margin_chf_per_server_hour"]),
            ("Highest electricity price that still pays off at these computing prices (CHF/kWh)",
             money["max_electricity_price_chf_per_kwh"]),
            ("Electricity price used (CHF/kWh)", config.ELECTRICITY_CHF_PER_KWH),
            ("Pays off before hardware?", "yes" if money["pays_off_before_hardware"] else "NO")]
    head = pd.DataFrame(rows, columns=["Item", "Value"])
    # sensitivity: margin per server-hour for other electricity and computing prices
    sold = money["server_hours_sold"]
    elec_kwh = money["electricity_cost_chf"] / config.ELECTRICITY_CHF_PER_KWH
    heat_kwh = money["heat_value_chf"] * config.HEAT_PUMP_COP / config.ELECTRICITY_CHF_PER_KWH
    grid = {}
    for p in (0.15, 0.25, 0.33, 0.45, 0.60):
        col = {}
        for c in (0.10, 0.25, 0.50, 1.00, 2.36, avg):
            margin = c * sold + heat_kwh * p / config.HEAT_PUMP_COP - elec_kwh * p
            col[f"computing {c:.2f} CHF/server-h"] = margin / sold if sold else 0
        grid[f"electricity {p:.2f} CHF/kWh"] = col
    sens = pd.DataFrame(grid)
    sens.index.name = "Margin per server-hour (CHF), before hardware"
    return head, sens


def write(main, comp, algorithm, path=None):
    path = path or out_path(algorithm)
    kf, money = key_figures(main)
    kf_c, money_c = key_figures(comp)
    head, sens = payoff(money)
    fs, fs_c = fleet_summary(main), fleet_summary(comp)
    keys = ["coverage_pct", "unmet_kwh", "dumped_kwh", "utilisation_pct", "load_factor_pct", "missed_deadlines_pct",
            "electricity_kwh", "electricity_cost_chf", "heat_value_chf", "compute_income_chf", "margin_chf",
            "break_even_chf_per_server_hour", "filler_tasks", "migrations", "pauses"]
    scen = pd.DataFrame({"A: customer jobs only (data/jobs.json)": {k: fs[k] for k in keys},
                         "B: + unlimited filler jobs (assumption)": {k: fs_c[k] for k in keys}})
    scen.index.name = "Fleet, one year"
    defs = pd.DataFrame([
        ("Coverage", "Heat delivered to the building from servers (via the tank) / total heat demand. "
                     "The rest comes from a backup heater outside the model."),
        ("Heat dumped", "Server heat that did not fit into the full tank."),
        ("Utilisation", "Server running hours / (servers x hours in the year, 8,760). A server counts as running "
                        "in a 15-min slot when it has any load."),
        ("Load factor", "Average server load / capacity (energy view)."),
        ("Missed deadlines", "Jobs with at least one task that missed its deadline / jobs that finished."),
        ("Electricity cost", "Server electricity (kWh) x electricity price."),
        ("Value of heat used", "Heat delivered x electricity price / 2.5 (the heat replaces a heat pump)."),
        ("Computing income", "Task energy (kWh = 1 kW server-hours) x computing price of its priority."),
        ("Break-even", "(Electricity cost - value of heat used) / server-hours sold, in CHF per server-hour."),
        ("Server-hours sold", "Full-load server-hours: sum of load / capacity x hours (= kWh for 1 kW servers)."),
        ("Per-house income", "Allocated by the server where each task ran last (tasks that migrated count "
                             "fully at their last house). Fleet numbers are exact."),
        ("Not included", "Hardware, installation, maintenance, network: the margin must also pay for these."),
    ], columns=["Metric", "Definition"])
    info = pd.DataFrame([
        ("Generated", time.strftime("%Y-%m-%d %H:%M")), ("Demand file", config.DEMAND_FILE),
        ("Period", f"{main.time_of(0)} to {main.time_of(main.n_slots)}"), ("Algorithm", algorithm),
        ("Servers", f"{len(main.servers)} x 1 kW"), ("Tank per house", f"{config.TANK_KWH_DEFAULT} kWh"),
        ("Heat recovery", f"{config.RECOVERY:.0%}"), ("Electricity price", f"{config.ELECTRICITY_CHF_PER_KWH} CHF/kWh"),
        ("Jobs", f"{len(main.jobs)} from data/jobs.json (filler {'ON' if config.FILLER_ENABLED else 'OFF'} in A)"),
        ("Pay-off statement", fs["pay_off_statement"])], columns=["Item", "Value"])

    with pd.ExcelWriter(path, engine="openpyxl") as xw:
        info.to_excel(xw, sheet_name="Key figures", index=False)
        kf.round(2).to_excel(xw, sheet_name="Key figures", index=False, startrow=len(info) + 2)
        head.to_excel(xw, sheet_name="Pay-off", index=False)
        sens.round(3).to_excel(xw, sheet_name="Pay-off", startrow=len(head) + 2)
        monthly(main).round(2).to_excel(xw, sheet_name="Monthly", index=False)
        daily(main).to_excel(xw, sheet_name="Daily")
        job_types(main).round(2).to_excel(xw, sheet_name="Job types", index=False)
        scen.round(2).to_excel(xw, sheet_name="Scenarios")
        kf_c.round(2).to_excel(xw, sheet_name="Scenarios", index=False, startrow=len(scen) + 3)
        pd.DataFrame(assumptions.collect()).to_excel(xw, sheet_name="Assumptions", index=False)
        defs.to_excel(xw, sheet_name="Definitions", index=False)
        from openpyxl.utils import get_column_letter
        for ws in xw.book.worksheets:                         # readable column widths, frozen header
            for i, col in enumerate(ws.iter_cols(max_row=60), start=1):
                width = max(len(str(c.value)) if c.value is not None else 0 for c in col)
                ws.column_dimensions[get_column_letter(i)].width = min(60, max(10, width + 2))
            ws.freeze_panes = "B2" if ws.title in ("Monthly", "Daily", "Job types") else None
    return kf, money, scen, fs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--algorithm", default=config.ALGORITHM, choices=["greedy", "mpc"])
    a = ap.parse_args()
    from sim.run import save
    print(f"running {config.DEMAND_FILE} with {a.algorithm} ...")
    main_e = run(a.algorithm, config.FILLER_ENABLED)
    save(main_e, os.path.join(config.RESULTS_DIR, a.algorithm))
    comp_e = run(a.algorithm, True)
    kf, money, scen, fs = write(main_e, comp_e, a.algorithm)
    pd.set_option("display.width", 250)
    cols = ["House / site", "Servers (1 kW)", "Heat demand (kWh)", "Coverage: share of demand from server heat (%)",
            "Backup heater (kWh)", "Heat dumped (kWh)", "Utilisation: running h / (servers x 8760) (%)",
            "Missed deadlines (% of jobs)", "Electricity cost (CHF)", "Value of heat used (CHF)",
            "Computing income (CHF)", "Break-even computing price (CHF/server-hour)"]
    print(kf[cols].round(1).to_string(index=False))
    print("\n" + scen.round(2).to_string())
    print("\n" + fs["pay_off_statement"])
    print(f"\nwrote {out_path(a.algorithm)}")


if __name__ == "__main__":
    main()
