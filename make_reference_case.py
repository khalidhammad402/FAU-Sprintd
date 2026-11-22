"""
The case's reference house as one self-contained input folder: data/reference_house/.

  python make_reference_case.py                 # 3 servers (default)
  python make_reference_case.py --servers 5

Writes:
  reference_house_2025.csv  15-min heat demand (copy of data/reference_house_2025.csv, built by make_reference_house.py
                            from the brief's Open-Meteo Basel 2025 profile: heating + 12 kWh/day hot water)
  sites.csv                 one house H1, tank 35 kWh (brief)
  servers.csv               N x 1 kW servers (brief: one rack server = 1 kW)
  job_types.json            the sourced job catalogue (data/job_types.json) + image recognition, the job we run and
                            measure on our own laptop (data/measurements/<host>.json, python -m live.measure)
  jobs.json                 the 2025 jobs generated from it (make_jobs.py, seed 7)
Your main data/ folder (demand - latest) is not touched.
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys

import pandas as pd

import config

DIR = os.path.join(config.DATA_DIR, "reference_house")
DEMAND = "reference_house_2025.csv"
IMAGE_JOBS_PER_DAY = 16      # ASSUMPTION: one photo-archive / product-catalogue customer, 16 batches a day
IMAGE_DEADLINE_H = 24


def measurement():
    """The newest valid laptop measurement (load power above idle power)."""
    best = None
    for p in glob.glob(os.path.join(config.DATA_DIR, "measurements", "*.json")):
        with open(p) as f:
            m = json.load(f)
        if m.get("power_load_w", 0) > m.get("power_idle_w", 0) and (best is None or
                                                                     m["measured_at"] > best["measured_at"]):
            best = m
    if best is None:
        sys.exit("no valid measurement in data/measurements/: run  python -m live.measure  on battery first")
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--servers", type=int, default=3)
    a = ap.parse_args()
    os.makedirs(DIR, exist_ok=True)
    shutil.copy(os.path.join(config.DATA_DIR, DEMAND), os.path.join(DIR, DEMAND))
    pd.DataFrame([{"site_id": "H1", "name": "Reference house Basel", "type": "household", "lat": 47.56,
                   "lon": 7.59, "building_height_m": 9, "tank_kwh": 35.0, "owner": "h1owner"}]) \
        .to_csv(os.path.join(DIR, "sites.csv"), index=False)
    pd.DataFrame([{"server_id": f"H1-S{i + 1}", "site_id": "H1", "capacity_kw": 1.0} for i in range(a.servers)]) \
        .to_csv(os.path.join(DIR, "servers.csv"), index=False)

    m = measurement()
    with open(os.path.join(config.DATA_DIR, "job_types.json")) as f:
        cat = json.load(f)
    minutes = m["job_definition"]["server_minutes"]
    cat["job_types"] = [jt for jt in cat["job_types"] if jt["type"] != "image"] + [{
        "type": "image", "name": "Image recognition (measured on our laptop)", "customer": "acme",
        "priority": "flexible", "jobs_per_day": IMAGE_JOBS_PER_DAY, "deadline_h": IMAGE_DEADLINE_H,
        "tasks": [{"name": "classify batch", "count": 1, "runtime_min": minutes, "power_kw": 1.0,
                   "interruptible": True}],
        "measured": {k: m[k] for k in ("host", "measured_at", "cpu", "cores", "job", "runtime_s", "images",
                                       "images_per_s", "accuracy", "power_meter", "power_idle_w", "power_load_w",
                                       "energy_wh", "energy_per_image_j", "images_per_server_hour")},
        "source": (f"MEASURED on our laptop ({m['host']}, {m['measured_at']}): {m['images']:,} images in "
                   f"{m['runtime_s']:.0f} s ({m['images_per_s']:,.0f}/s), laptop {m['power_load_w']:.1f} W under load "
                   f"(battery discharge meter), {m['energy_wh']:.2f} Wh. Scaling (ASSUMPTION): same energy per image "
                   f"on the 1 kW server -> {m['images_per_server_hour']:,.0f} images per server-hour; one job = "
                   f"{minutes} min of a 1 kW server = {m['job_definition']['images_per_job']:,.0f} images. "
                   f"Interruptible: the process is suspended/resumed and keeps its progress. Deadline "
                   f"{IMAGE_DEADLINE_H} h and {IMAGE_JOBS_PER_DAY} jobs/day: ASSUMPTION.")}]
    with open(os.path.join(DIR, "job_types.json"), "w") as f:
        json.dump(cat, f, indent=1)
    subprocess.run([sys.executable, "make_jobs.py", "--catalogue", os.path.join(DIR, "job_types.json"),
                    "--demand", os.path.join(DIR, DEMAND), "--out", os.path.join(DIR, "jobs.json")], check=True)
    print(f"reference house: {a.servers} servers, tank 35 kWh -> {DIR}/")


if __name__ == "__main__":
    main()
