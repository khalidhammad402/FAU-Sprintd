"""Small helpers shared by the API endpoints."""
import re

import pandas as pd

import config
from core.models import FINISHED


def camel(d):
    """snake_case keys -> camelCase keys (the API speaks camelCase)."""
    if isinstance(d, list):
        return [camel(x) for x in d]
    if not isinstance(d, dict):
        return d
    return {re.sub(r"_([a-z])", lambda m: m.group(1).upper(), k): camel(v) for k, v in d.items()}


def iso(ts):
    """Timestamp -> ISO 8601 with the Europe/Zurich offset."""
    if ts is None or (isinstance(ts, float) and pd.isna(ts)):
        return None
    ts = pd.Timestamp(ts)
    if ts.tzinfo is None:
        ts = ts.tz_localize("Europe/Zurich", ambiguous=True, nonexistent="shift_forward")
    return ts.isoformat()


def paginate(items, limit=50, cursor=None):
    """Cursor = offset as a string. Returns {items, nextCursor (None on the last page), total}."""
    try:
        start = max(0, int(cursor or 0))
    except ValueError:
        start = 0
    limit = max(1, min(int(limit), 1000))
    page = items[start:start + limit]
    nxt = str(start + limit) if start + limit < len(items) else None
    return {"items": page, "nextCursor": nxt, "total": len(items)}


def rows_between(rows, start=None, end=None, **match):
    """Filter slot/server rows by time range and exact field matches."""
    out = []
    t0 = pd.Timestamp(start).tz_localize(None) if start else None
    t1 = pd.Timestamp(end).tz_localize(None) if end else None
    for r in rows:
        if any(r.get(k) != v for k, v in match.items()):
            continue
        if t0 is not None and r["time"] < t0:
            continue
        if t1 is not None and r["time"] >= t1:
            continue
        out.append(r)
    return out


def resample(rows, resolution="15m", sums=(), lasts=(), means=()):
    """Group rows into 15m / 1h / 1d / 1mo buckets: kWh fields summed, levels last value, power mean."""
    if not rows:
        return []
    df = pd.DataFrame(rows)
    if resolution == "1mo":
        df["bucket"] = df["time"].dt.to_period("M").dt.start_time
    else:
        df["bucket"] = df["time"].dt.floor({"15m": "15min", "1h": "1h", "1d": "1D"}.get(resolution, "15min"))
    agg = {**{c: "sum" for c in sums}, **{c: "last" for c in lasts}, **{c: "mean" for c in means}}
    g = df.groupby("bucket").agg(agg).reset_index()
    return [{"time": iso(r.pop("bucket")), **{k: float(v) for k, v in r.items()}} for r in g.to_dict("records")]


def task_dict(engine, t, detail=False):
    site = engine.servers[t.server_id].site_id if t.server_id else None
    d = {"id": t.task_id, "job_id": t.job_id, "name": t.name, "state": t.state, "priority": t.priority,
         "runtime_min": t.runtime_slots * config.SLOT_MIN, "power_kw": t.power_kw, "threads": t.threads,
         "interruptible": t.interruptible, "depends_on": t.depends_on, "arrival": iso(engine.time_of(t.arrival)),
         "deadline": iso(engine.time_of(t.deadline)), "site_id": site, "server_id": t.server_id,
         "progress_pct": round(100 * t.progress, 1), "energy_kwh": t.energy_kwh, "heat_delivered_kwh": t.heat_kwh,
         "filler": t.filler, "hold": t.hold,
         "finished": iso(engine.time_of(t.finished_slot)) if t.finished_slot is not None else None}
    if detail:
        d["events"] = [{"time": iso(engine.time_of(s)), "kind": k, "from_server_id": a, "to_server_id": b}
                       for s, k, a, b in t.events]
    return d


def job_dict(engine, j):
    tasks = [engine.task(x) for x in j.task_ids]
    states = [t.state for t in tasks]
    if all(s == "done" for s in states):
        status = "done"
    elif any(s == "missed" for s in states):
        status = "missed"
    elif all(s == "cancelled" for s in states):
        status = "cancelled"
    elif any(s in ("running", "paused") for s in states) or any(s == "done" for s in states):
        status = "running"
    else:
        status = "queued"
    remaining = sum(t.remaining_slots for t in tasks if t.state not in FINISHED)
    return {"id": j.job_id, "customer_id": j.customer, "name": j.name, "priority": j.priority,
            "status": status, "submitted_at": iso(engine.time_of(j.arrival)), "deadline": iso(engine.time_of(j.deadline)),
            "estimated_finish": iso(engine.time_of(engine.now + remaining)) if status in ("queued", "running") else None,
            "progress_pct": round(100 * sum(t.runtime_slots - t.remaining_slots for t in tasks) /
                                  max(1e-9, sum(t.runtime_slots for t in tasks)), 1),
            "cost_chf": sum(t.energy_kwh * config.COMPUTE_CHF_PER_SERVER_HOUR.get(t.priority, 0) for t in tasks),
            "task_ids": j.task_ids}


def site_status(row, site):
    if row["unmet_kwh"] > 0:
        return "unmet"
    if row["dumped_kwh"] > 0:
        return "dumping"
    if row["tank_kwh"] < 0.2 * site.tank_cap_kwh:
        return "tank_low"
    return "covered"
