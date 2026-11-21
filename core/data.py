"""Load input files into model objects."""
import json
import os

import pandas as pd

import config
from core.models import Job, Server, Site, Task


def load_demand(path):
    """Returns (times, demand) where demand = {site_id: [kWh per slot, ...]}."""
    df = pd.read_excel(path) if path.lower().endswith((".xlsx", ".xls")) else pd.read_csv(path)
    df.index = pd.to_datetime(df.iloc[:, 0])
    df = df.iloc[:, 1:][~df.index.duplicated()].sort_index()
    # The engine assumes exactly one row per slot. Meter exports in local time skip an hour when the
    # clocks go forward (and repeat one when they go back): fill missing slots by interpolation.
    grid = pd.date_range(df.index[0], df.index[-1], freq=f"{config.SLOT_MIN}min")
    missing = len(grid.difference(df.index))
    if missing:
        print(f"{os.path.basename(path)}: {missing} missing slot(s) filled by interpolation")
    df = df.reindex(df.index.union(grid)).interpolate(limit_area="inside").reindex(grid)
    times = list(grid)
    demand = {str(c): [float(v) for v in df[c].fillna(0)] for c in df.columns}
    return times, demand


def load_sites(path, site_ids):
    """Site details from sites.csv; sites missing there get defaults."""
    rows = {}
    if path and os.path.exists(path):
        for r in pd.read_csv(path).to_dict("records"):
            rows[str(r["site_id"])] = r
    sites = {}
    for i, sid in enumerate(site_ids):
        r = rows.get(sid, {})
        cap = float(r.get("tank_kwh", config.TANK_KWH_DEFAULT))
        sites[sid] = Site(
            site_id=sid, name=str(r.get("name", sid)), type=str(r.get("type", "household")),
            lat=float(r.get("lat", 47.56 + 0.004 * i)), lon=float(r.get("lon", 7.59 + 0.006 * i)),
            building_height_m=float(r.get("building_height_m", 10)), tank_cap_kwh=cap,
            tank_kwh=cap * config.TANK_START_FRACTION, owner=str(r.get("owner", "")))
    return sites


def load_servers(path, sites):
    servers = {}
    for r in pd.read_csv(path).to_dict("records"):
        sid = str(r["site_id"])
        if sid not in sites:
            raise ValueError(f"servers.csv: site '{sid}' is not a column in the demand file")
        servers[str(r["server_id"])] = Server(str(r["server_id"]), sid, float(r["capacity_kw"]))
    return servers


def to_slot(value, t0):
    """ISO time string -> slot number (float) relative to the first demand timestamp."""
    return (pd.Timestamp(value) - t0) / pd.Timedelta(minutes=config.SLOT_MIN)


def make_job(spec, t0=None, now=None):
    """
    Build a Job and its Tasks from a dict (jobs.json entry or API request).
    Times: 'arrival'/'deadline' as ISO strings (needs t0), or 'arrival_in_min'/'deadline_in_min' relative to `now`.
    Task fields: task_id, name, runtime_min, power_kw, threads, interruptible, depends_on;
    deadline, priority and arrival come from the job unless a task sets its own.
    """
    def slot(key):
        if spec.get(f"{key}_in_min") is not None:
            return now + float(spec[f"{key}_in_min"]) / config.SLOT_MIN
        return to_slot(spec[key], t0)

    arrival = slot("arrival") if ("arrival" in spec or "arrival_in_min" in spec) else (now or 0.0)
    deadline = slot("deadline")
    job = Job(str(spec["job_id"]), str(spec.get("customer", "")), str(spec.get("name", spec["job_id"])),
              spec.get("priority", "normal"), arrival, deadline)
    tasks = []
    for i, ts in enumerate(spec["tasks"]):
        tid = str(ts.get("task_id", f"{job.job_id}-T{i + 1}"))
        deps = ts.get("depends_on", [])
        deps = [d.strip() for d in deps.split(",") if d.strip()] if isinstance(deps, str) else [str(d) for d in deps]
        tasks.append(Task(
            task_id=tid, job_id=job.job_id, name=str(ts.get("name", tid)),
            runtime_slots=float(ts["runtime_min"]) / config.SLOT_MIN, power_kw=float(ts["power_kw"]),
            arrival=arrival, deadline=deadline, priority=ts.get("priority", job.priority),
            interruptible=bool(ts.get("interruptible", True)), threads=int(ts.get("threads", 1)),
            depends_on=deps))
        job.task_ids.append(tid)
    return job, tasks


def load_jobs(path, t0):
    jobs, tasks = {}, {}
    if not os.path.exists(path):
        return jobs, tasks
    with open(path) as f:
        for spec in json.load(f):
            job, ts = make_job(spec, t0=t0)
            jobs[job.job_id] = job
            tasks.update({t.task_id: t for t in ts})
    for t in tasks.values():
        for d in t.depends_on:
            if d not in tasks:
                raise ValueError(f"task {t.task_id} depends on unknown task {d}")
    return jobs, tasks


def load_all(data_dir=config.DATA_DIR, demand_file=None):
    demand_path = demand_file or os.path.join(data_dir, config.DEMAND_FILE)
    times, demand = load_demand(demand_path)
    sites = load_sites(os.path.join(data_dir, config.SITES_FILE), list(demand))
    servers = load_servers(os.path.join(data_dir, config.SERVERS_FILE), sites)
    jobs, tasks = load_jobs(os.path.join(data_dir, config.JOBS_FILE), pd.Timestamp(times[0]))
    return times, demand, sites, servers, jobs, tasks
