"""
Everything the case asks for, for the reference house, in one folder: submission/.

  python make_reference_case.py          # once: builds data/reference_house/ (needs a laptop measurement)
  python -m sim.submission               # year + January/July day + jobs + balance workbook + checklist (~2 min)
  python -m sim.submission --live        # also re-runs the live proof (broker + agent + scheduler, ~2 min)

Writes submission/:
  README.md            the brief's checklist, each item with its status and where the proof is
  1_jobs.md            must-have 1: job types, laptop measurement, scaling, jobs per day, unlimited background work
  2_live_log.txt       must-have 2: the scheduler pausing/resuming a real process on the heat signal (python -m live.proof)
  3_balance.xlsx       must-have 3: the yearly balance with live formulas + monthly table + jobs + days + assumptions
  key_figures.json     every number above, machine-readable
  day_<date>.csv/.json the January and the July demo day (hourly)
  ASSUMPTIONS.md       every assumption with its status and source
  measurement.json     the laptop measurement used
Raw simulation output goes to results/reference_house/.
"""
import argparse
import json
import os
import shutil

import pandas as pd

import config

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")            # not config.DATA_DIR: use_reference_house() changes that
REF = os.path.join(DATA, "reference_house")
OUT = os.path.join(ROOT, "submission")
RAW = os.path.join(config.RESULTS_DIR, "reference_house")
DEMAND = "reference_house_2025.csv"
JULY_DAY = "2025-07-16"
URGENT_SLACK_SLOTS = 32     # deadline-first: a waiting task must start once its slack is below 8 h (as in the
                            # university case). A paid deadline is worth more than a little heat.


def use_reference_house():
    config.DATA_DIR = REF                      # assumptions register + loaders read the reference case
    config.DEMAND_FILE = DEMAND
    config.FILLER_ENABLED = True
    config.URGENT_SLACK_SLOTS = URGENT_SLACK_SLOTS


def demo_days():
    d = pd.read_csv(os.path.join(REF, DEMAND), parse_dates=["timestamp"])
    jan = d[d.timestamp.dt.month == 1].groupby(d.timestamp.dt.date).H1.sum()
    return [str(jan.idxmax()), JULY_DAY]       # the coldest January day and a summer day


# ---------------------------------------------------------------------------------------------- simulation
def year(filler, days):
    from core.data import load_all
    from sim import day_report
    day_report.load_all = lambda: load_all(REF)
    return day_report.run_year(filler, days)


def job_table(e):
    with open(os.path.join(REF, "job_types.json")) as f:
        cat = json.load(f)
    with open(os.path.join(REF, "jobs.json")) as f:
        jobs = json.load(f)
    jtype = {j["job_id"]: j["type"] for j in jobs}
    every = e.all_tasks()
    n_days = (e.n_slots * config.SLOT_MIN) / (24 * 60)
    out = {jt["type"]: {"jobs": 0, "done": 0, "missed": 0} for jt in cat["job_types"]}
    for j in e.jobs.values():
        d = out[jtype[j.job_id]]
        st = [every[x].state for x in j.task_ids if x in every]
        d["jobs"] += 1
        d["done"] += all(s == "done" for s in st)
        d["missed"] += any(s == "missed" for s in st)
    rows = []
    for jt in cat["job_types"]:
        tasks = [(t, t.get("count", 1)) for t in jt["tasks"]]
        kw = cat["hardware"]["kw_per_gpu"]
        power = lambda t: t["power_kw"] if "power_kw" in t else t["gpus"] * kw          # noqa: E731
        d = out[jt["type"]]
        rows.append({
            "type": jt["type"], "name": jt["name"], "priority": jt["priority"],
            "tasks_per_job": sum(c for _, c in tasks),
            "runtime_min_per_task": " / ".join(str(t["runtime_min"]) for t, _ in tasks),
            "server_hours_per_job": round(sum(c * t["runtime_min"] / 60 for t, c in tasks), 2),
            "energy_kwh_per_job": round(sum(c * power(t) * t["runtime_min"] / 60 for t, c in tasks), 3),
            "interruptible": " / ".join("yes" if t.get("interruptible", True) else "no" for t, _ in tasks),
            "deadline_h": jt["deadline_h"], "jobs_per_day_planned": jt["jobs_per_day"],
            "jobs_in_year": d["jobs"], "jobs_per_day_actual": round(d["jobs"] / n_days, 1),
            "jobs_missed": d["missed"],
            "measured_on_laptop": "yes" if "measured" in jt else "no (open data)",
            "source": jt["source"]})
    return pd.DataFrame(rows), cat


