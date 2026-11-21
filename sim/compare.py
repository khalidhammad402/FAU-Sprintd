"""
Final comparison of the two scheduling algorithms, built from their results workbooks.

  python -m sim.report --algorithm greedy     # ~2.5 min  -> results/DigitalHeat_results_greedy.xlsx
  python -m sim.report --algorithm mpc        # ~80 min   -> results/DigitalHeat_results_mpc.xlsx
  python -m sim.compare                       #           -> results/DigitalHeat_comparison.xlsx

Sheets: Summary (fleet, both scenarios, greedy vs MPC with difference) | Per house | Monthly | About
Run times are read from results/<algorithm>_run.log when present (python -m sim.report ... > that file).
"""
import os
import re

import pandas as pd

import config

ALGOS = {"greedy": "Greedy (rule-based)", "mpc": "MPC / LP (24 h look-ahead optimisation)"}
OUT = os.path.join(config.RESULTS_DIR, "DigitalHeat_comparison.xlsx")
FLEET = "FLEET (all houses)"
# metric -> True if higher is better, False if lower is better, None if neutral
METRICS = {
    "Coverage: share of demand from server heat (%)": True,
    "Heat from servers (kWh)": True,
    "Backup heater (kWh)": False,
    "Heat dumped (kWh)": False,
    "Dumped share of produced heat (%)": False,
    "Utilisation: running h / (servers x 8760) (%)": True,
    "Load factor: avg load / capacity (%)": True,
    "Server running hours (h)": None,
    "Server-hours sold (1 kW full load)": None,
    "Missed deadlines (% of jobs)": False,
    "Jobs missed": False,
    "Electricity (kWh)": None,
    "Electricity cost (CHF)": None,
    "Value of heat used (CHF)": True,
    "Computing income (CHF)": True,
    "Margin before hardware (CHF)": True,
    "Break-even computing price (CHF/server-hour)": False,
    "Margin per server-hour (CHF)": True,
    "Final tank (kWh)": None,
}


def load(algo):
    path = os.path.join(config.RESULTS_DIR, f"DigitalHeat_results_{algo}.xlsx")
    if not os.path.exists(path):
        raise SystemExit(f"missing {path}: run  python -m sim.report --algorithm {algo}")
    x = pd.ExcelFile(path)

    def table(sheet):
        """The per-house table: starts at the row whose first cell is 'House / site'."""
        raw = pd.read_excel(x, sheet, header=None)
        start = raw.index[raw[0] == "House / site"][0]
        return pd.read_excel(x, sheet, skiprows=start)

    info = pd.read_excel(x, "Key figures", nrows=10)
    kf_a, kf_b = table("Key figures"), table("Scenarios")
    monthly = pd.read_excel(x, "Monthly")
    secs = {}
    log = os.path.join(config.RESULTS_DIR, f"{algo}_run.log")
    if os.path.exists(log):
        with open(log, encoding="utf-8", errors="ignore") as f:
            for m in re.finditer(r"(without|with) filler: \d+ slots in (\d+) s", f.read()):
                secs["A" if m.group(1) == "without" else "B"] = int(m.group(2))
    return {"info": info, "A": kf_a, "B": kf_b, "monthly": monthly, "secs": secs}


def better(metric, g, m):
    up = METRICS.get(metric)
    if up is None or pd.isna(g) or pd.isna(m) or abs(g - m) < 1e-9 * max(1, abs(g)):
        return "-" if up is None or pd.isna(g) or pd.isna(m) else "equal"
    return "MPC" if (m > g) == up else "Greedy"


