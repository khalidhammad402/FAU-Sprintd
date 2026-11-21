"""
Set up the case's reference house (Basel 2025) as the model input.

  python make_reference_house.py --source "C:/Users/.../open-meteo-47.56N7.55E283m.xlsx" --servers 8

Reads the hourly reference profile provided with the case (time, temperature_2m, heating demand kWh,
hot water kWh, total kWh), checks it against the brief and writes:
  data/reference_house_2025.csv              15-min demand file for the model (one site "H1", kWh per slot)
  data/reference_house_2025_components.csv   hourly temperature, space heating, hot water (for reports)
  data/sites.csv                             one site: the reference house with a 35 kWh tank
  data/servers.csv                           N servers of 1 kW (the brief's reference rack server)
Each hourly value is split evenly over its four 15-min slots.
Then set DEMAND_FILE = "reference_house_2025.csv" in config.py and run make_jobs.py and sim.run.
"""
import argparse
import os

import numpy as np
import pandas as pd

import config

ap = argparse.ArgumentParser()
ap.add_argument("--source", required=True, help="hourly reference profile (.xlsx or .csv) provided with the case")
ap.add_argument("--servers", type=int, default=8, help="number of 1 kW servers in the house")
ap.add_argument("--site-id", default="H1")
a = ap.parse_args()

raw = pd.read_excel(a.source, header=None) if a.source.lower().endswith((".xlsx", ".xls")) \
    else pd.read_csv(a.source, header=None)
head = next(i for i in range(len(raw)) if str(raw.iat[i, 0]).strip().lower() == "time")
df = raw.iloc[head + 1:, :5].copy()
df.columns = ["time", "temperature_c", "space_heating_kwh", "hot_water_kwh", "total_kwh"]
df["time"] = pd.to_datetime(df.time)
for c in df.columns[1:]:
    df[c] = df[c].astype(float)
df = df.reset_index(drop=True)

# ------------------------------------------------------------------ checks against the brief
T = df.temperature_c
by_day = df.groupby(df.time.dt.date)
day_mean = by_day.temperature_c.transform("mean")
per_day_rule = np.where(day_mean < 12, np.maximum(0, 10 * (20 - T) / 25.6), 0)
per_hour_rule = np.where(T < 12, np.maximum(0, 10 * (20 - T) / 25.6), 0)
checks = {
    "hours": len(df),
    "first / last": f"{df.time.iloc[0]} / {df.time.iloc[-1]}",
    "space heating kWh (file)": round(df.space_heating_kwh.sum()),
    "hot water kWh (file)": round(df.hot_water_kwh.sum()),
    "total kWh (file)": round(df.total_kwh.sum()),
    "total = heating + hot water": bool(np.allclose(df.total_kwh, df.space_heating_kwh + df.hot_water_kwh)),
    "heating days (day mean < 12 C)": int((by_day.temperature_c.mean() < 12).sum()),
    "coldest hour C": T.min(),
    "peak demand kWh/h": df.total_kwh.max(),
    "file = per-HOUR rule (hour T < 12 C)": bool(np.allclose(per_hour_rule, df.space_heating_kwh)),
    "file = per-DAY rule of the brief": bool(np.allclose(per_day_rule, df.space_heating_kwh)),
    "space heating kWh with per-DAY rule": round(per_day_rule.sum()),
}
for k, v in checks.items():
    print(f"  {k:40s} {v}")

# ------------------------------------------------------------------ write model inputs
os.makedirs(config.DATA_DIR, exist_ok=True)
comp_path = os.path.join(config.DATA_DIR, "reference_house_2025_components.csv")
df.to_csv(comp_path, index=False)

slots = pd.DataFrame({"timestamp": np.repeat(df.time.values, 4)})
slots["timestamp"] += pd.to_timedelta(np.tile([0, 15, 30, 45], len(df)), unit="min")
slots[a.site_id] = np.repeat(df.total_kwh.values / 4, 4)
demand_path = os.path.join(config.DATA_DIR, "reference_house_2025.csv")
slots.to_csv(demand_path, index=False)

pd.DataFrame([{"site_id": a.site_id, "name": "Reference house Basel", "type": "household",
               "lat": 47.56, "lon": 7.59, "building_height_m": 9, "tank_kwh": 35.0,
               "owner": "h1owner"}]).to_csv(os.path.join(config.DATA_DIR, config.SITES_FILE), index=False)
pd.DataFrame([{"server_id": f"{a.site_id}-S{i + 1}", "site_id": a.site_id, "capacity_kw": 1.0}
              for i in range(a.servers)]).to_csv(os.path.join(config.DATA_DIR, config.SERVERS_FILE), index=False)
print(f"\nwrote {demand_path} ({len(slots)} slots), {comp_path}, sites.csv (1 house, 35 kWh tank), "
      f"servers.csv ({a.servers} x 1 kW)")