def monthly(e):
    s = pd.DataFrame(e.slot_rows)
    s["month"] = s.time.dt.month
    m = s.groupby("month").agg(demand_kwh=("demand_kwh", "sum"), server_heat_kwh=("delivered_kwh", "sum"),
                               backup_kwh=("unmet_kwh", "sum"), dumped_kwh=("dumped_kwh", "sum"),
                               electricity_kwh=("load_kw", lambda x: x.sum() * config.SLOT_H))
    m["coverage_pct"] = 100 * m.server_heat_kwh / m.demand_kwh
    return m.reset_index()


def day_outputs(e, split, income, e_only, split_o, income_o, day):
    from sim.day_report import day_tables, summarise
    rows = day_tables(e, split, day)
    s = summarise(e, rows, income[day], day)
    s_o = summarise(e_only, day_tables(e_only, split_o, day), income_o[day], day)
    s["jobs_only"] = {k: s_o[k] for k in ("coverage_pct", "unmet_kwh", "dumped_kwh", "heat_from_jobs_kwh",
                                          "utilisation_pct", "tasks_paused", "tasks_migrated", "tasks_missed")}
    rows["hour"] = rows.time.dt.hour
    hourly = rows.groupby("hour").agg(
        demand_kwh=("demand_kwh", "sum"), heat_from_jobs_kwh=("heat_from_jobs_kwh", "sum"),
        heat_from_background_kwh=("heat_from_filler_kwh", "sum"), server_heat_used_kwh=("delivered_kwh", "sum"),
        dumped_kwh=("dumped_kwh", "sum"), backup_kwh=("unmet_kwh", "sum"), tank_end_kwh=("tank_kwh", "last"),
        server_load_kw=("load_kw", "mean")).round(3).reset_index()
    hourly.to_csv(os.path.join(OUT, f"day_{day}.csv"), index=False)
    with open(os.path.join(OUT, f"day_{day}.json"), "w") as f:
        json.dump({k: v for k, v in s.items() if k not in ("by_site", "hourly")}, f, indent=1, default=float)
    return s, hourly


