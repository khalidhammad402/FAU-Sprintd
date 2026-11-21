"""
University scenario: the case's reference profile (Basel 2025) scaled to a university campus, with one DH-Pro rack.

  python make_university.py                       # writes data/university/ (your main data/ stays untouched)
  python make_university.py --campus-mwh 600 --servers 30 --tank-kwh 670

Inputs written to data/university/:
  demand.csv      15-min heat demand of the campus = reference profile (space heating + hot water, hourly,
                  data/reference_house_2025_components.csv) x (campus MWh / 31.307 MWh); each hour split over 4 slots
  sites.csv       one site UNI (Basel university campus) with the buffer tank
  servers.csv     N x 1 kW servers (one DH-Pro rack = 30)
  job_types.json  university job mix (labs, R&D training, genomics, external enterprise batch), with sources
  jobs.json       the year of jobs generated from it (make_jobs.py)
Run the year afterwards with: python -m sim.university
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
import pandas as pd

import config

ap = argparse.ArgumentParser()
ap.add_argument("--campus-mwh", type=float, default=600.0, help="annual heat demand of the campus (MWh)")
ap.add_argument("--servers", type=int, default=30, help="1 kW servers (DH-Pro rack = 30)")
ap.add_argument("--tank-kwh", type=float, default=670.0, help="usable campus buffer tank (kWh)")
a = ap.parse_args()

DIR = os.path.join(config.DATA_DIR, "university")
os.makedirs(DIR, exist_ok=True)

# ------------------------------------------------------------------ demand: brief's reference profile, scaled
ref = pd.read_csv(os.path.join(config.DATA_DIR, "reference_house_2025_components.csv"), parse_dates=["time"])
scale = a.campus_mwh * 1000 / ref.total_kwh.sum()
slots = pd.DataFrame({"timestamp": np.repeat(ref.time.values, 4)})
slots["timestamp"] += pd.to_timedelta(np.tile([0, 15, 30, 45], len(ref)), unit="min")
slots["UNI"] = np.repeat(ref.total_kwh.values * scale / 4, 4)
slots.to_csv(os.path.join(DIR, "demand.csv"), index=False)

pd.DataFrame([{"site_id": "UNI", "name": "University campus Basel", "type": "university", "lat": 47.5585,
               "lon": 7.5833, "building_height_m": 25, "tank_kwh": a.tank_kwh, "owner": "uniowner"}]) \
    .to_csv(os.path.join(DIR, "sites.csv"), index=False)
pd.DataFrame([{"server_id": f"UNI-S{i + 1}", "site_id": "UNI", "capacity_kw": 1.0} for i in range(a.servers)]) \
    .to_csv(os.path.join(DIR, "servers.csv"), index=False)

# ------------------------------------------------------------------ university job mix
SEMESTER = [2, 3, 4, 5, 9, 10, 11, 12]
with open(os.path.join(config.DATA_DIR, "job_types.json")) as f:
    base = json.load(f)
catalogue = {
    "_readme": ["University job mix for one DH-Pro rack (30 x 1 kW). Every task uses one full 1 kW server.",
                "Volumes are ASSUMPTIONS sized for ~60 % utilisation (the corrected pitch base case)."],
    "hardware": {"gpu": "1 kW GPU server (one task = one server)", "kw_per_gpu": 1.0,
                 "source": "Case brief: reference rack server 1 kW"},
    "arrival_profile": base["arrival_profile"],
    "job_types": [
        {"type": "labs", "name": "Student AI labs / JupyterHub session block", "customer": "university",
         "priority": "critical", "jobs_per_day": 60, "deadline_h": 2.5, "hours": [9, 16], "weekdays_only": True,
         "months": SEMESTER,
         "tasks": [{"name": "lab session", "count": 1, "runtime_min": 120, "power_kw": 1.0, "interruptible": False}],
         "source": "Interactive: must run when students work (weekdays 09:00-18:00, semester Feb-May and Sep-Dec, "
                   "ASSUMPTION based on the Uni Basel semester calendar). Not interruptible. Volume: ASSUMPTION."},
        {"type": "rnd", "name": "PhD / R&D model training", "customer": "university", "priority": "normal",
         "jobs_per_day": 10, "deadline_h": 24,
         "tasks": [{"name": "train worker", "count": 4, "runtime_min": 240, "power_kw": 1.0, "interruptible": True}],
         "source": "Batch training with checkpoints, 24 h SLA (pitch). 4 h tasks: trace p90 212 min, long tasks hold "
                   "most GPU time (Alibaba GPU trace 2020). Volume: ASSUMPTION."},
        {"type": "genomics", "name": "Genomics / simulation pipeline", "customer": "university",
         "priority": "flexible", "jobs_per_day": 4, "deadline_h": 48,
         "tasks": [{"name": "pipeline step", "count": 8, "runtime_min": 120, "power_kw": 1.0, "interruptible": True}],
         "source": "Parallel batch steps, 48 h deadline. Volume: ASSUMPTION."},
        {"type": "external", "name": "External Swiss enterprise batch AI", "customer": "external",
         "priority": "normal", "jobs_per_day": 7, "deadline_h": 12, "hours": [18, 24],
         "tasks": [{"name": "batch shard", "count": 12, "runtime_min": 120, "power_kw": 1.0, "interruptible": True}],
         "source": "Overflow from Swiss companies, submitted in the evening, 12 h batch SLA (pitch). "
                   "Volume: ASSUMPTION."},
    ],
}
with open(os.path.join(DIR, "job_types.json"), "w") as f:
    json.dump(catalogue, f, indent=1)

subprocess.run([sys.executable, "make_jobs.py", "--catalogue", os.path.join(DIR, "job_types.json"),
                "--demand", os.path.join(DIR, "demand.csv"), "--out", os.path.join(DIR, "jobs.json")], check=True)
print(f"\ncampus demand {slots.UNI.sum():,.0f} kWh/year (scale x{scale:.2f} of the reference house), "
      f"{a.servers} servers, tank {a.tank_kwh} kWh -> {DIR}/")
