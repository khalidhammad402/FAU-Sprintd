"""
Every assumption of the model in one place, with its current value, source and status.

  python -m core.assumptions          # writes ASSUMPTIONS.md (and prints it)

sim.run also saves this list as results/<algorithm>/assumptions.csv next to the key figures, so every
result shows exactly which values produced it. Values are read live from config.py, data/job_types.json
and the input files, so the list cannot go out of date.

Status:
  BRIEF       given by the case brief
  SOURCE      taken from a named public source
  ASSUMPTION  our own choice: replace when a better number exists
  MOCK        generated test input: MUST be replaced for valid results
  LIMIT       simplification / not modelled
"""
import json
import os

import pandas as pd

import config


def _job_types():
    path = os.path.join(config.DATA_DIR, "job_types.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def _servers():
    path = os.path.join(config.DATA_DIR, config.SERVERS_FILE)
    return pd.read_csv(path) if os.path.exists(path) else None


def collect():
    a = []

    def add(area, name, value, status, source):
        a.append({"area": area, "name": name, "value": value, "status": status, "source": source})

    # --- demand and site
    meter = config.DEMAND_FILE == "demand - latest.xlsx"
    reference = config.DEMAND_FILE.startswith("reference_house")
    if reference:
        add("demand", "Demand file", config.DEMAND_FILE, "BRIEF",
            "Case reference house: Basel 2025 hourly profile provided with the case (Open-Meteo "
            "temperature_2m, 47.56 N 7.55 E grid point), heating max(0, 10 kW x (20 - T) / 25.6) + hot water "
            "12 kWh/day (0.5 kWh every hour). 26,927 + 4,380 = 31,307 kWh/year. Built by make_reference_house.py.")
        add("demand", "Heating-day rule in the provided file", "per hour (hour T < 12 C)", "BRIEF",
            "The brief text says per day (24-h mean < 12 C, 206 days); the provided file applies it per hour. "
            "Difference: 76 kWh/year (0.3 %). The file is used unchanged so results compare with other teams.")
        add("demand", "Hourly -> 15-min", "each hour split evenly over 4 slots", "ASSUMPTION",
            "Hot water is spread evenly over the day (0.5 kWh/h), as in the provided file.")
    else:
        add("demand", "Demand file", config.DEMAND_FILE, "MOCK" if meter else "ASSUMPTION",
            "Each value = heat needed in that 15-min slot (kWh). " +
            ("This file holds household ELECTRICITY meter data (Sparte Strom, 2021-2025 of one house placed side "
             "by side as 5 'sites'), not heat demand." if meter else
             "Must be the brief's reference-house profile for valid results."))
        add("demand", "Timestamp meaning", "start of the 15-min interval", "ASSUMPTION",
            "Meter exports may label the end of the interval instead (15-min shift).")
        add("demand", "Clock changes", "missing slots interpolated", "LIMIT",
            "March: missing hour filled by interpolation; October: the repeated hour is in the file only once.")
    add("site", "Tank capacity (default)", f"{config.TANK_KWH_DEFAULT} kWh", "BRIEF",
        "Brief: 35 kWh usable (1,000 l, 30 K spread), no losses. Per-site values in sites.csv.")
    add("site", "Tank level at start", f"{config.TANK_START_FRACTION:.0%} of capacity", "ASSUMPTION", "Empty on 1 Jan.")
    add("site", "Tank losses", "none", "BRIEF", "Brief: no losses.")
    add("site", "Site coordinates, types, owners", "generated", "MOCK", "make_mock_data.py")

    # --- servers and physics
    srv = _servers()
    if srv is not None:
        add("servers", "Servers", f"{len(srv)} servers, {srv.capacity_kw.sum():g} kW in total, sizes "
            f"{sorted(srv.capacity_kw.unique().tolist())} kW; per site: "
            f"{srv.groupby('site_id').size().to_dict()}", "ASSUMPTION",
            "From servers.csv. Brief reference server = 1 kW; servers per house is the decision to test "
            "(make_mock_data.py sizes them to each site's peak with factors 1.0/0.75/1.2/0.85).")
    add("physics", "Heat per kW of electricity", "1 kW -> 1 kW heat", "BRIEF", "Brief: 1 kW server ~ 1 kW heat.")
    add("physics", "Heat recovery", f"{config.RECOVERY:.0%}", "BRIEF", "Brief: 80 % recoverable into water.")
    add("physics", "Heat pump", "none (heat used directly)", "BRIEF", "Brief simplification.")

    # --- economics
    add("economics", "Electricity price", f"{config.ELECTRICITY_CHF_PER_KWH} CHF/kWh",
        "SOURCE" if abs(config.ELECTRICITY_CHF_PER_KWH - 0.3325) < 1e-9 else "ASSUMPTION",
        "ElCom 2026, Basel, IWB, H4, Standard: total 33.25 Rp./kWh = grid 11.41 + metering 1.20 + energy 10.89 "
        "+ levies 7.44 + grid surcharge 2.30 (strompreis.elcom.admin.ch/municipality/2701?period=2026&category=H4).")
    add("economics", "Value of heat", f"electricity price / {config.HEAT_PUMP_COP}", "BRIEF",
        "Brief: heat replaces a heat pump with efficiency 2.5.")
    for p, usd in config.GPU_HOUR_USD.items():
        add("economics", f"Compute price ({p})",
            f"{usd:.3f} USD/GPU-h = {config.COMPUTE_CHF_PER_SERVER_HOUR[p]:.2f} CHF/kWh", "SOURCE",
            "AWS g6.xlarge (1x L4) Frankfurt on-demand 1.01 / spot 0.36 USD/h, retrieved 2026-11-21; "
            "critical = on-demand, normal = midpoint, flexible = spot (mapping = ASSUMPTION).")
    add("economics", "Exchange rate", f"{config.USD_TO_CHF} CHF/USD", "ASSUMPTION", "Set the current rate.")
    add("economics", "Power per GPU", f"{config.KW_PER_GPU} kW", "ASSUMPTION",
        "72 W NVIDIA L4 board power (datasheet) + 50 W host share (assumption).")
    add("economics", "Hardware, installation, maintenance, network", "not included", "LIMIT",
        "The margin per server-hour must pay for these: see pay_off_statement in summary_fleet.json.")

    # --- jobs
    cat = _job_types()
    if cat:
        for jt in cat["job_types"]:
            tasks = "; ".join(f"{t.get('count', 1)}x {t['runtime_min']} min @ "
                              f"{str(t['gpus']) + ' GPU' if 'gpus' in t else str(t['power_kw']) + ' kW'}"
                              f"{'' if t.get('interruptible', True) else ' (not interruptible)'}" for t in jt["tasks"])
            add("jobs", f"Job type: {jt['name']}",
                f"{jt['jobs_per_day']}/day, {jt['priority']}, deadline {jt['deadline_h']} h: {tasks}",
                "MEASURED + ASSUMPTION" if "measured" in jt else "SOURCE + ASSUMPTION", jt["source"])
        add("jobs", "Arrival hours", "Alibaba trace hourly profile", "SOURCE",
            cat["arrival_profile"]["source"])
    add("jobs", "Jobs per day over the year", "the same every day (no weekday or season pattern)", "ASSUMPTION",
        "make_jobs.py repeats the job types every day (Poisson counts).")
    add("jobs", "Filler work (unlimited jobs)", "ON" if config.FILLER_ENABLED else "OFF",
        "ASSUMPTION" if config.FILLER_ENABLED else "OK",
        "When ON the model assumes UNLIMITED background jobs (spot market) whenever heat is needed. "
        "Brief: a model that assumes unlimited jobs must say so.")
    add("jobs", "Multi-GPU training workers", "not forced to run at the same time", "LIMIT", "No gang scheduling.")
    add("jobs", "Power of a GPU share", "linear (0.5 GPU = half the power)", "ASSUMPTION", "")

    # --- scheduler
    add("scheduler", "Algorithm", config.ALGORITHM, "OK", "greedy or mpc")
    add("scheduler", "Greedy tank target", f"{config.TARGET_FRACTION:.0%} full", "ASSUMPTION", "Tuning value.")
    add("scheduler", "Urgent when slack below", f"{config.URGENT_SLACK_SLOTS} slot", "ASSUMPTION", "Tuning value.")
    add("scheduler", "MPC forecast", config.FORECAST, "ASSUMPTION",
        "'perfect' reads ahead in the demand file (upper bound); 'persistence' = same slot yesterday.")
    add("scheduler", "MPC horizon / weights", f"{config.MPC_HORIZON_SLOTS} slots; unmet {config.W_UNMET}, "
        f"dump {config.W_DUMP}, electricity {config.W_ELEC}", "ASSUMPTION", "Tuning values.")
    add("live", "Live demo heat", "nominal task power", "LIMIT",
        "A laptop represents a server; heat is computed from the task's nominal power, not measured.")
    return a


def to_markdown(rows):
    lines = ["# Assumptions register", "",
             "Generated by `python -m core.assumptions` from config.py, data/job_types.json and data/. "
             "Status: BRIEF = case brief, SOURCE = named public source, ASSUMPTION = our choice, "
             "MOCK = test input that must be replaced, LIMIT = simplification.", "",
             "| Area | Item | Value | Status | Source / note |", "|---|---|---|---|---|"]
    for r in rows:
        lines.append(f"| {r['area']} | {r['name']} | {r['value']} | **{r['status']}** | "
                     f"{str(r['source']).replace('|', '/')} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    md = to_markdown(collect())
    with open("ASSUMPTIONS.md", "w", encoding="utf-8") as f:
        f.write(md)
    print(md)