# ---------------------------------------------------------------------------------------------- workbook
def workbook(k, month, jobs, days, assumptions, path):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    F = "Arial"
    blue, bold = Font(name=F, color="0000FF"), Font(name=F, bold=True)
    head = Font(name=F, bold=True, color="FFFFFF")
    fill = PatternFill("solid", fgColor="1F4E78")
    key = PatternFill("solid", fgColor="FFF2CC")
    wb = Workbook()
    ws = wb.active
    ws.title = "Balance"

    def put(r, label, value, fmt=None, font=None, note="", hi=False):
        ws.cell(r, 1, label).font = Font(name=F, bold=hi)
        c = ws.cell(r, 2, value)
        c.font = font or Font(name=F, bold=hi)
        if fmt:
            c.number_format = fmt
        if hi:
            c.fill = key
        ws.cell(r, 3, note).font = Font(name=F, color="595959", italic=True)

    ws["A1"] = "DigitalHeat: yearly balance of the reference house (Basel 2025)"
    ws["A1"].font = Font(name=F, bold=True, size=14)
    ws["A2"] = ("Blue = input or simulation result (python -m sim.submission). Black = formula. "
                "Yellow = the key figures the brief asks for. Change a blue input and everything recalculates.")
    ws["A2"].font = Font(name=F, italic=True)
    r = 4
    ws.cell(r, 1, "Inputs").font = bold
    put(5, "Servers per house (1 kW each)", k["servers"], "0", blue, "brief: one rack server = 1 kW")
    put(6, "Electricity price (CHF/kWh)", k["electricity_chf_per_kwh"], "0.0000", blue,
        "ElCom 2026, Basel, IWB, H4, total incl. all fees")
    put(7, "Heat pump efficiency (COP)", config.HEAT_PUMP_COP, "0.0", blue, "brief: heat value = price / 2.5")
    put(8, "Hours in the year", 8760, "#,##0", blue)
    put(9, "Heat recovered from server electricity", config.RECOVERY, "0%", blue, "brief: 80 %")
    put(10, "Tank (kWh usable)", k["tank_kwh"], "0", blue, "brief: 35 kWh, no losses")

    ws.cell(12, 1, "Simulation results (one year, 15-min steps)").font = bold
    put(13, "Heat demand (space heating + hot water), kWh", k["demand_kwh"], "#,##0", blue)
    put(14, "Server heat used by the house, kWh", k["delivered_kwh"], "#,##0", blue)
    put(15, "Heat from the backup heater, kWh", k["unmet_kwh"], "#,##0", blue, "outside the model")
    put(16, "Heat dumped (tank full), kWh", k["dumped_kwh"], "#,##0", blue)
    put(17, "Server electricity, kWh", k["electricity_kwh"], "#,##0", blue)
    put(18, "Server running hours (a server running anything)", k["server_running_h"], "#,##0", blue)
    put(19, "Server-hours sold (load / capacity x hours)", k["server_hours_sold"], "#,##0", blue)
    put(20, "Computing income, CHF", k["compute_income_chf"], "#,##0", blue,
        "cloud GPU prices per priority, see Assumptions")
    put(21, "Customer jobs", k["jobs_total"], "#,##0", blue)
    put(22, "Customer jobs that missed their deadline", k["jobs_missed"], "#,##0", blue)

    ws.cell(24, 1, "Key figures (brief, must-have 3)").font = bold
    put(25, "Servers per house", "=B5", "0", hi=True)
    put(26, "Share of heat demand covered by servers", "=B14/B13", "0.0%", hi=True, note="rest: backup heater")
    put(27, "Heat dumped, kWh", "=B16", "#,##0", hi=True)
    put(28, "Heat dumped, share of server heat", "=B16/(B14+B16)", "0.0%")
    put(29, "Utilisation (running hours / (servers x 8,760))", "=B18/(B5*B8)", "0.0%", hi=True)
    put(30, "Missed deadlines, % of jobs", "=B22/B21", "0.00%", hi=True)
    put(31, "Electricity cost, CHF", "=B17*B6", "#,##0", hi=True)
    put(32, "Computing income, CHF", "=B20", "#,##0", hi=True)
    put(33, "Value of the heat actually used, CHF", "=B14*B6/B7", "#,##0", note="replaces a heat pump")
    put(34, "Break-even computing price, CHF per server-hour", "=(B31-B33)/B19", "0.000", hi=True,
        note="(electricity cost - value of heat used) / server-hours sold")
    put(35, "Average computing price achieved, CHF per server-hour", "=B32/B19", "0.00")
    put(36, "Margin before hardware, CHF per year", "=B32-B31+B33", "#,##0")
    put(37, "Margin before hardware, CHF per server-hour", "=B36/B19", "0.00")
    put(38, "Electricity price at which it stops paying, CHF/kWh", "=B32/(B17-B14/B7)", "0.00")
    ws.cell(40, 1, "When the model does NOT pay off").font = bold
    ws.cell(41, 1, '="Not if computing sells below "&TEXT(B34,"0.00")&" CHF per server-hour (we assume "&'
                   'TEXT(B35,"0.00")&"), or if electricity costs more than "&TEXT(B38,"0.00")&" CHF/kWh (we use "&'
                   'TEXT(B6,"0.0000")&"). The margin of "&TEXT(B37,"0.00")&" CHF per server-hour must still pay for '
                   'the servers, installation, maintenance and network, which are not in this balance."')
    ws.cell(41, 1).alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells("A41:C43")
    ws.cell(45, 1, "Customer jobs alone (no background work) would cover").font = Font(name=F)
    ws.cell(45, 2, k["jobs_only_coverage_pct"] / 100).number_format = "0.0%"
    ws.cell(45, 2).font = blue
    ws.cell(45, 3, "second simulation with background work switched off").font = Font(name=F, color="595959",
                                                                                     italic=True)
    ws.column_dimensions["A"].width = 58
    ws.column_dimensions["B"].width = 16
    ws.column_dimensions["C"].width = 60
    for row in ws.iter_rows(min_row=5, max_row=38, max_col=1):
        for c in row:
            c.alignment = Alignment(wrap_text=False)

    def table(name, df, widths=None):
        t = wb.create_sheet(name)
        for j, col in enumerate(df.columns, 1):
            c = t.cell(1, j, col)
            c.font, c.fill = head, fill
            c.alignment = Alignment(wrap_text=True, vertical="top")
            t.column_dimensions[get_column_letter(j)].width = (widths or {}).get(col, 14)
        for i, row in enumerate(df.itertuples(index=False), 2):
            for j, v in enumerate(row, 1):
                c = t.cell(i, j, v)
                c.font = Font(name=F)
                if isinstance(v, float):
                    c.number_format = "#,##0.0"
        t.freeze_panes = "A2"
        return t

    t = table("Monthly", month)
    n = len(month) + 1
    t.cell(n + 1, 1, "Year").font = bold
    for j in range(2, 7):
        col = get_column_letter(j)
        t.cell(n + 1, j, f"=SUM({col}2:{col}{n})").number_format = "#,##0"
    t.cell(n + 1, 7, f"=C{n + 1}/B{n + 1}*100").number_format = "0.0"
    table("Jobs", jobs, {"name": 34, "source": 90})
    table("Days", days, {"figure": 44})
    table("Assumptions", assumptions, {"name": 34, "value": 26, "source": 110})
    wb.save(path)


