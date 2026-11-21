"""
Build data/jobs.json for the whole demand period from the job-type catalogue (data/job_types.json).

  python make_jobs.py                       # whole demand file, seed 7
  python make_jobs.py --scale 0.5           # half the jobs of every type
  python make_jobs.py --days 7              # only the first 7 days (quick tests)

Every day, each job type gets a random number of jobs around its `jobs_per_day` (Poisson), arriving at
hours drawn from the arrival profile. Same seed -> same jobs every time.
At the end it compares the jobs' electricity with the heat the sites need, so you can see how much
of the heat your jobs cover (the scheduler's filler work covers the rest if FILLER_ENABLED).
"""
import argparse
import json
import os

import numpy as np
import pandas as pd

import config
from core.data import load_demand

ap = argparse.ArgumentParser()
ap.add_argument("--catalogue", default=os.path.join(config.DATA_DIR, "job_types.json"))
ap.add_argument("--demand", default=os.path.join(config.DATA_DIR, config.DEMAND_FILE))
ap.add_argument("--out", default=os.path.join(config.DATA_DIR, config.JOBS_FILE))
ap.add_argument("--scale", type=float, default=1.0, help="multiply every jobs_per_day by this")
ap.add_argument("--days", type=int, default=None, help="only the first N days")
ap.add_argument("--seed", type=int, default=7)
args = ap.parse_args()

with open(args.catalogue) as f:
    cat = json.load(f)
kw_per_gpu = cat["hardware"]["kw_per_gpu"]
hours = np.array(cat["arrival_profile"]["hour_share"], dtype=float)
hours /= hours.sum()

times, demand = load_demand(args.demand)
start, end = pd.Timestamp(times[0]), pd.Timestamp(times[-1]) + pd.Timedelta(minutes=config.SLOT_MIN)
n_days = int((end - start) / pd.Timedelta(days=1))
if args.days:
    n_days = min(n_days, args.days)
rng = np.random.default_rng(args.seed)

jobs, n, energy = [], 0, {}
for d in range(n_days):
    day0 = start.normalize() + pd.Timedelta(days=d)
    for jt in cat["job_types"]:
        # optional calendar of a job type: active months, weekdays only, arrival-hour window [from, to)
        if "months" in jt and day0.month not in jt["months"]:
            continue
        if jt.get("weekdays_only") and day0.day_of_week >= 5:
            continue
        for _ in range(rng.poisson(jt["jobs_per_day"] * args.scale)):
            if "hours" in jt:
                h0, h1 = jt["hours"]
                quarter = int(rng.integers(int(h0 * 4), int(h1 * 4)))
                arrival = day0 + pd.Timedelta(minutes=15 * quarter)
            else:
                hour = rng.choice(24, p=hours)
                arrival = day0 + pd.Timedelta(hours=int(hour), minutes=15 * int(rng.integers(4)))
            deadline = arrival + pd.Timedelta(hours=jt["deadline_h"])
            if arrival < start or deadline > end:
                continue                                   # must fit inside the demand period
            n += 1
            jid = f"J{n}"
            tasks, earlier = [], []
            for spec in jt["tasks"]:
                made = []
                for i in range(spec.get("count", 1)):
                    k = len(tasks) + 1
                    t = {"task_id": f"{jid}-T{k}",
                         "name": spec["name"] + (f" {i + 1}" if spec.get("count", 1) > 1 else ""),
                         "runtime_min": spec["runtime_min"],
                         "power_kw": round(spec["power_kw"] if "power_kw" in spec else spec["gpus"] * kw_per_gpu, 4),
                         "threads": max(1, int(np.ceil(spec.get("gpus", 1)))),
                         "interruptible": spec.get("interruptible", True)}
                    if spec.get("after_all") and earlier:
                        t["depends_on"] = list(earlier)
                    tasks.append(t)
                    made.append(t["task_id"])
                    energy[jt["type"]] = energy.get(jt["type"], 0.0) + t["power_kw"] * t["runtime_min"] / 60
                earlier += made
            jobs.append({"job_id": jid, "customer": jt["customer"], "name": jt["name"], "type": jt["type"],
                         "priority": jt["priority"], "arrival": arrival.isoformat(),
                         "deadline": deadline.isoformat(), "tasks": tasks})

with open(args.out, "w") as f:
    json.dump(jobs, f, indent=1)

# ------------------------------------------------------------------ how much heat do these jobs cover?
days_in_file = (end - start) / pd.Timedelta(days=1)
heat_needed = sum(sum(v) for v in demand.values()) * min(1.0, n_days / days_in_file)
heat_from_jobs = sum(energy.values()) * config.RECOVERY
print(f"{len(jobs)} jobs, {sum(len(j['tasks']) for j in jobs)} tasks over {n_days} days -> {args.out}")
for k, v in energy.items():
    print(f"  {k:15s} {v:10.0f} kWh electricity  ({100 * v / sum(energy.values()):4.1f} %)")
print(f"heat the sites need     {heat_needed:10.0f} kWh")
print(f"heat the jobs can give  {heat_from_jobs:10.0f} kWh  ({100 * heat_from_jobs / heat_needed:.0f} % of the need,"
      f" at RECOVERY = {config.RECOVERY})")
