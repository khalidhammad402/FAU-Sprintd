"""
Create input files for testing.

  python make_mock_data.py                      # mock demand + sites + servers + jobs
  python make_mock_data.py --demand my.xlsx     # keep YOUR demand file, create the other files to match it

Your demand file: first column = timestamp, then one column per site (kWh per 15 min).
"""
import argparse
import json
import math
import os
import random
import shutil

import numpy as np
import pandas as pd

import config

ap = argparse.ArgumentParser()
ap.add_argument("--demand", help="your own demand file (xlsx/csv); otherwise a mock week is generated")
ap.add_argument("--days-of-jobs", type=int, default=None, help="limit job generation to the first N days")
ap.add_argument("--no-jobs", action="store_true", help="keep data/jobs.json (e.g. made by make_jobs.py)")
args = ap.parse_args()
os.makedirs(config.DATA_DIR, exist_ok=True)
random.seed(7)
target_path = os.path.join(config.DATA_DIR, config.DEMAND_FILE)

# ------------------------------------------------------------------ demand
if args.demand:
    if os.path.abspath(args.demand) != os.path.abspath(target_path):
        if args.demand.lower().endswith(".csv"):
            pd.read_csv(args.demand).to_excel(target_path, index=False)
        else:
            shutil.copy(args.demand, target_path)
else:
    rng = np.random.default_rng(42)
    times = pd.date_range("2025-01-13 00:00", periods=7 * 96, freq="15min")
    hour = times.hour + times.minute / 60
    df = {"timestamp": times}
    for site, peak in {"H1": 10, "H2": 8, "FARM1": 6, "HOTEL1": 12}.items():
        heating = peak * (0.6 + 0.3 * np.cos(2 * np.pi * (hour - 5) / 24))
        hot_water = np.where(((hour >= 7) & (hour < 8)) | ((hour >= 19) & (hour < 20)), 2.5, 0.2)
        df[site] = np.clip(heating + hot_water + rng.normal(0, 0.3, len(times)), 0, None) * config.SLOT_H
    pd.DataFrame(df).to_excel(target_path, index=False)

demand = pd.read_excel(target_path)
times = pd.to_datetime(demand.iloc[:, 0])
site_ids = [str(c) for c in demand.columns[1:]]

# ------------------------------------------------------------------ sites (Basel)
types = {"FARM": "farm", "HOTEL": "hotel", "SPA": "spa", "BIZ": "business"}
sites = []
for i, sid in enumerate(site_ids):
    kind = next((v for k, v in types.items() if sid.upper().startswith(k)), "household")
    sites.append({"site_id": sid, "name": f"{kind.title()} {sid}", "type": kind,
                  "lat": round(47.555 + 0.006 * (i % 3), 5), "lon": round(7.575 + 0.012 * i, 5),
                  "building_height_m": 9 if kind == "household" else 18,
                  "tank_kwh": config.TANK_KWH_DEFAULT, "owner": f"{sid.lower()}owner"})
pd.DataFrame(sites).to_csv(os.path.join(config.DATA_DIR, config.SITES_FILE), index=False)

# ------------------------------------------------------------------ servers sized to each site's peak
# 1 kW of servers gives 1 x 0.25 h x 0.8 = 0.2 kWh heat per slot -> capacity needed = peak / 0.2
servers = []
for i, sid in enumerate(site_ids):
    need_kw = demand[sid].max() / (config.SLOT_H * config.RECOVERY)
    factor = [1.0, 0.75, 1.2, 0.85][i % 4]               # some sites deliberately under/over-sized
    kw, n = need_kw * factor, 0
    for size in (2.0, 2.0, 1.0, 0.5):                     # mix of sizes, mostly 2 kW
        while kw >= size * 0.99 and (size < 2 or kw >= 2):
            n += 1
            servers.append({"server_id": f"{sid}-S{n}", "site_id": sid, "capacity_kw": size})
            kw -= size
    if n == 0:
        servers.append({"server_id": f"{sid}-S1", "site_id": sid, "capacity_kw": 1.0})
pd.DataFrame(servers).to_csv(os.path.join(config.DATA_DIR, config.SERVERS_FILE), index=False)

# ------------------------------------------------------------------ jobs (ASSUMPTION: illustrative mix)
if args.no_jobs:
    print(f"{len(site_ids)} sites, {len(servers)} servers written to {config.DATA_DIR}/ (jobs.json kept)")
    raise SystemExit
fmt = lambda t: t.isoformat()
start, end = times.iloc[0], times.iloc[-1]
days = math.ceil((end - start) / pd.Timedelta(days=1))
if args.days_of_jobs:
    days = min(days, args.days_of_jobs)
jobs, n = [], 0
for d in range(days):
    day0 = start + pd.Timedelta(days=d)
    def at(h): return day0 + pd.Timedelta(minutes=15 * round(h * 4))
    for _ in range(2):            # critical transcription: one task, cannot be paused, due in 3 h
        n += 1
        a = at(random.uniform(0, 20))
        jobs.append({"job_id": f"J{n}", "customer": "acme", "name": "Transcribe call recordings",
                     "priority": "critical", "arrival": fmt(a), "deadline": fmt(a + pd.Timedelta(hours=3)),
                     "tasks": [{"task_id": f"J{n}-T1", "name": "transcribe", "runtime_min": 60,
                                "power_kw": 1.0, "threads": 1, "interruptible": False}]})
    for _ in range(3):            # normal image recognition: one task using 4 threads (1.6 kW), due in 8 h
        n += 1
        a = at(random.uniform(0, 18))
        jobs.append({"job_id": f"J{n}", "customer": "globex", "name": "Classify product images",
                     "priority": "normal", "arrival": fmt(a), "deadline": fmt(a + pd.Timedelta(hours=8)),
                     "tasks": [{"task_id": f"J{n}-T1", "name": "classify", "runtime_min": 45,
                                "power_kw": 1.6, "threads": 4, "interruptible": True}]})
    for _ in range(4):            # flexible embeddings: 4 batches + a merge that waits for them, due in 24 h
        n += 1
        a = at(random.uniform(0, 22))
        chunks = [{"task_id": f"J{n}-T{i}", "name": f"embed batch {i}", "runtime_min": 30, "power_kw": 0.3,
                   "threads": 1, "interruptible": True} for i in range(1, 5)]
        merge = {"task_id": f"J{n}-T5", "name": "merge results", "runtime_min": 15, "power_kw": 0.3,
                 "threads": 1, "interruptible": True, "depends_on": [c["task_id"] for c in chunks]}
        jobs.append({"job_id": f"J{n}", "customer": random.choice(["acme", "globex"]),
                     "name": "Embed document archive", "priority": "flexible", "arrival": fmt(a),
                     "deadline": fmt(a + pd.Timedelta(hours=24)), "tasks": chunks + [merge]})
jobs = [j for j in jobs if pd.Timestamp(j["arrival"]) <= end]
with open(os.path.join(config.DATA_DIR, config.JOBS_FILE), "w") as f:
    json.dump(jobs, f, indent=1)

print(f"{len(site_ids)} sites, {len(servers)} servers, {len(jobs)} jobs written to {config.DATA_DIR}/")