# ---------------------------------------------------------------------------------------------- texts
def jobs_md(jobs, m, k):
    img = jobs[jobs.type == "image"].iloc[0]
    lines = [
        "# Must-have 1: workloads", "",
        f"{len(jobs)} job types. Five are sized from open data (Alibaba GPU cluster trace 2020, MLPerf / NVIDIA L4 "
        "datasheet, AWS prices); **image recognition** we run and measure on our own laptop.", "",
        "| Job type | Priority | Tasks per job | Runtime per task (min) | Energy per job (kWh) | Can be paused | "
        "Deadline (h) | Jobs per day | Jobs in 2025 | Missed |", "|---|---|---|---|---|---|---|---|---|---|"]
    for r in jobs.itertuples():
        lines.append(f"| {r.name} | {r.priority} | {r.tasks_per_job} | {r.runtime_min_per_task} | "
                     f"{r.energy_kwh_per_job} | {r.interruptible} | {r.deadline_h} | {r.jobs_per_day_actual} | "
                     f"{r.jobs_in_year:,} | {r.jobs_missed} |")
    lines += [
        "", f"**Total: {k['jobs_total']:,} customer jobs in 2025, {k['jobs_total'] / 365:.0f} per day.** "
        "Jobs per day per type: the `jobs_per_day` in `data/reference_house/job_types.json` (ASSUMPTION, sized "
        "so a few servers per house are busy; the arrival hours follow the trace). Each day the number is drawn "
        "around that value (Poisson), so the year is realistic but reproducible (seed 7).", "",
        "**Unlimited background work: yes, and we say so.** Customer jobs alone would cover only "
        f"**{k['jobs_only_coverage_pct']:.0f} %** of the heat. When the house needs heat and no customer job is "
        "waiting, the scheduler runs background work (embeddings, reranking, image, transcription sold at cloud "
        f"spot prices). We assume this work is always available. In 2025: {k['filler_tasks']:,} background tasks, "
        f"{k['background_share_pct']:.0f} % of the server electricity.", "",
        "## The job we run on our own machine", "",
        f"- Job: {m['job']}", f"- Laptop: {m['host']}, {m['cpu']}, {m['cores']} cores, on battery",
        f"- Measured {m['measured_at']}: **{m['images']:,} images in {m['runtime_s']:.0f} s "
        f"({m['images_per_s']:,.0f} images/s)**, accuracy {m['accuracy']:.4f}",
        f"- Power: battery discharge meter (Windows WMI BatteryStatus) = whole laptop: **{m['power_idle_w']:.1f} W "
        f"idle, {m['power_load_w']:.1f} W with the job**",
        f"- Energy: **{m['energy_wh']:.2f} Wh** for the run = {m['energy_per_image_j'] * 1000:.2f} mJ per image",
        f"- Scaling to the 1 kW reference server (ASSUMPTION): the same energy per image -> "
        f"{m['images_per_server_hour']:,.0f} images per server-hour. One job = "
        f"{m['job_definition']['server_minutes']} min of a 1 kW server = "
        f"{m['job_definition']['images_per_job']:,.0f} images ({m['job_definition']['laptop_seconds_per_job'] / 3600:.0f} "
        "h on our laptop). Whole-laptop power includes the screen etc., so the real server needs less: conservative.",
        f"- Can be paused: yes, the process is suspended and resumed (psutil) and keeps its progress "
        f"(see 2_live_log.txt). Deadline {img.deadline_h} h.", "",
        "Reproduce: `python -m live.measure` (laptop on battery), then `python make_reference_case.py` and "
        "`python -m sim.submission`."]
    return "\n".join(lines) + "\n"