def main():
    r = {a: load(a) for a in ALGOS}
    rows = []
    for scen, label in (("A", "A: customer jobs only"), ("B", "B: + unlimited filler jobs")):
        g = r["greedy"][scen].set_index("House / site").loc[FLEET]
        m = r["mpc"][scen].set_index("House / site").loc[FLEET]
        for metric in METRICS:
            gv, mv = g.get(metric), m.get(metric)
            rows.append({"Scenario": label, "Metric (fleet, one year)": metric, "Greedy": gv, "MPC / LP": mv,
                         "MPC - Greedy": (mv - gv) if pd.notna(gv) and pd.notna(mv) else None,
                         "Better": better(metric, gv, mv)})
        rows.append({"Scenario": label, "Metric (fleet, one year)": "Run time for the year (s)",
                     "Greedy": r["greedy"]["secs"].get(scen), "MPC / LP": r["mpc"]["secs"].get(scen),
                     "MPC - Greedy": None, "Better": "Greedy"})
    summary = pd.DataFrame(rows)

    per_house = []
    for scen, label in (("A", "A: customer jobs only"), ("B", "B: + unlimited filler jobs")):
        g, m = (r[a][scen].set_index("House / site") for a in ALGOS)
        for house in g.index:
            for metric in ("Coverage: share of demand from server heat (%)", "Backup heater (kWh)",
                           "Heat dumped (kWh)", "Utilisation: running h / (servers x 8760) (%)",
                           "Electricity cost (CHF)", "Value of heat used (CHF)"):
                gv, mv = g.loc[house, metric], m.loc[house, metric]
                per_house.append({"Scenario": label, "House / site": house, "Metric": metric, "Greedy": gv,
                                  "MPC / LP": mv, "MPC - Greedy": mv - gv, "Better": better(metric, gv, mv)})
    per_house = pd.DataFrame(per_house)

    mg, mm = (r[a]["monthly"].query("site_id == 'FLEET'").set_index("month") for a in ALGOS)
    monthly = pd.DataFrame({
        "Demand (kWh)": mg.demand_kwh,
        "Coverage greedy (%)": mg.coverage_pct, "Coverage MPC (%)": mm.coverage_pct,
        "Backup greedy (kWh)": mg.backup_kwh, "Backup MPC (kWh)": mm.backup_kwh,
        "Dumped greedy (kWh)": mg.dumped_kwh, "Dumped MPC (kWh)": mm.dumped_kwh,
        "Electricity greedy (kWh)": mg.electricity_kwh, "Electricity MPC (kWh)": mm.electricity_kwh})

    gA = r["greedy"]["A"].set_index("House / site").loc[FLEET]
    ceiling = 100 * gA["Electricity (kWh)"] * config.RECOVERY / gA["Heat demand (kWh)"]
    about = pd.DataFrame([
        ("Greedy", "Every 15-min slot: orders tasks (pinned > critical > urgent > normal > flexible, least slack "
                   "first) and places them where heat is wanted, keeping each tank about half full. Fast, no "
                   "look-ahead."),
        ("MPC / LP", "Every 15-min slot: solves a linear program over the next 24 h (meet demand > avoid dumping > "
                     "keep a 3 kWh tank buffer > save power) to choose a heat target per house, then the same "
                     "greedy step places the tasks. Uses perfect knowledge of the next 24 h of demand "
                     "(FORECAST = 'perfect'); it only knows jobs that have already arrived. It is an LP "
                     "(continuous), not a mixed-integer program: task placement stays in the greedy step."),
        ("Scenario A", "Only the customer jobs of data/jobs.json (the realistic case)."),
        ("Scenario B", "Plus unlimited filler jobs whenever heat is needed (an assumption that must be stated)."),
        ("Ceiling in A", f"The jobs use {gA['Electricity (kWh)']:,.0f} kWh of electricity -> at most "
                         f"{gA['Electricity (kWh)'] * config.RECOVERY:,.0f} kWh of heat for "
                         f"{gA['Heat demand (kWh)']:,.0f} kWh of demand: no algorithm can cover more than "
                         f"{ceiling:.1f} % with these jobs. Coverage in A is limited by job volume, not by the "
                         "algorithm or the servers."),
        ("Settings", f"{r['greedy']['info'].set_index('Item').loc['Demand file', 'Value']}, "
                     f"{r['greedy']['info'].set_index('Item').loc['Servers', 'Value']}, "
                     f"tank {r['greedy']['info'].set_index('Item').loc['Tank per house', 'Value']}, "
                     f"electricity {r['greedy']['info'].set_index('Item').loc['Electricity price', 'Value']}"),
    ], columns=["Item", "Explanation"])

    with pd.ExcelWriter(OUT, engine="openpyxl") as xw:
        summary.round(3).to_excel(xw, sheet_name="Summary", index=False)
        per_house.round(3).to_excel(xw, sheet_name="Per house", index=False)
        monthly.round(2).to_excel(xw, sheet_name="Monthly")
        about.to_excel(xw, sheet_name="About", index=False)
        from openpyxl.utils import get_column_letter
        for ws in xw.book.worksheets:
            for i, col in enumerate(ws.iter_cols(max_row=80), start=1):
                width = max(len(str(c.value)) if c.value is not None else 0 for c in col)
                ws.column_dimensions[get_column_letter(i)].width = min(70, max(10, width + 2))
            ws.freeze_panes = "A2"
    pd.set_option("display.width", 220)
    print(summary.round(2).to_string(index=False))
    print(f"\nceiling for scenario A: {ceiling:.1f} % coverage")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
