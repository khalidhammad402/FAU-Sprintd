"""
DigitalHeat REST + WebSocket API (backend for the Operator Console and the Client Portal).

  python -m live.broker                                  # MQTT broker (only for real laptops)
  uvicorn api.server:app --host 0.0.0.0 --port 8000      # API + live clock; docs: http://localhost:8000/docs
  DH_MQTT=0 uvicorn api.server:app --port 8000           # no broker: every server simulated
  DH_AUTOSTART=0 ...                                     # clock does not start by itself (tests)

The live master runs the scheduler engine on a demo clock in a background thread; endpoints read it under a lock.
Conventions: base /api/v1, JSON in camelCase, energy kWh, power kW, money CHF, time ISO 8601 Europe/Zurich,
lists paginated as {items, nextCursor, total}, errors as {"error": {"code", "message"}}.
Auth is a demo: POST /api/v1/auth/login returns the username as bearer token (users in config.USERS).
See docs/BACKEND_HANDOFF.md for the full guide.
"""
import asyncio
import itertools
import json
import os
import secrets
import threading
import time
from collections import defaultdict
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile, WebSocket, \
    WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

import config
from api.helpers import camel, iso, job_dict, paginate, resample, rows_between, site_status, task_dict
from api.schemas import (AckRequest, JobSubmit, JumpRequest, LoginRequest, PricingUpdate, ReadRequest,
                         SchedulerUpdate, SimulationRequest)
from core import assumptions
from core.data import make_job
from core.metrics import economics, fleet_summary, income_of, job_outcomes, server_hours, site_summary
from core.models import CANCELLED, FINISHED, RUNNING
from live.master import LiveMaster

VERSION = "1.1"
TAGS = [
    {"name": "meta", "description": "Health, metadata and conventions (no login needed)."},
    {"name": "auth", "description": "Demo login: the token is the username. Send `Authorization: Bearer <token>`."},
    {"name": "operator: fleet", "description": "Map, KPIs, sites and servers (role admin)."},
    {"name": "operator: jobs & tasks", "description": "Jobs, tasks, task types, customers (role admin)."},
    {"name": "operator: live control", "description": "Demo clock, real laptops (agents), jump / reset (role admin)."},
    {"name": "operator: results", "description": "Yearly balance of the offline simulation, assumptions, "
                                                  "simulation runs and datasets (role admin)."},
    {"name": "operator: events & settings", "description": "Alerts and prices (role admin)."},
    {"name": "customer", "description": "Compute customers: submit and follow jobs (role customer)."},
    {"name": "site owner", "description": "Client portal for homeowners / building operators (role site_owner)."},
]
app = FastAPI(title="DigitalHeat API", version=VERSION, openapi_tags=TAGS,
              description="Backend of the DigitalHeat platform: servers in building basements run AI jobs and "
                          "their heat warms the building through a tank. WebSocket: `/api/v1/ws?token=<token>` "
                          "(see docs/BACKEND_HANDOFF.md).")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
P = "/api/v1"

master = LiveMaster(use_mqtt=os.environ.get("DH_MQTT", "1") == "1")
LOCK = master.lock
simulations, api_keys, read_flags = {}, defaultdict(dict), defaultdict(set)
sim_ids = itertools.count(1)
SITE_FIELDS = dict(sums=("demand_kwh", "produced_kwh", "delivered_kwh", "dumped_kwh", "unmet_kwh"),
                   lasts=("tank_kwh",), means=("load_kw", "capacity_kw"))


class _LiveEngine:
    """`E.x` always reads the master's current engine (it is replaced by a reset)."""
    def __getattr__(self, name):
        return getattr(master.engine, name)


E = _LiveEngine()


# ===================================================================== errors: {"error": {"code", "message"}}
CODES = {400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict",
         422: "validation_error", 500: "internal_error"}


def _error(status, message, details=None):
    body = {"error": {"code": CODES.get(status, "error"), "message": message}}
    if details:
        body["error"]["details"] = details
    return JSONResponse(status_code=status, content=body)