def readme(k, days, live_ok):
    ok, part = "✅", "⚠️"
    d1, d2 = days
    rows = [
        ("A. Reference house", None, None),
        ("Weather Open-Meteo Basel 2025, hourly", ok, "`make_reference_house.py` -> `data/reference_house_2025.csv`"),
        ("Heating max(0, 10 x (20 - T) / 25.6) on heating days", ok,
         f"{k['heating_kwh']:,.0f} kWh heating (brief: about 27,000)"),
        ("Hot water 12 kWh per day, all year", ok, f"{k['hot_water_kwh']:,.0f} kWh; total {k['demand_kwh']:,.0f} kWh"),
        ("Tank 35 kWh usable, no losses", ok, "`data/reference_house/sites.csv`"),
        ("Electricity price ElCom 2026, IWB Basel, H4, flat", ok, f"{k['electricity_chf_per_kwh']} CHF/kWh "
                                                                  "(ElCom, see ASSUMPTIONS.md)"),
        ("Heat value = electricity price / 2.5", ok, "`3_balance.xlsx` row 33"),
        ("Server 1 kW, 80 % of the heat recovered", ok, "`config.py`"),
        ("B. Must-have 1: workloads", None, None),
        ("At least two job types", ok, f"{k['job_types']} types, `1_jobs.md`"),
        ("Runtime and energy per job", ok, "`1_jobs.md` table"),
        ("Interruptible or not, per job type", ok, "`1_jobs.md` table"),
        ("Deadline per job type", ok, "`1_jobs.md` table"),
        ("One job type runs on our machine, runtime measured", ok, "image recognition, `measurement.json`"),
        ("Its energy from a meter or runtime x power", ok, f"battery meter: {k['measured_wh']:.2f} Wh"),
        ("How it scales to the 1 kW server", ok, "`1_jobs.md`, scaling"),
        ("Jobs per day and where the number comes from", ok, f"{k['jobs_total'] / 365:.0f} per day, `1_jobs.md`"),
        ("Unlimited jobs stated", ok, "background work, `1_jobs.md`"),
        ("C. Must-have 2: scheduling", None, None),
        ("Distribute, pause, reschedule jobs over servers by heat demand", ok,
         f"{k['pauses']:,} pauses, {k['migrations']:,} moves in 2025"),
        ("Winter heating and summer hot water", ok, f"`day_{d1}.csv`, `day_{d2}.csv`"),
        ("Simple heat storage", ok, "tank model, `core/engine.py`"),
        ("What happens to a job whose heat is not needed", ok,
         "paused (interruptible) or kept running with the heat dumped (not interruptible / deadline near)"),
        ("Same scheduler code controls a real running job: pause and resume on the heat signal",
         ok if live_ok else part, "`2_live_log.txt` (`python -m live.proof`)" if live_ok else
         "run `python -m sim.submission --live`"),
        ("D. Must-have 3: balance per house and year", None, None),
        ("Servers per house", ok, f"{k['servers']}"),
        ("Share of heat demand covered (rest: backup heater)", ok, f"{k['coverage_pct']:.1f} %"),
        ("Heat dumped", ok, f"{k['dumped_kwh']:,.0f} kWh"),
        ("Utilisation = running hours / (servers x 8,760)", ok, f"{k['utilisation_pct']:.1f} %"),
        ("Missed deadlines in % of jobs", ok, f"{k['missed_deadlines_pct']:.2f} % ({k['jobs_missed']} of "
                                              f"{k['jobs_total']:,})"),
        ("Electricity cost and computing income", ok, f"CHF {k['electricity_cost_chf']:,.0f} / CHF "
                                                      f"{k['compute_income_chf']:,.0f}"),
        ("Break-even computing price (CHF per server-hour)", ok, f"{k['break_even_chf_per_server_hour']:.3f}"),
        ("Every assumption visible", ok, "`ASSUMPTIONS.md`, `3_balance.xlsx` sheet Assumptions"),
        ("When the model does not pay off", ok, "`3_balance.xlsx` row 41"),
        ("E. Presentation", None, None),
        ("Open with the key figures", ok, "table below"),
        ("Live demo: a January day", ok, f"`day_{d1}.csv` (coldest day of January 2025)"),
        ("Live demo: a July day", ok, f"`day_{d2}.csv`"),
        ("Live demo: an interrupted job on a real process", ok if live_ok else part, "`2_live_log.txt`"),
        ("F. Prototype", None, None),
        ("Working demonstrator running a real job under the scheduler", ok if live_ok else part,
         "`live/` (broker, agent, master)"),
        ("List of all assumptions", ok, "`ASSUMPTIONS.md`"),
        ("Reproducible: code in the repository", ok, "commands below"),
    ]
    out = ["# DigitalHeat: submission for the reference house", "",
           "Everything the case asks for, generated by one command from the code in this repository.", "",
           "## Key figures (reference house, Basel 2025)", "",
           "| | |", "|---|---|",
           f"| Servers per house | **{k['servers']} x 1 kW** |",
           f"| Heat demand covered by servers | **{k['coverage_pct']:.1f} %** ({k['delivered_kwh']:,.0f} of "
           f"{k['demand_kwh']:,.0f} kWh; the rest from the backup heater) |",
           f"| Heat dumped | **{k['dumped_kwh']:,.0f} kWh** ({k['dumped_share_pct']:.1f} % of the server heat) |",
           f"| Utilisation | **{k['utilisation_pct']:.1f} %** |",
           f"| Missed deadlines | **{k['missed_deadlines_pct']:.2f} %** of jobs ({k['jobs_missed']} of "
           f"{k['jobs_total']:,}) |",
           f"| Electricity cost | CHF {k['electricity_cost_chf']:,.0f} ({k['electricity_kwh']:,.0f} kWh at "
           f"{k['electricity_chf_per_kwh']} CHF/kWh) |",
           f"| Value of the heat used | CHF {k['heat_value_chf']:,.0f} |",
           f"| Computing income | CHF {k['compute_income_chf']:,.0f} ({k['avg_price']:.2f} CHF per server-hour) |",
           f"| **Break-even computing price** | **{k['break_even_chf_per_server_hour']:.3f} CHF per server-hour** |",
           "", f"> {k['pay_off_statement']}", "",
           "## Checklist (case brief)", "", "| # | Requirement | Status | Proof |", "|---|---|---|---|"]
    n = 0
    for text, status, proof in rows:
        if status is None:
            out.append(f"| | **{text}** | | |")
        else:
            n += 1
            out.append(f"| {n} | {text} | {status} | {proof} |")
    out += ["", "## Reproduce", "", "```", "python -m live.measure            # laptop on battery: measures the real job",
            "python make_reference_case.py      # data/reference_house/ (3 servers, 35 kWh tank, 2025 jobs)",
            "python -m sim.submission --live    # this folder", "```", "",
            "Live demo: `python -m live.broker`, `python -m live.agent --server-id H1-S1 --host localhost`, "
            "`python -m live.master --data-dir data/reference_house --start <date>`."]
    return "\n".join(out) + "\n"


# ---------------------------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="also re-run the live proof (broker + agent + scheduler)")
    a = ap.parse_args()
    if not os.path.exists(os.path.join(REF, "jobs.json")):
        raise SystemExit("run  python make_reference_case.py  first")
    use_reference_house()
    from core import assumptions
    from core.metrics import fleet_summary
    from sim.run import save
    os.makedirs(OUT, exist_ok=True)
    days = demo_days()

    print("year with background work ...")
    e, split, income = year(True, days)
    save(e, RAW)
    f = fleet_summary(e)
    print("year with customer jobs only ...")
    e_only, split_o, income_o = year(False, days)
    f_only = fleet_summary(e_only)

    jobs, cat = job_table(e)
    month = monthly(e)
    ref = pd.read_csv(os.path.join(DATA, "reference_house_2025_components.csv"))
    meas = next(jt["measured"] for jt in cat["job_types"] if "measured" in jt)
    with open(os.path.join(DATA, "measurements", f"{meas['host']}.json")) as fh:
        m = json.load(fh)
    shutil.copy(os.path.join(DATA, "measurements", f"{meas['host']}.json"), os.path.join(OUT, "measurement.json"))

    k = {**f, "electricity_chf_per_kwh": config.ELECTRICITY_CHF_PER_KWH,
         "tank_kwh": next(iter(e.sites.values())).tank_cap_kwh, "job_types": len(jobs),
         "jobs_only_coverage_pct": f_only["coverage_pct"], "measured_wh": m["energy_wh"],
         "dumped_share_pct": 100 * f["dumped_kwh"] / (f["delivered_kwh"] + f["dumped_kwh"]),
         "avg_price": f["avg_compute_price_chf_per_server_hour"],
         "background_share_pct": 100 * (1 - f_only["electricity_kwh"] / f["electricity_kwh"]),
         "heating_kwh": float(ref.space_heating_kwh.sum()), "hot_water_kwh": float(ref.hot_water_kwh.sum()),
         "demo_days": days}

    day_rows = {}
    for d in days:
        s, _ = day_outputs(e, split, income, e_only, split_o, income_o, d)
        day_rows[d] = {
            "Heat demand, kWh": s["demand_kwh"], "Server heat used, kWh": s["delivered_kwh"],
            "  from customer jobs, kWh": s["heat_from_jobs_kwh"],
            "  from background work, kWh": s["heat_from_filler_kwh"],
            "Backup heater, kWh": s["unmet_kwh"], "Heat dumped, kWh": s["dumped_kwh"],
            "Coverage, %": s["coverage_pct"], "Tank at start / end, kWh":
                f"{s['tank_start_kwh_total']:.1f} / {s['tank_end_kwh_total']:.1f}",
            "Utilisation, %": s["utilisation_pct"], "Jobs arrived": s["jobs_arrived"],
            "Tasks paused / resumed / moved": f"{s['tasks_paused']} / {s['tasks_resumed']} / {s['tasks_migrated']}",
            "Tasks missed": s["tasks_missed"], "Coverage with customer jobs only, %": s["jobs_only"]["coverage_pct"]}
    days_df = pd.DataFrame(day_rows).reset_index().rename(columns={"index": "figure"})

    if a.live:
        from live import proof
        proof.run(os.path.join(OUT, "2_live_log.txt"))
        use_reference_house()                    # the proof switches background work off for its demo
    live_ok = os.path.exists(os.path.join(OUT, "2_live_log.txt"))

    reg = pd.DataFrame(assumptions.collect())
    with open(os.path.join(OUT, "ASSUMPTIONS.md"), "w", encoding="utf-8") as fh:
        fh.write(assumptions.to_markdown(reg.to_dict("records")))
    workbook(k, month, jobs, days_df, reg, os.path.join(OUT, "3_balance.xlsx"))
    with open(os.path.join(OUT, "1_jobs.md"), "w", encoding="utf-8") as fh:
        fh.write(jobs_md(jobs, m, k))
    with open(os.path.join(OUT, "README.md"), "w", encoding="utf-8") as fh:
        fh.write(readme(k, days, live_ok))
    with open(os.path.join(OUT, "key_figures.json"), "w") as fh:
        json.dump(k, fh, indent=1, default=float)
    print(json.dumps({x: (round(v, 3) if isinstance(v, float) else v) for x, v in k.items()
                      if not isinstance(v, (dict, list))}, indent=1, default=str))
    print(f"wrote {OUT}/")


if __name__ == "__main__":
    main()