@app.exception_handler(StarletteHTTPException)
async def http_error(_req: Request, exc: StarletteHTTPException):
    return _error(exc.status_code, str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_error(_req: Request, exc: RequestValidationError):
    details = [{"field": ".".join(str(x) for x in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return _error(422, "invalid request: " + "; ".join(f"{d['field']}: {d['message']}" for d in details), details)


# ===================================================================== auth
def user(authorization: str = Header(None, description="Bearer <token> from POST /auth/login")):
    token = (authorization or "").replace("Bearer ", "").strip()
    if token not in config.USERS:
        raise HTTPException(401, "login required: send Authorization: Bearer <token>")
    return {"id": token, **config.USERS[token]}


def role(*roles):
    def check(u=Depends(user)):
        if u["role"] not in roles:
            raise HTTPException(403, f"not allowed for role {u['role']} (needs {' or '.join(roles)})")
        return u
    return check


ADMIN, CUSTOMER, SITE_OWNER = role("admin"), role("customer", "admin"), role("site_owner", "admin")


def public_user(u):
    return camel({k: v for k, v in u.items() if k != "password"})


# ===================================================================== shared pieces
def last_row(site_id):
    rows = [r for r in E.slot_rows[-len(E.sites) * 2:] if r["site_id"] == site_id]
    return rows[-1] if rows else {"demand_kwh": 0, "produced_kwh": 0, "delivered_kwh": 0, "dumped_kwh": 0,
                                  "unmet_kwh": 0, "tank_kwh": E.sites[site_id].tank_kwh, "load_kw": 0,
                                  "capacity_kw": 0, "servers_running": 0,
                                  "servers_total": sum(1 for s in E.servers.values() if s.site_id == site_id)}


def site_dict(sid):
    s, r = E.sites[sid], last_row(sid)
    return {"id": sid, "name": s.name, "type": s.type, "lat": s.lat, "lon": s.lon,
            "building_height_m": s.building_height_m, "tank_capacity_kwh": s.tank_cap_kwh, "owner": s.owner,
            "status": site_status(r, s), "demand_kwh": r["demand_kwh"], "produced_kwh": r["produced_kwh"],
            "delivered_kwh": r["delivered_kwh"], "dumped_kwh": r["dumped_kwh"], "unmet_kwh": r["unmet_kwh"],
            "tank_kwh": r["tank_kwh"], "load_kw": r["load_kw"], "capacity_kw": r["capacity_kw"],
            "servers_running": r["servers_running"], "servers_total": r["servers_total"]}


def running_on(server_id):
    """Tasks that ran on this server in the last slot (between slots, finished ones count too)."""
    return [E.task(t) for t in E.last_running.get(server_id, []) if E.has_task(t)]


def server_dict(srv, with_tasks=True):
    running = running_on(srv.server_id)
    d = {"id": srv.server_id, "site_id": srv.site_id, "capacity_kw": srv.capacity_kw,
         "status": "online" if srv.online else "offline", "live": srv.live,
         "load_kw": sum(t.power_kw for t in running), "cpu_pct": srv.cpu_pct,
         "last_heartbeat": iso(pd.Timestamp(srv.last_seen, unit="s", tz="UTC")) if srv.last_seen else None}
    if with_tasks:
        d["tasks"] = [{"id": t.task_id, "name": t.name, "job_id": t.job_id, "power_kw": t.power_kw,
                       "priority": t.priority, "filler": t.filler,
                       "progress_pct": round(100 * t.progress, 1)} for t in running]
    return d


def kpis(rows, tasks, server_rows=(), jobs=None):
    """Same definitions as core.metrics (case brief): rows/server_rows already filtered by site and time."""
    df = pd.DataFrame(rows)
    if df.empty:
        return {}
    elec = df.load_kw.sum() * config.SLOT_H
    hours = server_hours(server_rows)
    money = economics(elec, df.delivered_kwh.sum(), income_of(tasks), hours["sold_h"])
    out = {
        "coverage_pct": 100 * df.delivered_kwh.sum() / df.demand_kwh.sum() if df.demand_kwh.sum() else 0,
        "demand_kwh": df.demand_kwh.sum(), "delivered_kwh": df.delivered_kwh.sum(),
        "dumped_kwh": df.dumped_kwh.sum(), "unmet_kwh": df.unmet_kwh.sum(),
        "utilisation_pct": hours["utilisation_pct"], "load_factor_pct": hours["load_factor_pct"],
        "server_running_h": hours["running_h"],
        "tasks_running": sum(len(v) for v in E.last_running.values()),
        "electricity_kwh": elec, **{k: v for k, v in money.items() if k != "pay_off_statement"}}
    if jobs is not None:
        out.update(job_outcomes(jobs, E.all_tasks()))
    return camel({k: (float(v) if hasattr(v, "item") else v) for k, v in out.items()})


def get_or_404(d, key, what):
    if key not in d:
        raise HTTPException(404, f"{what} {key} not found")
    return d[key]


def clock_dict():
    s = master.status()
    return camel({"algorithm": E.algorithm, "slot_minutes": config.SLOT_MIN, "slot_seconds": s["slot_seconds"],
                  "mode": s["mode"], "paused": master.paused, "slot": s["slot"], "slots_total": s["slots_total"],
                  "current_time": iso(s["time"]), "period_start": iso(E.time_of(0)),
                  "period_end": iso(E.time_of(E.n_slots)), "progress_pct": round(100 * s["slot"] / s["slots_total"], 2),
                  "jump_target": iso(E.time_of(s["jump"]["target_slot"])) if s["jump"] else None,
                  "filler_enabled": config.FILLER_ENABLED, "mqtt": s["mqtt"],
                  "live_servers": sorted(sid for sid, x in E.servers.items() if x.live and x.online)})


def agents_list():
    out = []
    for sid, a in sorted(master.agents.items()):
        srv = E.servers.get(sid)
        out.append({"server_id": sid, "site_id": a["site_id"], "host": a.get("host"),
                    "online": bool(a["online"] and srv and srv.online), "cpu_pct": a.get("cpu_pct"),
                    "workload": a.get("workload"),
                    "last_seen": iso(pd.Timestamp(a["last_seen"], unit="s", tz="UTC")),
                    "seconds_since_seen": round(time.time() - a["last_seen"], 1),
                    "processes": [{"task_id": tid, **{k: v for k, v in p.items()},
                                   "progress_pct": round(100 * p.get("progress", 0), 1)}
                                  for tid, p in a.get("processes", {}).items()],
                    "scheduler_tasks": [{"task_id": t.task_id, "name": t.name, "state": t.state,
                                         "progress_pct": round(100 * t.progress, 1)}
                                        for t in E.tasks.values() if t.server_id == sid and t.state == RUNNING]})
    return out


# ===================================================================== META
@app.get(f"{P}/health", tags=["meta"], summary="Liveness check")
def health():
    return {"status": "ok", "version": VERSION, "slot": E.now, "mode": master.status()["mode"]}


@app.get(f"{P}/meta", tags=["meta"], summary="Everything a client needs to configure itself")
def meta():
    with LOCK:
        sites = [{"id": s.site_id, "name": s.name, "type": s.type, "lat": s.lat, "lon": s.lon} for s in E.sites.values()]
        return camel({
            "name": "DigitalHeat", "version": VERSION, "demand_file": config.DEMAND_FILE,
            "period_start": iso(E.time_of(0)), "period_end": iso(E.time_of(E.n_slots)),
            "slot_minutes": config.SLOT_MIN, "slots_total": E.n_slots, "sites": sites,
            "servers_total": len(E.servers), "map_center": {"lat": 47.56, "lon": 7.59, "pitch": 55, "zoom": 13},
            "units": {"energy": "kWh (per 15-min slot unless stated)", "power": "kW", "money": "CHF",
                      "time": "ISO 8601, Europe/Zurich"},
            "roles": {"admin": "Operator Console", "customer": "compute customer", "site_owner": "Client Portal"},
            "site_status_values": ["covered", "tank_low", "unmet", "dumping"],
            "task_states": ["waiting", "ready", "running", "paused", "done", "missed", "cancelled"],
            "colours": {"server_heat": "warm orange", "tank": "blue", "backup_heater": "grey",
                        "dumped": "amber", "unmet": "red", "idle": "neutral"},
            "websocket": f"{P}/ws?token=<token>"})


# ===================================================================== AUTH
@app.post(f"{P}/auth/login", tags=["auth"], summary="Log in (demo users: see config.USERS)")
def login(body: LoginRequest):
    u = config.USERS.get(body.username)
    if not u or u["password"] != body.password:
        raise HTTPException(401, "wrong username or password")
    return {"token": body.username, "user": public_user({"id": body.username, **u})}


@app.get(f"{P}/auth/me", tags=["auth"], summary="The logged-in user")
def me(u=Depends(user)):
    return public_user(u)


# ===================================================================== OPERATOR: FLEET
@app.get(f"{P}/admin/map/sites", tags=["operator: fleet"], summary="GeoJSON of all sites with live state")
def map_sites(u=Depends(ADMIN)):
    with LOCK:
        feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [E.sites[s].lon, E.sites[s].lat]},
                  "properties": camel(site_dict(s))} for s in E.sites]
        return {"type": "FeatureCollection", "time": iso(E.time_of(max(0, E.now - 1))), "features": feats}


@app.get(f"{P}/admin/kpis", tags=["operator: fleet"], summary="Key figures (case-brief definitions)",
         description="scope=fleet (default) or scope=site&siteId=H1; optional from/to (ISO) limit the period.")
def admin_kpis(scope: str = Query("fleet", pattern="^(fleet|site)$"), siteId: str = None,
               frm: str = Query(None, alias="from"), to: str = None, u=Depends(ADMIN)):
    with LOCK:
        if scope == "site":
            get_or_404(E.sites, siteId, "site")
        match = {"site_id": siteId} if scope == "site" else {}
        tasks = list(E.all_tasks().values())
        jobs = list(E.jobs.values())
        if match:
            tasks = [t for t in tasks if t.server_id and E.servers[t.server_id].site_id == siteId]
            ids = {t.task_id for t in tasks}
            jobs = [j for j in jobs if any(x in ids for x in j.task_ids)]
        return kpis(rows_between(E.slot_rows, frm, to, **match), tasks,
                    rows_between(E.server_rows, frm, to, **match), jobs)


@app.get(f"{P}/admin/sites", tags=["operator: fleet"], summary="All sites with live summary")
def admin_sites(type: str = None, status: str = None, u=Depends(ADMIN)):
    with LOCK:
        items = [site_dict(s) for s in E.sites]
    return camel([s for s in items if (not type or s["type"] == type) and (not status or s["status"] == status)])


@app.get(f"{P}/admin/sites/{{site_id}}", tags=["operator: fleet"], summary="One site + live state + today's KPIs")
def admin_site(site_id: str, u=Depends(ADMIN)):
    with LOCK:
        get_or_404(E.sites, site_id, "site")
        d = site_dict(site_id)
        today = E.time_of(max(0, E.now - 1)).normalize()
        d["today"] = kpis(rows_between(E.slot_rows, today, None, site_id=site_id), [],
                          rows_between(E.server_rows, today, None, site_id=site_id))
    return camel(d)


@app.get(f"{P}/admin/sites/{{site_id}}/timeline", tags=["operator: fleet"],
         summary="Slot readings of a site (live run so far)",
         description="resolution=15m|1h|1d|1mo: kWh fields summed, tank = last value, power = mean.")
def admin_site_timeline(site_id: str, frm: str = Query(None, alias="from"), to: str = None,
                        resolution: str = Query("15m", pattern="^(15m|1h|1d|1mo)$"), u=Depends(ADMIN)):
    with LOCK:
        get_or_404(E.sites, site_id, "site")
        rows = rows_between(E.slot_rows, frm, to, site_id=site_id)
    return camel([{"site_id": site_id, **r} for r in resample(rows, resolution, **SITE_FIELDS)])


@app.get(f"{P}/admin/sites/{{site_id}}/servers", tags=["operator: fleet"], summary="Servers of a site + current tasks")
def admin_site_servers(site_id: str, u=Depends(ADMIN)):
    with LOCK:
        get_or_404(E.sites, site_id, "site")
        return camel([server_dict(s) for s in E.servers.values() if s.site_id == site_id])


@app.get(f"{P}/admin/servers", tags=["operator: fleet"], summary="All servers (for map rings / rack views)")
def admin_servers(siteId: str = None, u=Depends(ADMIN)):
    with LOCK:
        return camel([server_dict(s) for s in E.servers.values() if not siteId or s.site_id == siteId])


@app.get(f"{P}/admin/servers/{{server_id}}", tags=["operator: fleet"], summary="One server + current tasks")
def admin_server(server_id: str, u=Depends(ADMIN)):
    with LOCK:
        return camel(server_dict(get_or_404(E.servers, server_id, "server")))


@app.get(f"{P}/admin/servers/{{server_id}}/timeline", tags=["operator: fleet"], summary="Load / capacity over time")
def admin_server_timeline(server_id: str, frm: str = Query(None, alias="from"), to: str = None,
                          resolution: str = Query("15m", pattern="^(15m|1h|1d|1mo)$"), u=Depends(ADMIN)):
    with LOCK:
        get_or_404(E.servers, server_id, "server")
        rows = rows_between(E.server_rows, frm, to, server_id=server_id)
    return camel(resample(rows, resolution, means=("load_kw", "capacity_kw", "cpu_pct")))


# ===================================================================== OPERATOR: JOBS & TASKS
@app.get(f"{P}/admin/jobs", tags=["operator: jobs & tasks"], summary="Jobs (paginated)")
def admin_jobs(status: str = Query(None, pattern="^(queued|running|done|missed|cancelled)$"),
               customerId: str = None, priority: str = None, limit: int = 50, cursor: str = None, u=Depends(ADMIN)):
    with LOCK:
        # filter on the objects first, build dicts only for the page (a year holds ~30k jobs)
        jobs = [j for j in E.jobs.values() if (not customerId or j.customer == customerId) and
                (not priority or j.priority == priority)]
        if status:                                         # status needs the tasks: build dicts, then filter
            items = [d for d in (job_dict(E, j) for j in jobs) if d["status"] == status]
            return paginate(camel(items), limit, cursor)
        page = paginate(jobs, limit, cursor)
        page["items"] = camel([job_dict(E, j) for j in page["items"]])
    return page


@app.get(f"{P}/admin/jobs/{{job_id}}", tags=["operator: jobs & tasks"], summary="One job with its tasks")
def admin_job(job_id: str, u=Depends(ADMIN)):
    with LOCK:
        j = get_or_404(E.jobs, job_id, "job")
        d = job_dict(E, j)
        d["tasks"] = [task_dict(E, E.task(t)) for t in j.task_ids]
    return camel(d)


@app.get(f"{P}/admin/tasks", tags=["operator: jobs & tasks"], summary="Tasks (paginated, filterable)")
def admin_tasks(state: str = Query(None, pattern="^(waiting|ready|running|paused|done|missed|cancelled)$"),
                jobId: str = None, siteId: str = None, serverId: str = None,
                includeFiller: bool = False, limit: int = 50, cursor: str = None, u=Depends(ADMIN)):
    with LOCK:
        tasks = [t for t in E.all_tasks().values() if (includeFiller or not t.filler) and
                 (not state or t.state == state) and (not jobId or t.job_id == jobId) and
                 (not serverId or t.server_id == serverId) and
                 (not siteId or (t.server_id and E.servers[t.server_id].site_id == siteId))]
        page = paginate(tasks, limit, cursor)
        page["items"] = camel([task_dict(E, t) for t in page["items"]])
    return page


@app.get(f"{P}/admin/tasks/{{task_id}}", tags=["operator: jobs & tasks"], summary="One task + lifecycle events")
def admin_task(task_id: str, u=Depends(ADMIN)):
    with LOCK:
        t = E.task(task_id)
        if t is None:
            raise HTTPException(404, f"task {task_id} not found")
        return camel(task_dict(E, t, detail=True))


@app.post(f"{P}/admin/tasks/{{task_id}}/{{action}}", tags=["operator: jobs & tasks"],
          summary="Manual pause / resume / cancel",
          description="pause = hold (not scheduled from the next slot), resume = release the hold, cancel = stop now.")
def admin_task_action(task_id: str, action: str, u=Depends(ADMIN)):
    if action not in ("pause", "resume", "cancel"):
        raise HTTPException(400, "action must be pause, resume or cancel")
    with LOCK:
        t = E.task(task_id)                               # also tasks that have not arrived yet
        if t is None:
            raise HTTPException(404, f"task {task_id} not found")
        if t.state in FINISHED:
            raise HTTPException(409, f"task {task_id} is already {t.state}")
        if action == "pause":
            t.hold = True
        elif action == "resume":
            t.hold = False
        else:
            t.state = CANCELLED
            t.events.append((E.now, "cancelled", t.server_id, None))
        return camel(task_dict(E, t))


@app.get(f"{P}/admin/task-types", tags=["operator: jobs & tasks"],
         summary="Job-type catalogue (data/job_types.json) with sources")
def task_types(u=Depends(ADMIN)):
    path = os.path.join(config.DATA_DIR, "job_types.json")
    if not os.path.exists(path):
        return []
    with open(path) as f:
        cat = json.load(f)
    kw = cat["hardware"]["kw_per_gpu"]
    out = []
    for jt in cat["job_types"]:
        tasks = [{"name": t["name"], "count": t.get("count", 1), "runtime_min": t["runtime_min"],
                  "power_kw": round(t.get("power_kw", t.get("gpus", 1) * kw), 4),
                  "heat_per_slot_kwh": round(t.get("power_kw", t.get("gpus", 1) * kw) * config.SLOT_H
                                             * config.RECOVERY, 4),
                  "interruptible": t.get("interruptible", True), "after_all": t.get("after_all", False)}
                 for t in jt["tasks"]]
        out.append({"id": jt["type"], "name": jt["name"], "customer": jt["customer"], "priority": jt["priority"],
                    "jobs_per_day": jt["jobs_per_day"], "deadline_h": jt["deadline_h"], "tasks": tasks,
                    "source": jt["source"]})
    return camel(out)


@app.get(f"{P}/admin/customers", tags=["operator: jobs & tasks"], summary="Customers with job counts and revenue")
def admin_customers(u=Depends(ADMIN)):
    with LOCK:
        by_c = defaultdict(list)
        for j in E.jobs.values():
            by_c[j.customer].append(j)
        out = []
        for cid in sorted(by_c):
            tasks = [E.task(x) for j in by_c[cid] for x in j.task_ids]
            out.append({"id": cid, "name": next((v["name"] for v in config.USERS.values()
                                                 if v.get("customer") == cid), cid),
                        "jobs": len(by_c[cid]),
                        "tasks_running": sum(1 for t in tasks if t and t.state == RUNNING),
                        "revenue_chf": income_of([t for t in tasks if t])})
    return camel(out)


@app.get(f"{P}/admin/customers/{{customer_id}}", tags=["operator: jobs & tasks"], summary="One customer + jobs")
def admin_customer(customer_id: str, limit: int = 50, cursor: str = None, u=Depends(ADMIN)):
    c = next((c for c in admin_customers(u) if c["id"] == customer_id), None)
    if not c:
        raise HTTPException(404, f"customer {customer_id} not found")
    with LOCK:
        page = paginate([j for j in E.jobs.values() if j.customer == customer_id], limit, cursor)
        page["items"] = camel([job_dict(E, j) for j in page["items"]])
    c["jobList"] = page
    return c


# ===================================================================== OPERATOR: LIVE CONTROL
@app.get(f"{P}/admin/scheduler", tags=["operator: live control"], summary="Demo clock and scheduler state")
def get_scheduler(u=Depends(ADMIN)):
    return clock_dict()


@app.put(f"{P}/admin/scheduler", tags=["operator: live control"],
         summary="Change algorithm, clock speed (slotSeconds) or pause / resume the clock")
def put_scheduler(body: SchedulerUpdate, u=Depends(ADMIN)):
    with LOCK:
        if body.algorithm:
            E.algorithm = body.algorithm
            master.algorithm = body.algorithm
        if body.slot_seconds:
            master.slot_seconds = float(body.slot_seconds)
        if body.paused is not None:
            master.paused = body.paused
    return clock_dict()


@app.post(f"{P}/admin/scheduler/jump", tags=["operator: live control"],
          summary="Fast-forward the live run to a date (forward only, runs in the background)",
          description="Poll GET /admin/scheduler: mode is 'jumping' until done. Jumping a whole year takes ~1-2 min.")
def jump(body: JumpRequest, u=Depends(ADMIN)):
    if body.slot is not None:
        target = body.slot
    elif body.to is not None:
        ts = pd.Timestamp(body.to)
        ts = ts.tz_convert("Europe/Zurich").tz_localize(None) if ts.tzinfo else ts
        target = int((ts - E.time_of(0)) / pd.Timedelta(minutes=config.SLOT_MIN))
    else:
        raise HTTPException(400, "give 'to' (ISO time) or 'slot'")
    if target <= E.now:
        raise HTTPException(409, f"can only jump forward (now {iso(E.time_of(E.now))}); POST /admin/scheduler/reset "
                                 "first to go back")
    if not master.jump_to(target):
        raise HTTPException(409, "a jump is already running")
    return clock_dict()


@app.post(f"{P}/admin/scheduler/reset", tags=["operator: live control"],
          summary="Restart the live run from the first slot (reloads the input files)")
def reset(u=Depends(ADMIN)):
    if master.jump:
        raise HTTPException(409, "wait until the jump has finished")
    master.reset()
    _seen.update(events=0, alerts=0)
    return clock_dict()


@app.get(f"{P}/admin/live/agents", tags=["operator: live control"],
         summary="Real laptops (agents): host, CPU, real processes and their progress")
def live_agents(u=Depends(ADMIN)):
    with LOCK:
        return {"mqtt": master.mqtt_status, "items": camel(agents_list())}


# ===================================================================== OPERATOR: RESULTS (offline simulation)
def _results_dir(algorithm):
    path = os.path.join(config.RESULTS_DIR, algorithm)
    if not os.path.exists(os.path.join(path, "summary_fleet.json")):
        raise HTTPException(404, f"no results for '{algorithm}': run  python -m sim.run --algorithm {algorithm}")
    return path


_timeline_cache = {}


@app.get(f"{P}/admin/results", tags=["operator: results"],
         summary="Yearly balance per site and fleet from the last offline run (must-have 3)")
def results(algorithm: str = Query("greedy", pattern="^(greedy|mpc)$"), u=Depends(ADMIN)):
    path = _results_dir(algorithm)
    with open(os.path.join(path, "summary_fleet.json")) as f:
        fleet = json.load(f)
    sites = pd.read_csv(os.path.join(path, "summary_sites.csv")).to_dict("records")
    return camel({"algorithm": algorithm,
                  "generated_at": iso(pd.Timestamp(os.path.getmtime(os.path.join(path, "summary_fleet.json")),
                                                   unit="s", tz="UTC")),
                  "fleet": fleet, "sites": sites})


@app.get(f"{P}/admin/results/timeline", tags=["operator: results"],
         summary="Year timeline of the last offline run for one site (for yearly charts)")
def results_timeline(siteId: str, resolution: str = Query("1d", pattern="^(15m|1h|1d|1mo)$"),
                     algorithm: str = Query("greedy", pattern="^(greedy|mpc)$"), u=Depends(ADMIN)):
    path = os.path.join(_results_dir(algorithm), "timeline.csv")
    key = (path, os.path.getmtime(path))
    if key not in _timeline_cache:
        _timeline_cache.clear()
        _timeline_cache[key] = pd.read_csv(path, parse_dates=["time"])
    df = _timeline_cache[key]
    rows = df[df.site_id == siteId].to_dict("records")
    if not rows:
        raise HTTPException(404, f"site {siteId} not found in the results")
    return camel([{"site_id": siteId, **r} for r in resample(rows, resolution, **SITE_FIELDS)])


@app.get(f"{P}/admin/assumptions", tags=["operator: results"],
         summary="Every assumption with value, source and status (BRIEF / SOURCE / ASSUMPTION / MOCK / LIMIT)")
def get_assumptions(u=Depends(ADMIN)):
    return assumptions.collect()


@app.get(f"{P}/admin/datasets", tags=["operator: results"], summary="Demand files in data/")
def datasets(u=Depends(ADMIN)):
    files = [f for f in os.listdir(config.DATA_DIR) if f.endswith((".xlsx", ".xls", ".csv")) and "demand" in f
             or f == config.DEMAND_FILE]
    return [{"id": f, "name": f, "active": f == config.DEMAND_FILE,
             "sizeBytes": os.path.getsize(os.path.join(config.DATA_DIR, f))} for f in sorted(set(files))]


@app.post(f"{P}/admin/datasets", tags=["operator: results"], summary="Upload a demand file (Excel / CSV)")
async def upload_dataset(file: UploadFile = File(...), u=Depends(ADMIN)):
    if not file.filename.lower().endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(400, "upload an .xlsx, .xls or .csv file")
    name = "demand_" + os.path.basename(file.filename)
    with open(os.path.join(config.DATA_DIR, name), "wb") as f:
        f.write(await file.read())
    return {"id": name, "name": name, "active": False}


def _run_simulation(run_id, algorithm, dataset):
    from sim.run import simulate, task_table
    run = simulations[run_id]
    try:
        demand = os.path.join(config.DATA_DIR, dataset) if dataset else None
        eng = simulate(algorithm, demand)
        run.update(status="done", engine=eng, summary=camel(fleet_summary(eng)),
                   sites=camel(site_summary(eng).to_dict("records")), tasks=task_table(eng),
                   finishedAt=iso(pd.Timestamp.now(tz="Europe/Zurich")))
    except Exception as e:                                # report the problem instead of hanging
        run.update(status="failed", error=str(e))


@app.post(f"{P}/admin/simulations", tags=["operator: results"], summary="Start an offline year simulation (async)")
def start_simulation(body: SimulationRequest, u=Depends(ADMIN)):
    if body.dataset_id and not os.path.exists(os.path.join(config.DATA_DIR, body.dataset_id)):
        raise HTTPException(404, f"dataset {body.dataset_id} not found")
    run_id = f"run{next(sim_ids)}"
    simulations[run_id] = {"id": run_id, "algorithm": body.algorithm, "datasetId": body.dataset_id,
                           "status": "running", "createdAt": iso(pd.Timestamp.now(tz="Europe/Zurich"))}
    threading.Thread(target=_run_simulation, daemon=True, args=(run_id, body.algorithm, body.dataset_id)).start()
    return {"runId": run_id, "status": "running"}


def _public_run(r):
    return {k: v for k, v in r.items() if k not in ("engine", "tasks")}


@app.get(f"{P}/admin/simulations", tags=["operator: results"], summary="Simulation runs")
def list_simulations(u=Depends(ADMIN)):
    return [_public_run(r) for r in simulations.values()]


@app.get(f"{P}/admin/simulations/compare", tags=["operator: results"], summary="Compare runs per site")
def compare_simulations(runIds: str, u=Depends(ADMIN)):
    runs = [get_or_404(simulations, i, "run") for i in runIds.split(",")]
    out = defaultdict(dict)
    for r in runs:
        for s in r.get("sites", []):
            out[s["siteId"]][r["id"]] = s
    return {"runs": [_public_run(r) for r in runs], "sites": out}


@app.get(f"{P}/admin/simulations/{{run_id}}", tags=["operator: results"], summary="One run: status + summary")
def get_simulation(run_id: str, u=Depends(ADMIN)):
    return _public_run(get_or_404(simulations, run_id, "run"))


@app.get(f"{P}/admin/simulations/{{run_id}}/timeline", tags=["operator: results"], summary="Timeline of a run")
def simulation_timeline(run_id: str, siteId: str, resolution: str = Query("1h", pattern="^(15m|1h|1d|1mo)$"),
                        u=Depends(ADMIN)):
    r = get_or_404(simulations, run_id, "run")
    if r["status"] != "done":
        raise HTTPException(409, f"run is {r['status']}")
    rows = rows_between(r["engine"].slot_rows, site_id=siteId)
    return camel([{"site_id": siteId, **x} for x in resample(rows, resolution, **SITE_FIELDS)])


@app.get(f"{P}/admin/simulations/{{run_id}}/schedule", tags=["operator: results"], summary="Tasks of a run")
def simulation_schedule(run_id: str, siteId: str = None, limit: int = 100, cursor: str = None, u=Depends(ADMIN)):
    r = get_or_404(simulations, run_id, "run")
    if r["status"] != "done":
        raise HTTPException(409, f"run is {r['status']}")
    df = r["tasks"]
    if siteId:
        df = df[df.server_id.fillna("").map(lambda s: r["engine"].servers[s].site_id if s else None) == siteId]
    items = json.loads(df.to_json(orient="records", date_format="iso"))
    return paginate(camel(items), limit, cursor)


# ===================================================================== OPERATOR: EVENTS & SETTINGS
@app.get(f"{P}/admin/events", tags=["operator: events & settings"], summary="Alerts (newest first, paginated)")
def admin_events(severity: str = Query(None, pattern="^(info|warning|critical)$"), siteId: str = None,
                 acknowledged: bool = None, limit: int = 50, cursor: str = None, u=Depends(ADMIN)):
    with LOCK:
        items = [{**a, "time": iso(a["time"])} for a in reversed(E.alerts)]
    items = [a for a in items if (not severity or a["severity"] == severity) and
             (not siteId or a["site_id"] == siteId) and (acknowledged is None or a["acknowledged"] == acknowledged)]
    return paginate(camel(items), limit, cursor)


@app.patch(f"{P}/admin/events/{{event_id}}", tags=["operator: events & settings"], summary="Acknowledge an alert")
def ack_event(event_id: int, body: AckRequest, u=Depends(ADMIN)):
    with LOCK:
        a = next((a for a in E.alerts if a["id"] == event_id), None)
        if not a:
            raise HTTPException(404, f"event {event_id} not found")
        a["acknowledged"] = body.acknowledged
        return camel({**a, "time": iso(a["time"])})


@app.get(f"{P}/admin/settings/pricing", tags=["operator: events & settings"], summary="Prices used for the money KPIs")
def get_pricing(u=Depends(user)):
    return {"electricityChfPerKwh": config.ELECTRICITY_CHF_PER_KWH, "heatPumpCop": config.HEAT_PUMP_COP,
            "heatValueChfPerKwh": config.ELECTRICITY_CHF_PER_KWH / config.HEAT_PUMP_COP,
            "computeChfPerServerHour": config.COMPUTE_CHF_PER_SERVER_HOUR,
            "source": "config.py (electricity: ElCom 2026 IWB H4 to confirm; compute: AWS L4 on-demand/spot)"}


@app.put(f"{P}/admin/settings/pricing", tags=["operator: events & settings"], summary="Change prices (until restart)")
def put_pricing(body: PricingUpdate, u=Depends(ADMIN)):
    if body.electricity_chf_per_kwh:
        config.ELECTRICITY_CHF_PER_KWH = body.electricity_chf_per_kwh
    if body.heat_pump_cop:
        config.HEAT_PUMP_COP = body.heat_pump_cop
    if body.compute_chf_per_server_hour:
        bad = set(body.compute_chf_per_server_hour) - {"critical", "normal", "flexible"}
        if bad:
            raise HTTPException(400, f"unknown priorities {sorted(bad)}")
        config.COMPUTE_CHF_PER_SERVER_HOUR.update(body.compute_chf_per_server_hour)
    return get_pricing(u)


# ===================================================================== CUSTOMER
def my_jobs(u):
    cid = u.get("customer")
    return [j for j in E.jobs.values() if u["role"] == "admin" or j.customer == cid]


def my_job(u, job_id):
    j = get_or_404(E.jobs, job_id, "job")
    if u["role"] != "admin" and j.customer != u.get("customer"):
        raise HTTPException(404, f"job {job_id} not found")
    return j


@app.get(f"{P}/customer/overview", tags=["customer"], summary="My jobs at a glance")
def customer_overview(u=Depends(CUSTOMER)):
    with LOCK:
        jobs = [job_dict(E, j) for j in my_jobs(u)]
        month = E.time_of(max(0, E.now - 1)).to_period("M").start_time
        at_risk = [j for j in jobs if j["status"] in ("queued", "running") and j["estimated_finish"]
                   and j["estimated_finish"] > j["deadline"]]
        tasks = [E.task(x) for j in my_jobs(u) for x in j.task_ids]
        spend = sum(t.energy_kwh * config.COMPUTE_CHF_PER_SERVER_HOUR.get(t.priority, 0) for t in tasks
                    if t.finished_slot is None or E.time_of(t.finished_slot) >= month)
    return camel({"jobs_running": sum(j["status"] == "running" for j in jobs),
                  "jobs_queued": sum(j["status"] == "queued" for j in jobs),
                  "jobs_done": sum(j["status"] == "done" for j in jobs),
                  "jobs_missed": sum(j["status"] == "missed" for j in jobs),
                  "jobs_at_risk": [j["id"] for j in at_risk], "spend_month_chf": spend,
                  "heat_delivered_kwh": sum(t.heat_kwh for t in tasks)})


@app.post(f"{P}/customer/jobs", tags=["customer"], summary="Submit a job (one or more tasks)",
          description="Arrives now (simulated time). Task ids are local to the request and made unique.")
def submit_job(body: JobSubmit, u=Depends(CUSTOMER)):
    if body.deadline is None and body.deadline_in_min is None:
        raise HTTPException(400, "deadline or deadlineInMin required")
    with LOCK:
        job_id = f"J{len(E.jobs) + 1}-{secrets.token_hex(2)}"
        spec = {"job_id": job_id, "customer": u.get("customer", "admin"), "name": body.name or job_id,
                "priority": body.priority, "arrival_in_min": 0, "tasks": []}
        if body.deadline_in_min is not None:
            spec["deadline_in_min"] = body.deadline_in_min
        else:
            ts = pd.Timestamp(body.deadline)
            spec["deadline"] = ts.tz_convert("Europe/Zurich").tz_localize(None) if ts.tzinfo else ts
        local = [t.task_id or f"T{i + 1}" for i, t in enumerate(body.tasks)]
        if len(set(local)) != len(local):
            raise HTTPException(400, "taskIds inside a job must be unique")
        full = {lid: f"{job_id}-{lid}" for lid in local}
        for lid, t in zip(local, body.tasks):
            unknown = [d for d in t.depends_on if d not in full]
            if unknown:
                raise HTTPException(400, f"task {lid} depends on unknown taskIds {unknown}")
            spec["tasks"].append({"task_id": full[lid], "name": t.name or lid, "runtime_min": t.runtime_min,
                                  "power_kw": t.power_kw, "threads": t.threads, "interruptible": t.interruptible,
                                  "depends_on": [full[d] for d in t.depends_on]})
        biggest = max(s.capacity_kw for s in E.servers.values())
        if any(t.power_kw > biggest for t in body.tasks):
            raise HTTPException(400, f"a task needs more power than the biggest server ({biggest} kW)")
        job, tasks = make_job(spec, t0=pd.Timestamp(E.times[0]), now=float(E.now))
        if job.deadline <= E.now:
            raise HTTPException(400, "deadline is in the past (simulated time)")
        E.add_job(job, tasks)
        return camel(job_dict(E, job))


@app.get(f"{P}/customer/jobs", tags=["customer"], summary="My jobs (paginated)")
def customer_jobs(status: str = Query(None, pattern="^(queued|running|done|missed|cancelled)$"),
                  limit: int = 50, cursor: str = None, u=Depends(CUSTOMER)):
    with LOCK:
        if status:
            items = [d for d in (job_dict(E, j) for j in my_jobs(u)) if d["status"] == status]
            return paginate(camel(items), limit, cursor)
        page = paginate(my_jobs(u), limit, cursor)
        page["items"] = camel([job_dict(E, j) for j in page["items"]])
    return page


@app.get(f"{P}/customer/jobs/{{job_id}}", tags=["customer"], summary="One of my jobs with its tasks")
def customer_job(job_id: str, u=Depends(CUSTOMER)):
    with LOCK:
        j = my_job(u, job_id)
        d = job_dict(E, j)
        d["tasks"] = [task_dict(E, E.task(t)) for t in j.task_ids]
    return camel(d)


@app.get(f"{P}/customer/jobs/{{job_id}}/tasks", tags=["customer"], summary="Tasks of my job + lifecycle events")
def customer_job_tasks(job_id: str, u=Depends(CUSTOMER)):
    with LOCK:
        return camel([task_dict(E, E.task(t), detail=True) for t in my_job(u, job_id).task_ids])


@app.post(f"{P}/customer/jobs/{{job_id}}/cancel", tags=["customer"], summary="Cancel my job")
def customer_cancel(job_id: str, u=Depends(CUSTOMER)):
    with LOCK:
        j = my_job(u, job_id)
        for tid in j.task_ids:
            t = E.task(tid)
            if t.state not in FINISHED:
                t.state = CANCELLED
                t.events.append((E.now, "cancelled", t.server_id, None))
        return camel(job_dict(E, j))


@app.get(f"{P}/customer/jobs/{{job_id}}/results", tags=["customer"], summary="Result summary of my job")
def customer_results(job_id: str, u=Depends(CUSTOMER)):
    with LOCK:
        j = my_job(u, job_id)
        tasks = [E.task(t) for t in j.task_ids]
        return camel({"job_id": job_id, "status": job_dict(E, j)["status"],
                      "results": [{"task_id": t.task_id, "state": t.state, "server_id": t.server_id,
                                   "finished": iso(E.time_of(t.finished_slot)) if t.finished_slot else None,
                                   "energy_kwh": t.energy_kwh, "heat_kwh": t.heat_kwh} for t in tasks]})


def _usage_rows(u):
    rows = []
    for j in my_jobs(u):
        for tid in j.task_ids:
            t = E.task(tid)
            if t.energy_kwh > 0:
                when = E.time_of(t.finished_slot if t.finished_slot is not None else E.now)
                rows.append({"month": when.to_period("M").start_time, "priority": t.priority,
                             "server_hours": t.energy_kwh,
                             "cost_chf": t.energy_kwh * config.COMPUTE_CHF_PER_SERVER_HOUR.get(t.priority, 0)})
    return pd.DataFrame(rows, columns=["month", "priority", "server_hours", "cost_chf"])


@app.get(f"{P}/customer/usage", tags=["customer"], summary="Server-hours and cost per month and priority")
def customer_usage(u=Depends(CUSTOMER)):
    with LOCK:
        df = _usage_rows(u)
    g = df.groupby(["month", "priority"]).sum(numeric_only=True).reset_index()
    return camel([{"month": iso(r["month"]), "priority": r["priority"], "server_hours": float(r["server_hours"]),
                   "cost_chf": float(r["cost_chf"])} for r in g.to_dict("records")])


@app.get(f"{P}/customer/invoices", tags=["customer"], summary="Monthly invoices")
def customer_invoices(u=Depends(CUSTOMER)):
    with LOCK:
        df = _usage_rows(u)
    g = df.groupby("month").sum(numeric_only=True).reset_index()
    return camel([{"id": f"INV-{r['month']:%Y%m}", "month": iso(r["month"]), "server_hours": float(r["server_hours"]),
                   "amount_chf": float(r["cost_chf"]), "status": "open"} for r in g.to_dict("records")])


@app.get(f"{P}/customer/impact", tags=["customer"], summary="Heat my compute delivered to buildings")
def customer_impact(u=Depends(CUSTOMER)):
    with LOCK:
        tasks = [E.task(x) for j in my_jobs(u) for x in j.task_ids]
        df = pd.DataFrame(E.slot_rows)
        reused = df.delivered_kwh.sum() / df.produced_kwh.sum() if len(df) and df.produced_kwh.sum() else 0
        heat = sum(t.heat_kwh for t in tasks)
        sites = {E.servers[t.server_id].site_id for t in tasks if t.server_id}
    return camel({"heat_delivered_kwh": heat, "heat_reused_share_pct": 100 * min(1.0, reused),
                  "sites_heated": len(sites),
                  "note": "reused share is the fleet-wide share of server heat used by buildings in this period"})


@app.get(f"{P}/customer/api-keys", tags=["customer"], summary="My API keys (demo)")
def list_keys(u=Depends(CUSTOMER)):
    return [{"id": k, "createdAt": v} for k, v in api_keys[u["id"]].items()]


@app.post(f"{P}/customer/api-keys", tags=["customer"], summary="Create an API key (demo)")
def create_key(u=Depends(CUSTOMER)):
    key = "dh_" + secrets.token_hex(12)
    api_keys[u["id"]][key] = iso(pd.Timestamp.now(tz="Europe/Zurich"))
    return {"id": key, "createdAt": api_keys[u["id"]][key]}


@app.delete(f"{P}/customer/api-keys/{{key_id}}", tags=["customer"], summary="Delete an API key")
def delete_key(key_id: str, u=Depends(CUSTOMER)):
    if key_id not in api_keys[u["id"]]:
        raise HTTPException(404, f"api key {key_id} not found")
    api_keys[u["id"]].pop(key_id)
    return {"deleted": key_id}


# ===================================================================== SITE OWNER (client portal)
def my_site(u, site_id):
    get_or_404(E.sites, site_id, "site")
    if u["role"] != "admin" and site_id not in u.get("sites", []):
        raise HTTPException(404, f"site {site_id} not found")
    return E.sites[site_id]


@app.get(f"{P}/site/sites", tags=["site owner"], summary="My sites")
def owner_sites(u=Depends(SITE_OWNER)):
    ids = list(E.sites) if u["role"] == "admin" else u.get("sites", [])
    return [{"id": s, "name": E.sites[s].name, "type": E.sites[s].type} for s in ids if s in E.sites]


@app.get(f"{P}/site/sites/{{site_id}}/overview", tags=["site owner"], summary="Today at a glance")
def owner_overview(site_id: str, u=Depends(SITE_OWNER)):
    with LOCK:
        site = my_site(u, site_id)
        now = E.time_of(max(0, E.now - 1))
        today = pd.DataFrame(rows_between(E.slot_rows, now.normalize(), None, site_id=site_id))
        month = pd.DataFrame(rows_between(E.slot_rows, now.to_period("M").start_time, None, site_id=site_id))
        r = last_row(site_id)
        servers = [s for s in E.servers.values() if s.site_id == site_id]
        working = {sid for sid, ts in E.last_running.items() if ts}
    share = 100 * today.delivered_kwh.sum() / today.demand_kwh.sum() if len(today) and today.demand_kwh.sum() else 0
    backup = float(today.unmet_kwh.sum()) if len(today) else 0.0
    savings = float(month.delivered_kwh.sum()) * config.ELECTRICITY_CHF_PER_KWH / config.HEAT_PUMP_COP \
        if len(month) else 0.0
    return camel({"server_heat_share_pct_today": share, "tank_kwh": r["tank_kwh"],
                  "tank_capacity_kwh": site.tank_cap_kwh,
                  "servers_working": sum(1 for s in servers if s.server_id in working and s.online),
                  "servers_total": len(servers), "savings_month_chf": savings, "backup_heat_today_kwh": backup,
                  "status_message": "All heat covered by servers today" if backup == 0
                  else f"Backup heater used {backup:.1f} kWh today", "time": iso(now)})


@app.get(f"{P}/site/sites/{{site_id}}/energy", tags=["site owner"], summary="Heat by day / week / month / year")
def owner_energy(site_id: str, period: str = Query("day", pattern="^(day|week|month|year)$"), date: str = None,
                 u=Depends(SITE_OWNER)):
    with LOCK:
        my_site(u, site_id)
        day = pd.Timestamp(date) if date else E.time_of(max(0, E.now - 1)).normalize()
        start, res = {"day": (day, "1h"), "week": (day - pd.Timedelta(days=day.day_of_week), "1d"),
                      "month": (day.to_period("M").start_time, "1d"),
                      "year": (day.to_period("Y").start_time, "1mo")}[period]
        end = start + {"day": pd.Timedelta(days=1), "week": pd.Timedelta(days=7),
                       "month": pd.offsets.MonthBegin(1), "year": pd.offsets.YearBegin(1)}[period]
        rows = rows_between(E.slot_rows, start, end, site_id=site_id)
    out = resample(rows, res, sums=("demand_kwh", "delivered_kwh", "unmet_kwh"))
    return camel([{"bucket": r["time"], "demand_kwh": r["demand_kwh"],
                   "server_heat_kwh": r["delivered_kwh"],
                   "backup_heat_kwh": r["unmet_kwh"]} for r in out])


@app.get(f"{P}/site/sites/{{site_id}}/savings", tags=["site owner"], summary="Value of the server heat per month")
def owner_savings(site_id: str, frm: str = Query(None, alias="from"), to: str = None, u=Depends(SITE_OWNER)):
    with LOCK:
        my_site(u, site_id)
        rows = rows_between(E.slot_rows, frm, to, site_id=site_id)
    value = config.ELECTRICITY_CHF_PER_KWH / config.HEAT_PUMP_COP
    months = [{"month": r["time"], "server_heat_kwh": r["delivered_kwh"], "value_chf": r["delivered_kwh"] * value}
              for r in resample(rows, "1mo", sums=("delivered_kwh",))]
    return camel({"months": months, "total_chf": sum(m["value_chf"] for m in months),
                  "explanation": f"Each kWh of server heat replaces heat-pump heat worth "
                                 f"{config.ELECTRICITY_CHF_PER_KWH:.2f} CHF / {config.HEAT_PUMP_COP} "
                                 f"= {value:.3f} CHF."})


@app.get(f"{P}/site/sites/{{site_id}}/servers", tags=["site owner"], summary="Servers in my building (plain words)")
def owner_servers(site_id: str, u=Depends(SITE_OWNER)):
    plain = {"embed": "AI text processing", "transcri": "AI transcription", "image": "image recognition",
             "classif": "image recognition", "rerank": "AI search ranking", "merge": "data processing",
             "train": "AI model training", "evaluat": "AI model training", "trial": "AI experiments"}
    with LOCK:
        my_site(u, site_id)
        out = []
        for i, s in enumerate(x for x in E.servers.values() if x.site_id == site_id):
            names = [t.name for t in running_on(s.server_id)]
            kinds = sorted({next((v for k, v in plain.items() if k in n.lower()), "compute work") for n in names})
            out.append({"name": f"Server {i + 1}", "capacity_kw": s.capacity_kw,
                        "status": "offline" if not s.online else ("working" if names else "idle"),
                        "work_kind": ", ".join(kinds) or None})
    return camel(out)


@app.get(f"{P}/site/notifications", tags=["site owner"], summary="My notifications")
def owner_notifications(unread: bool = None, u=Depends(SITE_OWNER)):
    with LOCK:
        sites = set(E.sites) if u["role"] == "admin" else set(u.get("sites", []))
        items = [{"id": a["id"], "time": iso(a["time"]), "kind": a["kind"], "message": a["message"],
                  "site_id": a["site_id"], "read": a["id"] in read_flags[u["id"]]}
                 for a in reversed(E.alerts) if a["site_id"] in sites]
    return camel([n for n in items if unread is None or n["read"] != unread])


@app.patch(f"{P}/site/notifications/{{nid}}", tags=["site owner"], summary="Mark a notification read / unread")
def owner_read(nid: int, body: ReadRequest, u=Depends(SITE_OWNER)):
    (read_flags[u["id"]].add if body.read else read_flags[u["id"]].discard)(nid)
    return {"id": nid, "read": nid in read_flags[u["id"]]}


# ===================================================================== WEBSOCKET
clients = []                  # (websocket, user, set of channels)
queue = None
_seen = {"events": 0, "alerts": 0}
MAX_EVENTS_PER_TICK = 500     # after a jump, only the newest task events are pushed


def allowed(u, channel):
    if u["role"] == "admin":
        return True
    if u["role"] == "customer":
        own = {j.job_id for j in E.jobs.values() if j.customer == u.get("customer")}
        return channel == "customer" or (channel.startswith("job:") and channel[4:] in own)
    return channel.startswith("site-owner:") and channel[11:] in u.get("sites", [])


def build_messages(m):
    """After each slot: everything the dashboards need to update, as (channel, message) pairs."""
    out = []
    with m.lock:
        e, now = m.engine, iso(m.engine.time_of(max(0, m.engine.now - 1)))
        out.append(("fleet", "clock.tick", clock_dict()))
        for sid in e.sites:
            row = {"site_id": sid, **{k: v for k, v in last_row(sid).items() if k != "time"}, "time": now,
                   "status": site_status(last_row(sid), e.sites[sid])}
            out += [("fleet", "slot.tick", row), (f"site:{sid}", "slot.tick", row)]
            out.append((f"site-owner:{sid}", "overview.update", row))
        out.append(("fleet", "kpi.update", kpis(e.slot_rows[-len(e.sites):], [], e.server_rows[-len(e.servers):])))
        if m.agents:
            out.append(("fleet", "agents.update", {"items": agents_list()}))
        for s in e.servers.values():
            out.append((f"server:{s.server_id}", "server.status", server_dict(s, with_tasks=True)))
        start = max(_seen["events"], len(e.events) - MAX_EVENTS_PER_TICK)
        for ev in e.events[start:]:
            if ev["filler"] and ev["kind"] != "migrated":
                continue
            data = {**ev, "time": iso(ev["time"])}
            kind = f"task.{ev['kind']}"
            out += [(f"task:{ev['task_id']}", kind, data), (f"job:{ev['job_id']}", kind, data)]
            job = e.jobs.get(ev["job_id"])
            if job:
                out.append(("customer", "job.update", job_dict(e, job)))
            if ev["kind"] == "migrated":
                out.append(("fleet", kind, {**data, "from_site": e.servers[ev["from_server"]].site_id
                                            if ev.get("from_server") else None,
                                            "to_site": e.servers[ev["to_server"]].site_id
                                            if ev.get("to_server") else None}))
            if ev.get("to_server") or ev.get("from_server"):
                site = e.servers[ev.get("to_server") or ev.get("from_server")].site_id
                out.append((f"site:{site}", kind, data))
                out.append((f"server:{ev.get('to_server') or ev.get('from_server')}", kind, data))
        _seen["events"] = len(e.events)
        for a in e.alerts[_seen["alerts"]:]:
            out.append(("fleet", "alert.raised", {**a, "time": iso(a["time"])}))
            if a["site_id"]:
                out.append((f"site-owner:{a['site_id']}", "notification.new", {**a, "time": iso(a["time"])}))
        _seen["alerts"] = len(e.alerts)
    return [(ch, {"type": t, "channel": ch, "time": now, "data": camel(d)}) for ch, t, d in out]


async def broadcaster():
    while True:
        messages = await queue.get()
        for ws, u, channels in list(clients):
            for ch, msg in messages:
                if ch in channels and allowed(u, ch):
                    try:
                        await ws.send_text(json.dumps(msg, default=float))
                    except Exception:
                        break


@app.websocket(f"{P}/ws")
async def websocket(ws: WebSocket, token: str = ""):
    """Send {"action": "subscribe" | "unsubscribe", "channels": [...]}; receive {type, channel, time, data}."""
    if token not in config.USERS:
        await ws.close(code=4401)
        return
    await ws.accept()
    entry = (ws, {"id": token, **config.USERS[token]}, set())
    clients.append(entry)
    try:
        while True:
            try:
                msg = json.loads(await ws.receive_text())
            except ValueError:
                await ws.send_text(json.dumps({"type": "error", "data": {"message": "send JSON"}}))
                continue
            chans = set(msg.get("channels", []))
            if msg.get("action") == "subscribe":
                denied = sorted(c for c in chans if not allowed(entry[1], c))
                entry[2].update(c for c in chans if allowed(entry[1], c))
                await ws.send_text(json.dumps({"type": "subscribed", "channels": sorted(entry[2]),
                                               "denied": denied}))
            elif msg.get("action") == "unsubscribe":
                entry[2].difference_update(chans)
                await ws.send_text(json.dumps({"type": "unsubscribed", "channels": sorted(entry[2])}))
            elif msg.get("action") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        clients.remove(entry)


async def startup():
    """Start the broadcaster and (unless DH_AUTOSTART=0) the live master's clock."""
    global queue
    queue = asyncio.Queue()
    loop = asyncio.get_running_loop()
    master.listeners.append(lambda m: loop.call_soon_threadsafe(queue.put_nowait, build_messages(m)))
    asyncio.create_task(broadcaster())
    if os.environ.get("DH_AUTOSTART", "1") == "1":
        master.start()


@asynccontextmanager
async def lifespan(_app):
    await startup()
    yield


app.router.lifespan_context = lifespan
