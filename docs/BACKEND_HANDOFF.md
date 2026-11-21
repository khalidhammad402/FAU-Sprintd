# DigitalHeat backend: handover for the frontend

> **For the AI assistant reading this:** this file is the complete context for building the DigitalHeat frontend
> on top of an existing, tested Python backend. Sections 1–7 explain the product, how to run it and the rules;
> sections 8–10 are generated from the running backend (`python -m tools.make_handoff`), so every example is a real
> response. The machine-readable contract is `docs/openapi.json` (also live at `http://<host>:8000/openapi.json`,
> interactive docs at `/docs`). Do not invent endpoints or fields: if something is missing, ask the backend owner.
> The intended UI design is in "DigitalHeat Platform – App Design & API Spec" (summarised in section 2).

## 1. What DigitalHeat is

Servers (1 kW "rack servers") sit in the basements of buildings. They run AI compute jobs for customers; the
electricity they use becomes heat, 80 % of it is recovered into a hot-water tank (35 kWh usable) that heats the
building. Every **15-minute slot** a scheduler decides which task runs on which server so that:

1. the building's **heat demand** is met (the rest comes from a backup heater = "unmet"),
2. little heat is **dumped** (tank full),
3. every job finishes before its **deadline**.

Flexible jobs are paused or moved to another building when the tank is full; critical jobs always run.
The same scheduler code produces a yearly simulation (offline results) and controls **real processes on laptops**
(live demo: each laptop acts as one server, runs a real AI image-recognition job, and is paused/resumed by the
scheduler through MQTT).

Current data (5 sites in Basel): `H1`, `H2` (households), `FARM1`, `HOTEL1`, `HOTEL2`, 14 servers of 1 kW,
one simulated year (2021) in 35,040 slots, ~28,500 customer jobs / 112,000 tasks of 5 job types.
Note for honest labelling: the demand values come from one household's electricity meter (2021–2025 placed side
by side as 5 sites) and the site coordinates are generated; see `GET /admin/assumptions`.

## 2. What to build (from the design spec)

One React + TypeScript (Vite) codebase, two route trees:

**Operator Console (`/ops/*`, role `admin`)** — dark control-room theme, map fills the screen, panels float over it.
| Screen | What it shows | Backend |
|---|---|---|
| Fleet map (home) | 3D map of Basel (MapLibre GL + deck.gl): one column per site (height = heat demand now, colour = status), ring = servers running / total, arcs when a task migrates between sites, hover card | `GET /admin/map/sites`, `GET /admin/servers`, `GET /admin/kpis`, WS `fleet` (`slot.tick`, `task.migrated`) |
| KPI strip (every screen) | coverage %, dumped kWh, utilisation %, tasks running, missed deadlines %, break-even CHF/server-hour | `GET /admin/kpis` (scope fleet/site), WS `kpi.update` |
| Time control (every screen) | live clock, speed, pause, jump to a date (e.g. 19 Jan, 17 Jul), reset | `GET/PUT /admin/scheduler`, `POST /admin/scheduler/jump`, `POST /admin/scheduler/reset`, WS `clock.tick` |
| Site detail (drawer) | demand vs server heat vs backup chart, tank gauge 0–35 kWh, server rack (bars stacked by tasks) | `GET /admin/sites/{id}`, `/timeline`, `/servers`, WS `site:{id}` |
| Server detail | load vs capacity, current tasks with progress, CPU %, heartbeat, live/simulated | `GET /admin/servers/{id}`, `/timeline`, WS `server:{id}` |
| Live laptops panel | each real laptop: host name, online, CPU %, real processes with progress and images classified | `GET /admin/live/agents`, WS `agents.update` |
| Task explorer | filterable table, task detail with lifecycle timeline, pause / resume / cancel | `GET /admin/tasks`, `GET /admin/tasks/{id}`, `POST /admin/tasks/{id}/{action}`, WS `task:{id}` |
| Year report | yearly balance per site + fleet (coverage, dumped, utilisation, missed deadlines, money, break-even, pay-off statement), monthly chart, assumptions table | `GET /admin/results`, `GET /admin/results/timeline`, `GET /admin/assumptions` |
| Scheduler lab | start offline runs, compare | `POST/GET /admin/simulations`, `/compare` |
| Events | alerts feed, acknowledge | `GET /admin/events`, `PATCH /admin/events/{id}`, WS `alert.raised` |
| Settings | prices, job types (read-only) | `GET/PUT /admin/settings/pricing`, `GET /admin/task-types` |

**Client Portal (`/home/*`, role `site_owner`)** — light, calm, large numbers, phone first; every number has a
one-sentence explanation. Screens: Home (heat from servers today %, tank, servers working, savings this month,
status line), My energy (stacked bars day/week/month/year), Savings, My servers (plain words), Notifications.
Backend: `/site/...` endpoints and WS `site-owner:{id}`.

**Customer view (role `customer`)** — optional: submit jobs, follow them, usage, invoices: `/customer/...`.

Colour meaning (same in both apps, never reuse red/orange for anything else): server heat = warm orange,
tank = blue, backup heater = grey, heat dumped = amber, unmet demand = red, idle = neutral.
Map centre: Basel 47.56 N, 7.59 E, pitch ~55° (also in `GET /meta`). Use free tiles (e.g. OpenFreeMap), no token.

Spec ↔ backend path differences (the backend is the source of truth): spec `/map/sites`, `/kpis`, `/sites/...`,
`/tasks/...`, `/scheduler` → backend `/admin/...`; spec `/me/sites/...` → backend `/site/sites/...`;
spec `/me/notifications` → `/site/notifications`; spec algorithm `milp` → backend `mpc`;
spec WS channel `client-site:{id}` → backend `site-owner:{id}`.

## 3. Running the backend

Python 3.12, from the folder `digitalheat/`:

```
pip install -r requirements.txt
python -m sim.run --algorithm greedy        # once: yearly results for /admin/results (~1.5 min)
```

**A. One laptop, everything simulated (frontend development):**
```
set DH_MQTT=0            (PowerShell: $env:DH_MQTT="0")
python -m uvicorn api.server:app --host 0.0.0.0 --port 8000
```
Open `http://localhost:8000/docs`. The demo clock starts at 1 Jan 2021 00:00 and advances one 15-min slot every
10 real seconds (change with `PUT /admin/scheduler {"slotSeconds": 2}`).

**B. Live demo with real laptops (3 laptops on the same Wi-Fi):**
```
host laptop:   python -m live.broker                                      (MQTT broker, port 1883)
host laptop:   python -m uvicorn api.server:app --host 0.0.0.0 --port 8000
each laptop:   python -m live.agent --server-id H1-S1 --host <host laptop IP>
               (other ids: H1-S2, H2-S1, FARM1-S1, HOTEL1-S1 ... see GET /admin/servers)
```
The host laptop can also run an agent. Allow Python through the Windows firewall (private network). If the venue
Wi-Fi blocks device-to-device traffic, use a phone hotspot. Recommended clock for the live demo: `slotSeconds` 10.
Each agent writes `logs/agent_<server-id>.log` (every run / pause / resume / stop / done with timestamps).
CORS is open (`*`), so a Vite dev server on another port can call the API directly
(or proxy `/api` → `http://<host>:8000`, with `ws: true` for the WebSocket).

## 4. Conventions

- Base URL `/api/v1`; JSON field names **camelCase**; ids are strings (`H1`, `H1-S1`, `J14`, `J14-T1`).
- Units: energy **kWh** (per 15-min slot unless the field says otherwise), power **kW**, money **CHF**,
  time **ISO 8601 with offset, Europe/Zurich** (e.g. `2021-01-01T00:15:00+01:00`). The data covers 2021.
- Simulated time ≠ wall-clock time: always use `currentTime` from the backend (`GET /admin/scheduler`,
  WS `clock.tick`), never the browser clock, for "now", "today", "this month".
- Lists that can be long are paginated: `?limit=50&cursor=<nextCursor>` → `{items, nextCursor, total}`;
  `nextCursor` is `null` on the last page. Small lists (sites, servers, task types) are plain arrays.
- Time-series endpoints take `from`, `to` (ISO) and `resolution` = `15m | 1h | 1d | 1mo`: kWh fields are summed per
  bucket, `tankKwh` is the last value, `loadKw` / `capacityKw` are averages.
- Errors always look like `{"error": {"code": "not_found", "message": "site NOPE not found"}}`
  (codes: `bad_request` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `conflict` 409,
  `validation_error` 422 with `details: [{field, message}]`).
- Auth (demo, not secure): `POST /auth/login {"username", "password"}` → `{token, user}`; send
  `Authorization: Bearer <token>` (the token is the username). WebSocket: `?token=<token>`.
- Demo users (password `demo` for all): `admin` (operator), `acme`, `globex` (customers), `h1owner`, `h2owner`,
  `farm1owner`, `hotel1owner`, `hotel2owner` (one site each), `hotelgroup` (HOTEL1 + HOTEL2).
  `user.role` decides the app: `admin` → Operator Console, `site_owner` → Client Portal, `customer` → customer view.
  An admin may also call customer and site-owner endpoints (sees everything).
- State is in memory: restarting the API restarts the live run. Prices changed via the API last until restart.

## 5. Data model (what the fields mean)

- **Site**: `id, name, type (household|farm|hotel|spa|business), lat, lon, buildingHeightM, tankCapacityKwh, owner`
  + live state of the last slot: `demandKwh, producedKwh, deliveredKwh, dumpedKwh, unmetKwh, tankKwh, loadKw,
  capacityKw, serversRunning, serversTotal, status`.
  `status`: `covered` (all demand met) · `tank_low` (< 20 % full) · `unmet` (backup heater needed) ·
  `dumping` (tank full, heat thrown away). Use it for the map column colour.
- **Slot reading** (one row per site per slot): demand = heat the building needs; produced = server heat into the
  tank; delivered = heat the building got from servers+tank; unmet = from the backup heater; dumped = thrown away;
  tank = level after the slot. Always `produced + unmet = demand + dumped + Δtank`.
- **Server**: `id, siteId, capacityKw (1.0), status (online|offline), live (true = a real laptop runs it),
  loadKw, cpuPct, lastHeartbeat, tasks[]` (tasks running in the last slot with `progressPct`).
- **Job**: one customer order: `id, customerId, name, priority, status (queued|running|done|missed|cancelled),
  submittedAt, deadline, estimatedFinish, progressPct, costChf, taskIds`.
- **Task**: unit of work on one server: `id, jobId, name, state, priority (critical|normal|flexible), runtimeMin,
  powerKw, threads, interruptible, dependsOn, arrival, deadline, siteId, serverId, progressPct, energyKwh,
  heatDeliveredKwh, filler, hold, finished`; detail adds `events[] {time, kind, fromServerId, toServerId}`.
  `state`: `waiting` (not arrived / dependencies not done) → `ready` → `running` ⇄ `paused` → `done` | `missed` |
  `cancelled`. Event kinds: `ready, started, paused, resumed, migrated, server_lost, completed, missed, cancelled`.
  `hold: true` = paused by an operator. `filler: true` = background work (off by default).
- **Event (alert)**: `id, slot, time, severity (info|warning|critical), kind (unmet_demand|heat_dumped|
  deadline_missed|server_offline), siteId, serverId, jobId, message, acknowledged`.
- **KPIs** (case-brief definitions): `coveragePct` = delivered ÷ demand; `utilisationPct` = server running hours ÷
  (servers × hours); `loadFactorPct` = average load ÷ capacity; `missedDeadlinesPct` = jobs with a missed task ÷
  finished jobs; `serverHoursSold` = full-load server-hours; `breakEvenChfPerServerHour` = (electricity cost −
  value of heat used) ÷ server-hours sold; `heatValueChf` = heat delivered × electricity price ÷ 2.5.
  `/admin/results` also has `payOffStatement`: a sentence saying when the model does not pay off — show it.

## 6. WebSocket (live updates)

Connect `ws://<host>:8000/api/v1/ws?token=<token>`, then send
`{"action": "subscribe", "channels": ["fleet", "site:H1"]}` → reply `{"type": "subscribed", "channels": [...],
"denied": [...]}`. Also `unsubscribe` and `ping` (→ `pong`). Load the initial state with REST, then apply pushes.
Every push: `{"type", "channel", "time", "data"}`. `time` = start of the slot that was just computed (the values
in `data` belong to it); `clock.tick.data.currentTime` = start of the next slot (= "now" of the clock).
After every slot the backend sends:

| Channel | Who | Message types |
|---|---|---|
| `fleet` | admin | `clock.tick` (same as GET /admin/scheduler), `slot.tick` (one per site: slot reading + status), `kpi.update` (this slot), `agents.update` (live laptops, only when agents exist), `task.migrated` (with `fromSite`, `toSite` for map arcs), `alert.raised` |
| `site:{siteId}` | admin | `slot.tick`, `task.started / paused / resumed / migrated / completed / missed / ...` on that site |
| `server:{serverId}` | admin | `server.status` (server incl. current tasks), task events on that server |
| `task:{taskId}` | admin | every lifecycle event of that task |
| `customer` / `job:{jobId}` | customer (own jobs) | `job.update`, task events |
| `site-owner:{siteId}` | site owner (own site) | `overview.update`, `notification.new` |

One slot = `slotSeconds` real seconds (default 10), so animate transitions over that time. After a jump only the
newest 500 task events are pushed; reload lists with REST after `clock.tick` shows `mode` back to `live`.

## 7. Live laptops and the demo clock

- `GET /admin/scheduler` → `mode`: `live` (clock running) · `paused` · `jumping` (fast-forward in progress,
  `jumpTarget` set) · `stopped` (end of data). Also `slot`, `slotsTotal`, `currentTime`, `periodStart/End`,
  `progressPct`, `slotSeconds`, `algorithm`, `mqtt` (broker status text), `liveServers` (ids run by laptops).
- `PUT /admin/scheduler {"slotSeconds": 2, "paused": false, "algorithm": "greedy"}` — any subset.
- `POST /admin/scheduler/jump {"to": "2021-07-17T00:00:00"}` (or `{"slot": n}`): forward only, simulated
  without laptops, ~1–2 min for a whole year; poll `GET /admin/scheduler` until `mode` ≠ `jumping`.
  To go back: `POST /admin/scheduler/reset` (back to 1 Jan, reloads input files), then jump.
- `GET /admin/live/agents` → `{mqtt, items: [{serverId, siteId, host, online, cpuPct, workload, lastSeen,
  secondsSinceSeen, processes: [{taskId, name, state (running|paused|done|stopped), progressPct, images,
  accuracy, pid}], schedulerTasks: [{taskId, name, state, progressPct}]}]}` — `processes` is what really runs on
  the laptop; `schedulerTasks` is what the scheduler thinks runs there. Empty `items` = no laptop connected.
- What the demo shows: the scheduler pauses a task (tank full or operator `POST /admin/tasks/{id}/pause`) → the
  laptop suspends the real process (progress freezes) → resume → it continues; if a laptop disconnects its
  server goes `offline`, an alert is raised and its tasks move to other servers (`server_lost`, `migrated`).
- A laptop *represents* a 1 kW server: heat and energy figures use the task's nominal power, not the laptop.

## 8. Endpoint reference (generated from the running backend)

All paths start with `/api/v1`. Auth: `Authorization: Bearer <token>` (token = username after login).

| Method | Path | Role | Summary |
|---|---|---|---|
| GET | `/api/v1/health` | none | Liveness check |
| GET | `/api/v1/meta` | none | Everything a client needs to configure itself |
| POST | `/api/v1/auth/login` | none | Log in (demo users: see config.USERS) |
| GET | `/api/v1/auth/me` | any logged-in | The logged-in user |
| GET | `/api/v1/admin/map/sites` | admin | GeoJSON of all sites with live state |
| GET | `/api/v1/admin/kpis` | admin | Key figures (case-brief definitions) |
| GET | `/api/v1/admin/sites` | admin | All sites with live summary |
| GET | `/api/v1/admin/sites/{site_id}` | admin | One site + live state + today's KPIs |
| GET | `/api/v1/admin/sites/{site_id}/timeline` | admin | Slot readings of a site (live run so far) |
| GET | `/api/v1/admin/sites/{site_id}/servers` | admin | Servers of a site + current tasks |
| GET | `/api/v1/admin/servers` | admin | All servers (for map rings / rack views) |
| GET | `/api/v1/admin/servers/{server_id}` | admin | One server + current tasks |
| GET | `/api/v1/admin/servers/{server_id}/timeline` | admin | Load / capacity over time |
| GET | `/api/v1/admin/jobs` | admin | Jobs (paginated) |
| GET | `/api/v1/admin/jobs/{job_id}` | admin | One job with its tasks |
| GET | `/api/v1/admin/tasks` | admin | Tasks (paginated, filterable) |
| GET | `/api/v1/admin/tasks/{task_id}` | admin | One task + lifecycle events |
| POST | `/api/v1/admin/tasks/{task_id}/{action}` | admin | Manual pause / resume / cancel |
| GET | `/api/v1/admin/task-types` | admin | Job-type catalogue (data/job_types.json) with sources |
| GET | `/api/v1/admin/customers` | admin | Customers with job counts and revenue |
| GET | `/api/v1/admin/customers/{customer_id}` | admin | One customer + jobs |
| GET | `/api/v1/admin/scheduler` | admin | Demo clock and scheduler state |
| PUT | `/api/v1/admin/scheduler` | admin | Change algorithm, clock speed (slotSeconds) or pause / resume the clock |
| POST | `/api/v1/admin/scheduler/jump` | admin | Fast-forward the live run to a date (forward only, runs in the background) |
| POST | `/api/v1/admin/scheduler/reset` | admin | Restart the live run from the first slot (reloads the input files) |
| GET | `/api/v1/admin/live/agents` | admin | Real laptops (agents): host, CPU, real processes and their progress |
| GET | `/api/v1/admin/results` | admin | Yearly balance per site and fleet from the last offline run (must-have 3) |
| GET | `/api/v1/admin/results/timeline` | admin | Year timeline of the last offline run for one site (for yearly charts) |
| GET | `/api/v1/admin/assumptions` | admin | Every assumption with value, source and status (BRIEF / SOURCE / ASSUMPTION / MOCK / LIMIT) |
| GET | `/api/v1/admin/datasets` | admin | Demand files in data/ |
| POST | `/api/v1/admin/datasets` | admin | Upload a demand file (Excel / CSV) |
| POST | `/api/v1/admin/simulations` | admin | Start an offline year simulation (async) |
| GET | `/api/v1/admin/simulations` | admin | Simulation runs |
| GET | `/api/v1/admin/simulations/compare` | admin | Compare runs per site |
| GET | `/api/v1/admin/simulations/{run_id}` | admin | One run: status + summary |
| GET | `/api/v1/admin/simulations/{run_id}/timeline` | admin | Timeline of a run |
| GET | `/api/v1/admin/simulations/{run_id}/schedule` | admin | Tasks of a run |
| GET | `/api/v1/admin/events` | admin | Alerts (newest first, paginated) |
| PATCH | `/api/v1/admin/events/{event_id}` | admin | Acknowledge an alert |
| GET | `/api/v1/admin/settings/pricing` | admin | Prices used for the money KPIs |
| PUT | `/api/v1/admin/settings/pricing` | admin | Change prices (until restart) |
| GET | `/api/v1/customer/overview` | customer (or admin) | My jobs at a glance |
| POST | `/api/v1/customer/jobs` | customer (or admin) | Submit a job (one or more tasks) |
| GET | `/api/v1/customer/jobs` | customer (or admin) | My jobs (paginated) |
| GET | `/api/v1/customer/jobs/{job_id}` | customer (or admin) | One of my jobs with its tasks |
| GET | `/api/v1/customer/jobs/{job_id}/tasks` | customer (or admin) | Tasks of my job + lifecycle events |
| POST | `/api/v1/customer/jobs/{job_id}/cancel` | customer (or admin) | Cancel my job |
| GET | `/api/v1/customer/jobs/{job_id}/results` | customer (or admin) | Result summary of my job |
| GET | `/api/v1/customer/usage` | customer (or admin) | Server-hours and cost per month and priority |
| GET | `/api/v1/customer/invoices` | customer (or admin) | Monthly invoices |
| GET | `/api/v1/customer/impact` | customer (or admin) | Heat my compute delivered to buildings |
| GET | `/api/v1/customer/api-keys` | customer (or admin) | My API keys (demo) |
| POST | `/api/v1/customer/api-keys` | customer (or admin) | Create an API key (demo) |
| DELETE | `/api/v1/customer/api-keys/{key_id}` | customer (or admin) | Delete an API key |
| GET | `/api/v1/site/sites` | site_owner (or admin) | My sites |
| GET | `/api/v1/site/sites/{site_id}/overview` | site_owner (or admin) | Today at a glance |
| GET | `/api/v1/site/sites/{site_id}/energy` | site_owner (or admin) | Heat by day / week / month / year |
| GET | `/api/v1/site/sites/{site_id}/savings` | site_owner (or admin) | Value of the server heat per month |
| GET | `/api/v1/site/sites/{site_id}/servers` | site_owner (or admin) | Servers in my building (plain words) |
| GET | `/api/v1/site/notifications` | site_owner (or admin) | My notifications |
| PATCH | `/api/v1/site/notifications/{nid}` | site_owner (or admin) | Mark a notification read / unread |

Plus the WebSocket `/api/v1/ws?token=<token>` (section 6).

## 9. Real request / response examples

Taken from the backend after 30 simulated hours on the 5-site data. Lists are cut to 2 items (`"... N more"`), numbers rounded to 4 decimals.


### meta

**GET `/api/v1/health`** → `200` — no login
Response:
```json
{
 "status": "ok",
 "version": "1.1",
 "slot": 122,
 "mode": "live"
}
```

**GET `/api/v1/meta`** → `200` — no login; use it to configure the app (period, sites, units)
Response:
```json
{
 "name": "DigitalHeat",
 "version": "1.1",
 "demandFile": "demand - latest.xlsx",
 "periodStart": "2021-01-01T00:00:00+01:00",
 "periodEnd": "2022-01-01T00:00:00+01:00",
 "slotMinutes": 15,
 "slotsTotal": 35040,
 "sites": [
  {
   "id": "H1",
   "name": "Household H1",
   "type": "household",
   "lat": 47.555,
   "lon": 7.575
  },
  {
   "id": "H2",
   "name": "Household H2",
   "type": "household",
   "lat": 47.561,
   "lon": 7.587
  },
  "... 3 more"
 ],
 "serversTotal": 14,
 "mapCenter": {
  "lat": 47.56,
  "lon": 7.59,
  "pitch": 55,
  "zoom": 13
 },
 "units": {
  "energy": "kWh (per 15-min slot unless stated)",
  "power": "kW",
  "money": "CHF",
  "time": "ISO 8601, Europe/Zurich"
 },
 "roles": {
  "admin": "Operator Console",
  "customer": "compute customer",
  "siteOwner": "Client Portal"
 },
 "siteStatusValues": [
  "covered",
  "tank_low",
  "... 2 more"
 ],
 "taskStates": [
  "waiting",
  "ready",
  "... 5 more"
 ],
 "colours": {
  "serverHeat": "warm orange",
  "tank": "blue",
  "backupHeater": "grey",
  "dumped": "amber",
  "unmet": "red",
  "idle": "neutral"
 },
 "websocket": "/api/v1/ws?token=<token>"
}
```


### auth

**POST `/api/v1/auth/login`** → `200`

Request body:
```json
{
 "username": "admin",
 "password": "demo"
}
```
Response:
```json
{
 "token": "admin",
 "user": {
  "id": "admin",
  "role": "admin",
  "name": "DigitalHeat Admin"
 }
}
```

**GET `/api/v1/auth/me`** → `200`
Response:
```json
{
 "id": "admin",
 "role": "admin",
 "name": "DigitalHeat Admin"
}
```


### operator: fleet

**GET `/api/v1/admin/map/sites`** → `200` — GeoJSON for the 3D map
Response:
```json
{
 "type": "FeatureCollection",
 "time": "2021-01-02T06:15:00+01:00",
 "features": [
  {
   "type": "Feature",
   "geometry": {
    "type": "Point",
    "coordinates": [
     7.575,
     47.555
    ]
   },
   "properties": {
    "id": "H1",
    "name": "Household H1",
    "type": "household",
    "lat": 47.555,
    "lon": 7.575,
    "buildingHeightM": 9.0,
    "tankCapacityKwh": 35.0,
    "owner": "h1owner",
    "status": "covered",
    "demandKwh": 0.05,
    "producedKwh": 0.5592,
    "deliveredKwh": 0.05,
    "dumpedKwh": 0.0,
    "unmetKwh": 0.0,
    "tankKwh": 10.012,
    "loadKw": 2.796,
    "capacityKw": 3.0,
    "serversRunning": 3,
    "serversTotal": 3
   }
  },
  {
   "type": "Feature",
   "geometry": {
    "type": "Point",
    "coordinates": [
     7.587,
     47.561
    ]
   },
   "properties": {
    "id": "H2",
    "name": "Household H2",
    "type": "household",
    "lat": 47.561,
    "lon": 7.587,
    "buildingHeightM": 9.0,
    "tankCapacityKwh": 35.0,
    "owner": "h2owner",
    "status": "unmet",
    "demandKwh": 0.05,
    "producedKwh": 0.0,
    "deliveredKwh": 0.0,
    "dumpedKwh": 0.0,
    "unmetKwh": 0.05,
    "tankKwh": 0.0,
    "loadKw": 0.0,
    "capacityKw": 2.0,
    "serversRunning": 0,
    "serversTotal": 2
   }
  },
  "... 3 more"
 ]
}
```

**GET `/api/v1/admin/kpis`** → `200` — KPI strip, fleet scope
Response:
```json
{
 "coveragePct": 27.1323,
 "demandKwh": 45.73,
 "deliveredKwh": 12.4076,
 "dumpedKwh": 0.0,
 "unmetKwh": 33.3224,
 "utilisationPct": 11.534,
 "loadFactorPct": 6.5631,
 "serverRunningH": 49.25,
 "tasksRunning": 20,
 "electricityKwh": 28.0245,
 "electricityCostChf": 9.2481,
 "heatValueChf": 1.6378,
 "computeIncomeChf": 89.1012,
 "marginChf": 81.4909,
 "serverHoursSold": 28.0245,
 "breakEvenChfPerServerHour": 0.2716,
 "avgComputePriceChfPerServerHour": 3.1794,
 "maxElectricityPriceChfPerKwh": 3.8636,
 "marginChfPerServerHour": 2.9078,
 "paysOffBeforeHardware": 1.0,
 "jobsTotal": 28566,
 "jobsDone": 100,
 "jobsMissed": 0,
 "jobsCancelled": 0,
 "missedDeadlinesPct": 0.0
}
```

**GET `/api/v1/admin/kpis?scope=site&siteId=H1`** → `200` — KPI strip, site scope
Response:
```json
{
 "coveragePct": 99.4199,
 "demandKwh": 12.48,
 "deliveredKwh": 12.4076,
 "dumpedKwh": 0.0,
 "unmetKwh": 0.0724,
 "utilisationPct": 53.8251,
 "loadFactorPct": 30.6279,
 "serverRunningH": 49.25,
 "tasksRunning": 20,
 "electricityKwh": 28.0245,
 "electricityCostChf": 9.2481,
 "heatValueChf": 1.6378,
 "computeIncomeChf": 89.1012,
 "marginChf": 81.4909,
 "serverHoursSold": 28.0245,
 "breakEvenChfPerServerHour": 0.2716,
 "avgComputePriceChfPerServerHour": 3.1794,
 "maxElectricityPriceChfPerKwh": 3.8636,
 "marginChfPerServerHour": 2.9078,
 "paysOffBeforeHardware": 1.0,
 "jobsTotal": 107,
 "jobsDone": 100,
 "jobsMissed": 0,
 "jobsCancelled": 0,
 "missedDeadlinesPct": 0.0
}
```

**GET `/api/v1/admin/sites`** → `200`
Response:
```json
[
 {
  "id": "H1",
  "name": "Household H1",
  "type": "household",
  "lat": 47.555,
  "lon": 7.575,
  "buildingHeightM": 9.0,
  "tankCapacityKwh": 35.0,
  "owner": "h1owner",
  "status": "covered",
  "demandKwh": 0.05,
  "producedKwh": 0.5592,
  "deliveredKwh": 0.05,
  "dumpedKwh": 0.0,
  "unmetKwh": 0.0,
  "tankKwh": 10.012,
  "loadKw": 2.796,
  "capacityKw": 3.0,
  "serversRunning": 3,
  "serversTotal": 3
 },
 {
  "id": "H2",
  "name": "Household H2",
  "type": "household",
  "lat": 47.561,
  "lon": 7.587,
  "buildingHeightM": 9.0,
  "tankCapacityKwh": 35.0,
  "owner": "h2owner",
  "status": "unmet",
  "demandKwh": 0.05,
  "producedKwh": 0.0,
  "deliveredKwh": 0.0,
  "dumpedKwh": 0.0,
  "unmetKwh": 0.05,
  "tankKwh": 0.0,
  "loadKw": 0.0,
  "capacityKw": 2.0,
  "serversRunning": 0,
  "serversTotal": 2
 },
 "... 3 more"
]
```

**GET `/api/v1/admin/sites/H1`** → `200` — site drawer header
Response:
```json
{
 "id": "H1",
 "name": "Household H1",
 "type": "household",
 "lat": 47.555,
 "lon": 7.575,
 "buildingHeightM": 9.0,
 "tankCapacityKwh": 35.0,
 "owner": "h1owner",
 "status": "covered",
 "demandKwh": 0.05,
 "producedKwh": 0.5592,
 "deliveredKwh": 0.05,
 "dumpedKwh": 0.0,
 "unmetKwh": 0.0,
 "tankKwh": 10.012,
 "loadKw": 2.796,
 "capacityKw": 3.0,
 "serversRunning": 3,
 "serversTotal": 3,
 "today": {
  "coveragePct": 100.0,
  "demandKwh": 1.39,
  "deliveredKwh": 1.39,
  "dumpedKwh": 0.0,
  "unmetKwh": 0.0,
  "utilisationPct": 73.0769,
  "loadFactorPct": 54.4833,
  "serverRunningH": 14.25,
  "tasksRunning": 20,
  "electricityKwh": 10.6242,
  "electricityCostChf": 3.506,
  "heatValueChf": 0.1835,
  "computeIncomeChf": 0,
  "marginChf": -3.3225,
  "serverHoursSold": 10.6242,
  "breakEvenChfPerServerHour": 0.3127,
  "avgComputePriceChfPerServerHour": 0.0,
  "maxElectricityPriceChfPerKwh": 0.0,
  "marginChfPerServerHour": -0.3127,
  "paysOffBeforeHardware": 0.0
 }
}
```

**GET `/api/v1/admin/sites/H1/timeline?resolution=1h`** → `200` — site drawer chart
Response:
```json
[
 {
  "siteId": "H1",
  "time": "2021-01-01T00:00:00+01:00",
  "demandKwh": 0.22,
  "producedKwh": 0.366,
  "deliveredKwh": 0.1476,
  "dumpedKwh": 0.0,
  "unmetKwh": 0.0724,
  "tankKwh": 0.2184,
  "loadKw": 0.4575,
  "capacityKw": 3.0
 },
 {
  "siteId": "H1",
  "time": "2021-01-01T01:00:00+01:00",
  "demandKwh": 0.25,
  "producedKwh": 0.6222,
  "deliveredKwh": 0.25,
  "dumpedKwh": 0.0,
  "unmetKwh": 0.0,
  "tankKwh": 0.5906,
  "loadKw": 0.7777,
  "capacityKw": 3.0
 },
 "... 29 more"
]
```

**GET `/api/v1/admin/sites/H1/servers`** → `200` — server rack view
Response:
```json
[
 {
  "id": "H1-S1",
  "siteId": "H1",
  "capacityKw": 1.0,
  "status": "online",
  "live": false,
  "loadKw": 0.976,
  "cpuPct": 0.0,
  "lastHeartbeat": null,
  "tasks": [
   {
    "id": "J58-T1",
    "name": "train worker 1",
    "jobId": "J58",
    "powerKw": 0.122,
    "priority": "flexible",
    "filler": false,
    "progressPct": 93.8
   },
   {
    "id": "J144-T3",
    "name": "train worker 3",
    "jobId": "J144",
    "powerKw": 0.122,
    "priority": "flexible",
    "filler": false,
    "progressPct": 40.6
   },
   "... 6 more"
  ]
 },
 {
  "id": "H1-S2",
  "siteId": "H1",
  "capacityKw": 1.0,
  "status": "online",
  "live": false,
  "loadKw": 0.976,
  "cpuPct": 0.0,
  "lastHeartbeat": null,
  "tasks": [
   {
    "id": "J58-T3",
    "name": "train worker 3",
    "jobId": "J58",
    "powerKw": 0.122,
    "priority": "flexible",
    "filler": false,
    "progressPct": 93.8
   },
   {
    "id": "J58-T2",
    "name": "train worker 2",
    "jobId": "J58",
    "powerKw": 0.122,
    "priority": "flexible",
    "filler": false,
    "progressPct": 93.8
   },
   "... 6 more"
  ]
 },
 "... 1 more"
]
```

**GET `/api/v1/admin/servers`** → `200` — all servers (map rings)
Response:
```json
[
 {
  "id": "H1-S1",
  "siteId": "H1",
  "capacityKw": 1.0,
  "status": "online",
  "live": false,
  "loadKw": 0.976,
  "cpuPct": 0.0,
  "lastHeartbeat": null,
  "tasks": [
   {
    "id": "J58-T1",
    "name": "train worker 1",
    "jobId": "J58",
    "powerKw": 0.122,
    "priority": "flexible",
    "filler": false,
    "progressPct": 93.8
   },
   {
    "id": "J144-T3",
    "name": "train worker 3",
    "jobId": "J144",
    "powerKw": 0.122,
    "priority": "flexible",
    "filler": false,
    "progressPct": 40.6
   },
   "... 6 more"
  ]
 },
 {
  "id": "H1-S2",
  "siteId": "H1",
  "capacityKw": 1.0,
  "status": "online",
  "live": false,
  "loadKw": 0.976,
  "cpuPct": 0.0,
  "lastHeartbeat": null,
  "tasks": [
   {
    "id": "J58-T3",
    "name": "train worker 3",
    "jobId": "J58",
    "powerKw": 0.122,
    "priority": "flexible",
    "filler": false,
    "progressPct": 93.8
   },
   {
    "id": "J58-T2",
    "name": "train worker 2",
    "jobId": "J58",
    "powerKw": 0.122,
    "priority": "flexible",
    "filler": false,
    "progressPct": 93.8
   },
   "... 6 more"
  ]
 },
 "... 12 more"
]
```

**GET `/api/v1/admin/servers/H1-S1`** → `200`
Response:
```json
{
 "id": "H1-S1",
 "siteId": "H1",
 "capacityKw": 1.0,
 "status": "online",
 "live": false,
 "loadKw": 0.976,
 "cpuPct": 0.0,
 "lastHeartbeat": null,
 "tasks": [
  {
   "id": "J58-T1",
   "name": "train worker 1",
   "jobId": "J58",
   "powerKw": 0.122,
   "priority": "flexible",
   "filler": false,
   "progressPct": 93.8
  },
  {
   "id": "J144-T3",
   "name": "train worker 3",
   "jobId": "J144",
   "powerKw": 0.122,
   "priority": "flexible",
   "filler": false,
   "progressPct": 40.6
  },
  "... 6 more"
 ]
}
```

**GET `/api/v1/admin/servers/H1-S1/timeline?resolution=1h`** → `200`
Response:
```json
[
 {
  "time": "2021-01-01T00:00:00+01:00",
  "loadKw": 0.366,
  "capacityKw": 1.0,
  "cpuPct": 0.0
 },
 {
  "time": "2021-01-01T01:00:00+01:00",
  "loadKw": 0.3965,
  "capacityKw": 1.0,
  "cpuPct": 0.0
 },
 "... 29 more"
]
```


### operator: jobs & tasks

**GET `/api/v1/admin/jobs?limit=2`** → `200` — paginated
Response:
```json
{
 "items": [
  {
   "id": "J1",
   "customerId": "acme",
   "name": "Transcribe call recordings",
   "priority": "critical",
   "status": "done",
   "submittedAt": "2021-01-01T06:15:00+01:00",
   "deadline": "2021-01-01T09:15:00+01:00",
   "estimatedFinish": null,
   "progressPct": 100.0,
   "costChf": 0.808,
   "taskIds": [
    "J1-T1"
   ]
  },
  {
   "id": "J2",
   "customerId": "acme",
   "name": "Transcribe call recordings",
   "priority": "critical",
   "status": "done",
   "submittedAt": "2021-01-01T00:45:00+01:00",
   "deadline": "2021-01-01T03:45:00+01:00",
   "estimatedFinish": null,
   "progressPct": 100.0,
   "costChf": 0.808,
   "taskIds": [
    "J2-T1"
   ]
  }
 ],
 "nextCursor": "2",
 "total": 28566
}
```

**GET `/api/v1/admin/jobs/J1`** → `200`
Response:
```json
{
 "id": "J1",
 "customerId": "acme",
 "name": "Transcribe call recordings",
 "priority": "critical",
 "status": "done",
 "submittedAt": "2021-01-01T06:15:00+01:00",
 "deadline": "2021-01-01T09:15:00+01:00",
 "estimatedFinish": null,
 "progressPct": 100.0,
 "costChf": 0.808,
 "taskIds": [
  "J1-T1"
 ],
 "tasks": [
  {
   "id": "J1-T1",
   "jobId": "J1",
   "name": "transcribe",
   "state": "done",
   "priority": "critical",
   "runtimeMin": 60.0,
   "powerKw": 0.122,
   "threads": 1,
   "interruptible": false,
   "dependsOn": [],
   "arrival": "2021-01-01T06:15:00+01:00",
   "deadline": "2021-01-01T09:15:00+01:00",
   "siteId": "H1",
   "serverId": "H1-S1",
   "progressPct": 100.0,
   "energyKwh": 0.122,
   "heatDeliveredKwh": 0.0976,
   "filler": false,
   "hold": false,
   "finished": "2021-01-01T07:15:00+01:00"
  }
 ]
}
```

**GET `/api/v1/admin/tasks?state=running&limit=2`** → `200` — task explorer
Response:
```json
{
 "items": [
  {
   "id": "J58-T4",
   "jobId": "J58",
   "name": "train worker 4",
   "state": "running",
   "priority": "flexible",
   "runtimeMin": 480.0,
   "powerKw": 0.122,
   "threads": 1,
   "interruptible": true,
   "dependsOn": [],
   "arrival": "2021-01-01T23:00:00+01:00",
   "deadline": "2021-01-04T23:00:00+01:00",
   "siteId": "H1",
   "serverId": "H1-S3",
   "progressPct": 93.8,
   "energyKwh": 0.915,
   "heatDeliveredKwh": 0.732,
   "filler": false,
   "hold": false,
   "finished": null
  },
  {
   "id": "J58-T3",
   "jobId": "J58",
   "name": "train worker 3",
   "state": "running",
   "priority": "flexible",
   "runtimeMin": 480.0,
   "powerKw": 0.122,
   "threads": 1,
   "interruptible": true,
   "dependsOn": [],
   "arrival": "2021-01-01T23:00:00+01:00",
   "deadline": "2021-01-04T23:00:00+01:00",
   "siteId": "H1",
   "serverId": "H1-S2",
   "progressPct": 93.8,
   "energyKwh": 0.915,
   "heatDeliveredKwh": 0.732,
   "filler": false,
   "hold": false,
   "finished": null
  }
 ],
 "nextCursor": "2",
 "total": 18
}
```

**GET `/api/v1/admin/tasks/J14-T1`** → `200` — task detail + lifecycle
Response:
```json
{
 "id": "J14-T1",
 "jobId": "J14",
 "name": "transcribe",
 "state": "done",
 "priority": "critical",
 "runtimeMin": 60.0,
 "powerKw": 0.122,
 "threads": 1,
 "interruptible": false,
 "dependsOn": [],
 "arrival": "2021-01-01T00:00:00+01:00",
 "deadline": "2021-01-01T03:00:00+01:00",
 "siteId": "H1",
 "serverId": "H1-S1",
 "progressPct": 100.0,
 "energyKwh": 0.122,
 "heatDeliveredKwh": 0.0976,
 "filler": false,
 "hold": false,
 "finished": "2021-01-01T01:00:00+01:00",
 "events": [
  {
   "time": "2021-01-01T00:00:00+01:00",
   "kind": "ready",
   "fromServerId": null,
   "toServerId": null
  },
  {
   "time": "2021-01-01T00:00:00+01:00",
   "kind": "started",
   "fromServerId": null,
   "toServerId": "H1-S1"
  },
  "... 1 more"
 ]
}
```

**POST `/api/v1/admin/tasks/J81-T1/pause`** → `200` — also /resume and /cancel
Response:
```json
{
 "id": "J81-T1",
 "jobId": "J81",
 "name": "transcribe",
 "state": "waiting",
 "priority": "critical",
 "runtimeMin": 60.0,
 "powerKw": 0.122,
 "threads": 1,
 "interruptible": false,
 "dependsOn": [],
 "arrival": "2021-01-02T17:30:00+01:00",
 "deadline": "2021-01-02T20:30:00+01:00",
 "siteId": null,
 "serverId": null,
 "progressPct": 0.0,
 "energyKwh": 0.0,
 "heatDeliveredKwh": 0.0,
 "filler": false,
 "hold": true,
 "finished": null
}
```

**GET `/api/v1/admin/task-types`** → `200` — job-type catalogue with sources
Response:
```json
[
 {
  "id": "transcription",
  "name": "Transcribe call recordings",
  "customer": "acme",
  "priority": "critical",
  "jobsPerDay": 24,
  "deadlineH": 3,
  "tasks": [
   {
    "name": "transcribe",
    "count": 1,
    "runtimeMin": 60,
    "powerKw": 0.122,
    "heatPerSlotKwh": 0.0244,
    "interruptible": false,
    "afterAll": false
   }
  ],
  "source": "Inference job (Whisper-type speech model; Whisper is an MLPerf Inference v6.1 benchmark). One full GPU like 45.5 % of trace tasks; 60 min is above the trace ..."
 },
 {
  "id": "ctr_retrain",
  "name": "Retrain recommendation (CTR) model",
  "customer": "globex",
  "priority": "normal",
  "jobsPerDay": 12,
  "deadlineH": 12,
  "tasks": [
   {
    "name": "train",
    "count": 1,
    "runtimeMin": 120,
    "powerKw": 0.122,
    "heatPerSlotKwh": 0.0244,
    "interruptible": true,
    "afterAll": false
   }
  ],
  "source": "'ctr' is the 2nd most common workload tag (26 % of tagged instances). 120 min sits between the trace p75 (63 min) and p90 (212 min). Deadline (ready next mor..."
 },
 "... 3 more"
]
```

**GET `/api/v1/admin/customers`** → `200`
Response:
```json
[
 {
  "id": "acme",
  "name": "ACME AI",
  "jobs": 23095,
  "tasksRunning": 0,
  "revenueChf": 40.3322
 },
 {
  "id": "globex",
  "name": "Globex",
  "jobs": 5471,
  "tasksRunning": 18,
  "revenueChf": 48.769
 }
]
```


### operator: live control

**GET `/api/v1/admin/scheduler`** → `200` — clock state; poll during a jump
Response:
```json
{
 "algorithm": "greedy",
 "slotMinutes": 15,
 "slotSeconds": 10,
 "mode": "live",
 "paused": false,
 "slot": 122,
 "slotsTotal": 35040,
 "currentTime": "2021-01-02T06:30:00+01:00",
 "periodStart": "2021-01-01T00:00:00+01:00",
 "periodEnd": "2022-01-01T00:00:00+01:00",
 "progressPct": 0.35,
 "jumpTarget": null,
 "fillerEnabled": false,
 "mqtt": "disabled",
 "liveServers": []
}
```

**PUT `/api/v1/admin/scheduler`** → `200`

Request body:
```json
{
 "slotSeconds": 10,
 "paused": false
}
```
Response:
```json
{
 "algorithm": "greedy",
 "slotMinutes": 15,
 "slotSeconds": 10.0,
 "mode": "live",
 "paused": false,
 "slot": 122,
 "slotsTotal": 35040,
 "currentTime": "2021-01-02T06:30:00+01:00",
 "periodStart": "2021-01-01T00:00:00+01:00",
 "periodEnd": "2022-01-01T00:00:00+01:00",
 "progressPct": 0.35,
 "jumpTarget": null,
 "fillerEnabled": false,
 "mqtt": "disabled",
 "liveServers": []
}
```

**POST `/api/v1/admin/scheduler/jump`** → `200` — fast-forward; forward only

Request body:
```json
{
 "to": "2021-01-03T00:00:00"
}
```
Response:
```json
{
 "algorithm": "greedy",
 "slotMinutes": 15,
 "slotSeconds": 10.0,
 "mode": "jumping",
 "paused": false,
 "slot": 139,
 "slotsTotal": 35040,
 "currentTime": "2021-01-02T10:45:00+01:00",
 "periodStart": "2021-01-01T00:00:00+01:00",
 "periodEnd": "2022-01-01T00:00:00+01:00",
 "progressPct": 0.4,
 "jumpTarget": "2021-01-03T00:00:00+01:00",
 "fillerEnabled": false,
 "mqtt": "disabled",
 "liveServers": []
}
```

**GET `/api/v1/admin/live/agents`** → `200` — real laptops; empty without agents (example shape: see section 'Live laptops')
Response:
```json
{
 "mqtt": "disabled",
 "items": []
}
```


### operator: results

**GET `/api/v1/admin/results?algorithm=greedy`** → `200` — yearly balance (must-have 3); needs `python -m sim.run` once
Response:
```json
{
 "algorithm": "greedy",
 "generatedAt": "2026-11-21T16:47:27.317813158+00:00",
 "fleet": {
  "algorithm": "greedy",
  "fillerEnabled": false,
  "slots": 35040,
  "periodH": 8760.0,
  "servers": 14,
  "sites": 5,
  "serversPerSite": 2.8,
  "demandKwh": 9201.59,
  "deliveredKwh": 6192.6514,
  "coveragePct": 67.2998,
  "unmetKwh": 3008.9386,
  "dumpedKwh": 90.6192,
  "utilisationPct": 16.6018,
  "loadFactorPct": 6.4324,
  "serverRunningH": 20360.5,
  "jobsTotal": 28565,
  "jobsDone": 28565,
  "jobsMissed": 0,
  "jobsCancelled": 0,
  "missedDeadlinesPct": 0.0,
  "tasksTotal": 112153,
  "tasksDone": 112153,
  "tasksMissed": 0,
  "tasksCancelled": 0,
  "missedTasksPct": 0.0,
  "missedTasksPctByPriority": {
   "critical": 0.0,
   "normal": 0.0,
   "flexible": 0.0
  },
  "fillerTasks": 0,
  "migrations": 4031,
  "pauses": 14,
  "electricityKwh": 7888.703,
  "electricityCostChf": 2603.272,
  "heatValueChf": 817.43,
  "computeIncomeChf": 25424.112,
  "marginChf": 23638.27,
  "serverHoursSold": 7888.703,
  "breakEvenChfPerServerHour": 0.2264,
  "avgComputePriceChfPerServerHour": 3.2229,
  "maxElectricityPriceChfPerKwh": 4.698,
  "marginChfPerServerHour": 2.9965,
  "paysOffBeforeHardware": 1.0,
  "payOffStatement": "Electricity costs 2,603 CHF, the heat used is worth 817 CHF. The model does NOT pay off if computing sells for less than 0.23 CHF per server-hour (achieved h..."
 },
 "sites": [
  {
   "siteId": "H1",
   "servers": 3,
   "demandKwh": 2087.53,
   "producedKwh": 2073.7438,
   "deliveredKwh": 2024.6855,
   "dumpedKwh": 37.3703,
   "unmetKwh": 62.8445,
   "coveragePct": 96.9895,
   "dumpedSharePct": 1.8021,
   "utilisationPct": 27.6056,
   "loadFactorPct": 9.8637,
   "serverRunningH": 7254.75,
   "serverHoursSold": 2592.1797,
   "electricityKwh": 2592.1797,
   "finalTankKwh": 11.688
  },
  {
   "siteId": "H2",
   "servers": 2,
   "demandKwh": 1975.47,
   "producedKwh": 1160.3908,
   "deliveredKwh": 1141.0825,
   "dumpedKwh": 19.3083,
   "unmetKwh": 834.3875,
   "coveragePct": 57.7626,
   "dumpedSharePct": 1.6639,
   "utilisationPct": 20.2526,
   "loadFactorPct": 8.279,
   "serverRunningH": 3548.25,
   "serverHoursSold": 1450.4885,
   "electricityKwh": 1450.4885,
   "finalTankKwh": 0.0
  },
  "... 3 more"
 ]
}
```

**GET `/api/v1/admin/results/timeline?siteId=H1&resolution=1mo`** → `200` — year chart per site
Response:
```json
[
 {
  "siteId": "H1",
  "time": "2021-01-01T00:00:00+01:00",
  "demandKwh": 276.44,
  "producedKwh": 294.264,
  "deliveredKwh": 276.3676,
  "dumpedKwh": 0.0,
  "unmetKwh": 0.0724,
  "tankKwh": 17.8964,
  "loadKw": 0.4944,
  "capacityKw": 3.0
 },
 {
  "siteId": "H1",
  "time": "2021-02-01T00:00:00+01:00",
  "demandKwh": 224.01,
  "producedKwh": 223.6077,
  "deliveredKwh": 224.01,
  "dumpedKwh": 0.0,
  "unmetKwh": 0.0,
  "tankKwh": 17.4941,
  "loadKw": 0.4159,
  "capacityKw": 3.0
 },
 "... 10 more"
]
```

**GET `/api/v1/admin/assumptions`** → `200` — assumptions register
Response:
```json
[
 {
  "area": "demand",
  "name": "Demand file",
  "value": "demand - latest.xlsx",
  "status": "MOCK",
  "source": "Each value = heat needed in that 15-min slot (kWh). This file holds household ELECTRICITY meter data (Sparte Strom, 2021-2025 of one house placed side by sid..."
 },
 {
  "area": "demand",
  "name": "Timestamp meaning",
  "value": "start of the 15-min interval",
  "status": "ASSUMPTION",
  "source": "Meter exports may label the end of the interval instead (15-min shift)."
 },
 "... 33 more"
]
```

**GET `/api/v1/admin/datasets`** → `200`
Response:
```json
[
 {
  "id": "demand - latest.xlsx",
  "name": "demand - latest.xlsx",
  "active": true,
  "sizeBytes": 1063907
 },
 {
  "id": "demand.xlsx",
  "name": "demand.xlsx",
  "active": false,
  "sizeBytes": 44574
 },
 "... 1 more"
]
```

**GET `/api/v1/admin/simulations`** → `200` — POST /admin/simulations {algorithm, datasetId} starts a run (takes ~1-2 min)
Response:
```json
[]
```


### operator: events & settings

**GET `/api/v1/admin/events?limit=2`** → `200`
Response:
```json
{
 "items": [
  {
   "id": 6,
   "slot": 178,
   "time": "2021-01-02T20:30:00+01:00",
   "severity": "warning",
   "kind": "deadline_missed",
   "siteId": null,
   "serverId": null,
   "jobId": "J81",
   "message": "Task J81-T1 of job J81 missed its deadline",
   "acknowledged": false
  },
  {
   "id": 5,
   "slot": 0,
   "time": "2021-01-01T00:00:00+01:00",
   "severity": "warning",
   "kind": "unmet_demand",
   "siteId": "HOTEL2",
   "serverId": null,
   "jobId": null,
   "message": "Hotel HOTEL2: backup heater needed",
   "acknowledged": false
  }
 ],
 "nextCursor": "2",
 "total": 6
}
```

**GET `/api/v1/admin/settings/pricing`** → `200`
Response:
```json
{
 "electricityChfPerKwh": 0.33,
 "heatPumpCop": 2.5,
 "heatValueChfPerKwh": 0.132,
 "computeChfPerServerHour": {
  "critical": 6.623,
  "normal": 4.4918,
  "flexible": 2.3607
 },
 "source": "config.py (electricity: ElCom 2026 IWB H4 to confirm; compute: AWS L4 on-demand/spot)"
}
```


### customer

**POST `/api/v1/customer/jobs`** → `200`

Request body:
```json
{
 "name": "Embed archive",
 "priority": "flexible",
 "deadlineInMin": 600,
 "tasks": [
  {
   "taskId": "A",
   "runtimeMin": 30,
   "powerKw": 0.3
  },
  {
   "taskId": "B",
   "runtimeMin": 30,
   "powerKw": 0.3
  },
  {
   "taskId": "M",
   "runtimeMin": 15,
   "powerKw": 0.3,
   "dependsOn": [
    "A",
    "B"
   ]
  }
 ]
}
```
Response:
```json
{
 "id": "J28567-9970",
 "customerId": "acme",
 "name": "Embed archive",
 "priority": "flexible",
 "status": "queued",
 "submittedAt": "2021-01-03T00:00:00+01:00",
 "deadline": "2021-01-03T10:00:00+01:00",
 "estimatedFinish": "2021-01-03T01:15:00+01:00",
 "progressPct": 0.0,
 "costChf": 0.0,
 "taskIds": [
  "J28567-9970-A",
  "J28567-9970-B",
  "... 1 more"
 ]
}
```

**GET `/api/v1/customer/overview`** → `200`
Response:
```json
{
 "jobsRunning": 2,
 "jobsQueued": 22956,
 "jobsDone": 137,
 "jobsMissed": 1,
 "jobsAtRisk": [],
 "spendMonthChf": 61.9572,
 "heatDeliveredKwh": 12.0974
}
```

**GET `/api/v1/customer/jobs?limit=2`** → `200`
Response:
```json
{
 "items": [
  {
   "id": "J1",
   "customerId": "acme",
   "name": "Transcribe call recordings",
   "priority": "critical",
   "status": "done",
   "submittedAt": "2021-01-01T06:15:00+01:00",
   "deadline": "2021-01-01T09:15:00+01:00",
   "estimatedFinish": null,
   "progressPct": 100.0,
   "costChf": 0.808,
   "taskIds": [
    "J1-T1"
   ]
  },
  {
   "id": "J2",
   "customerId": "acme",
   "name": "Transcribe call recordings",
   "priority": "critical",
   "status": "done",
   "submittedAt": "2021-01-01T00:45:00+01:00",
   "deadline": "2021-01-01T03:45:00+01:00",
   "estimatedFinish": null,
   "progressPct": 100.0,
   "costChf": 0.808,
   "taskIds": [
    "J2-T1"
   ]
  }
 ],
 "nextCursor": "2",
 "total": 23096
}
```

**GET `/api/v1/customer/jobs/J28566-ee1b`** → `200`
Response:
```json
{
 "id": "J28566-ee1b",
 "customerId": "acme",
 "name": "Embed archive",
 "priority": "flexible",
 "status": "done",
 "submittedAt": "2021-01-02T06:00:00+01:00",
 "deadline": "2021-01-02T16:00:00+01:00",
 "estimatedFinish": null,
 "progressPct": 100.0,
 "costChf": 0.8852,
 "taskIds": [
  "J28566-ee1b-A",
  "J28566-ee1b-B",
  "... 1 more"
 ],
 "tasks": [
  {
   "id": "J28566-ee1b-A",
   "jobId": "J28566-ee1b",
   "name": "A",
   "state": "done",
   "priority": "flexible",
   "runtimeMin": 30.0,
   "powerKw": 0.3,
   "threads": 1,
   "interruptible": true,
   "dependsOn": [],
   "arrival": "2021-01-02T06:00:00+01:00",
   "deadline": "2021-01-02T16:00:00+01:00",
   "siteId": "H1",
   "serverId": "H1-S3",
   "progressPct": 100.0,
   "energyKwh": 0.15,
   "heatDeliveredKwh": 0.12,
   "filler": false,
   "hold": false,
   "finished": "2021-01-02T06:30:00+01:00"
  },
  {
   "id": "J28566-ee1b-B",
   "jobId": "J28566-ee1b",
   "name": "B",
   "state": "done",
   "priority": "flexible",
   "runtimeMin": 30.0,
   "powerKw": 0.3,
   "threads": 1,
   "interruptible": true,
   "dependsOn": [],
   "arrival": "2021-01-02T06:00:00+01:00",
   "deadline": "2021-01-02T16:00:00+01:00",
   "siteId": "H1",
   "serverId": "H1-S3",
   "progressPct": 100.0,
   "energyKwh": 0.15,
   "heatDeliveredKwh": 0.12,
   "filler": false,
   "hold": false,
   "finished": "2021-01-02T06:30:00+01:00"
  },
  "... 1 more"
 ]
}
```

**GET `/api/v1/customer/jobs/J28566-ee1b/tasks`** → `200`
Response:
```json
[
 {
  "id": "J28566-ee1b-A",
  "jobId": "J28566-ee1b",
  "name": "A",
  "state": "done",
  "priority": "flexible",
  "runtimeMin": 30.0,
  "powerKw": 0.3,
  "threads": 1,
  "interruptible": true,
  "dependsOn": [],
  "arrival": "2021-01-02T06:00:00+01:00",
  "deadline": "2021-01-02T16:00:00+01:00",
  "siteId": "H1",
  "serverId": "H1-S3",
  "progressPct": 100.0,
  "energyKwh": 0.15,
  "heatDeliveredKwh": 0.12,
  "filler": false,
  "hold": false,
  "finished": "2021-01-02T06:30:00+01:00",
  "events": [
   {
    "time": "2021-01-02T06:00:00+01:00",
    "kind": "ready",
    "fromServerId": null,
    "toServerId": null
   },
   {
    "time": "2021-01-02T06:00:00+01:00",
    "kind": "started",
    "fromServerId": null,
    "toServerId": "H1-S3"
   },
   "... 1 more"
  ]
 },
 {
  "id": "J28566-ee1b-B",
  "jobId": "J28566-ee1b",
  "name": "B",
  "state": "done",
  "priority": "flexible",
  "runtimeMin": 30.0,
  "powerKw": 0.3,
  "threads": 1,
  "interruptible": true,
  "dependsOn": [],
  "arrival": "2021-01-02T06:00:00+01:00",
  "deadline": "2021-01-02T16:00:00+01:00",
  "siteId": "H1",
  "serverId": "H1-S3",
  "progressPct": 100.0,
  "energyKwh": 0.15,
  "heatDeliveredKwh": 0.12,
  "filler": false,
  "hold": false,
  "finished": "2021-01-02T06:30:00+01:00",
  "events": [
   {
    "time": "2021-01-02T06:00:00+01:00",
    "kind": "ready",
    "fromServerId": null,
    "toServerId": null
   },
   {
    "time": "2021-01-02T06:00:00+01:00",
    "kind": "started",
    "fromServerId": null,
    "toServerId": "H1-S3"
   },
   "... 1 more"
  ]
 },
 "... 1 more"
]
```

**GET `/api/v1/customer/jobs/J28566-ee1b/results`** → `200`
Response:
```json
{
 "jobId": "J28566-ee1b",
 "status": "done",
 "results": [
  {
   "taskId": "J28566-ee1b-A",
   "state": "done",
   "serverId": "H1-S3",
   "finished": "2021-01-02T06:30:00+01:00",
   "energyKwh": 0.15,
   "heatKwh": 0.12
  },
  {
   "taskId": "J28566-ee1b-B",
   "state": "done",
   "serverId": "H1-S3",
   "finished": "2021-01-02T06:30:00+01:00",
   "energyKwh": 0.15,
   "heatKwh": 0.12
  },
  "... 1 more"
 ]
}
```

**GET `/api/v1/customer/usage`** → `200`
Response:
```json
[
 {
  "month": "2021-01-01T00:00:00+01:00",
  "priority": "critical",
  "serverHours": 6.161,
  "costChf": 40.804
 },
 {
  "month": "2021-01-01T00:00:00+01:00",
  "priority": "flexible",
  "serverHours": 8.9607,
  "costChf": 21.1532
 }
]
```

**GET `/api/v1/customer/invoices`** → `200`
Response:
```json
[
 {
  "id": "INV-202101",
  "month": "2021-01-01T00:00:00+01:00",
  "serverHours": 15.1217,
  "amountChf": 61.9572,
  "status": "open"
 }
]
```

**GET `/api/v1/customer/impact`** → `200`
Response:
```json
{
 "heatDeliveredKwh": 12.0974,
 "heatReusedSharePct": 56.2185,
 "sitesHeated": 1,
 "note": "reused share is the fleet-wide share of server heat used by buildings in this period"
}
```


### site owner

**GET `/api/v1/site/sites`** → `200`
Response:
```json
[
 {
  "id": "H1",
  "name": "Household H1",
  "type": "household"
 }
]
```

**GET `/api/v1/site/sites/H1/overview`** → `200` — portal home
Response:
```json
{
 "serverHeatSharePctToday": 100.0,
 "tankKwh": 16.6094,
 "tankCapacityKwh": 35.0,
 "serversWorking": 2,
 "serversTotal": 3,
 "savingsMonthChf": 2.8152,
 "backupHeatTodayKwh": 0.0,
 "statusMessage": "All heat covered by servers today",
 "time": "2021-01-02T23:45:00+01:00"
}
```

**GET `/api/v1/site/sites/H1/energy?period=day`** → `200` — period=day|week|month|year
Response:
```json
[
 {
  "bucket": "2021-01-02T00:00:00+01:00",
  "demandKwh": 0.27,
  "serverHeatKwh": 0.27,
  "backupHeatKwh": 0.0
 },
 {
  "bucket": "2021-01-02T01:00:00+01:00",
  "demandKwh": 0.2,
  "serverHeatKwh": 0.2,
  "backupHeatKwh": 0.0
 },
 "... 22 more"
]
```

**GET `/api/v1/site/sites/H1/savings`** → `200`
Response:
```json
{
 "months": [
  {
   "month": "2021-01-01T00:00:00+01:00",
   "serverHeatKwh": 21.3276,
   "valueChf": 2.8152
  }
 ],
 "totalChf": 2.8152,
 "explanation": "Each kWh of server heat replaces heat-pump heat worth 0.33 CHF / 2.5 = 0.132 CHF."
}
```

**GET `/api/v1/site/sites/H1/servers`** → `200`
Response:
```json
[
 {
  "name": "Server 1",
  "capacityKw": 1.0,
  "status": "working",
  "workKind": "AI model training, AI transcription"
 },
 {
  "name": "Server 2",
  "capacityKw": 1.0,
  "status": "working",
  "workKind": "AI model training"
 },
 "... 1 more"
]
```

**GET `/api/v1/site/notifications`** → `200`
Response:
```json
[
 {
  "id": 1,
  "time": "2021-01-01T00:00:00+01:00",
  "kind": "unmet_demand",
  "message": "Household H1: backup heater needed",
  "siteId": "H1",
  "read": false
 }
]
```


### errors

**GET `/api/v1/admin/sites`** → `401` — no token -> 401
Response:
```json
{
 "error": {
  "code": "unauthorized",
  "message": "login required: send Authorization: Bearer <token>"
 }
}
```

**GET `/api/v1/admin/sites`** → `403` — wrong role -> 403
Response:
```json
{
 "error": {
  "code": "forbidden",
  "message": "not allowed for role customer (needs admin)"
 }
}
```

**GET `/api/v1/admin/sites/NOPE`** → `404` — unknown id -> 404
Response:
```json
{
 "error": {
  "code": "not_found",
  "message": "site NOPE not found"
 }
}
```

**POST `/api/v1/customer/jobs`** → `422` — invalid body -> 422

Request body:
```json
{
 "deadlineInMin": 60,
 "tasks": []
}
```
Response:
```json
{
 "error": {
  "code": "validation_error",
  "message": "invalid request: tasks: List should have at least 1 item after validation, not 0",
  "details": [
   {
    "field": "tasks",
    "message": "List should have at least 1 item after validation, not 0"
   }
  ]
 }
}
```

## 10. Real WebSocket messages (one slot, channels fleet + site:H1 + server)

```json
{
 "type": "subscribed",
 "channels": [
  "fleet",
  "server:H1-S1",
  "site:H1"
 ],
 "denied": []
}
```
```json
{
 "type": "clock.tick",
 "channel": "fleet",
 "time": "2021-01-03T00:00:00+01:00",
 "data": {
  "algorithm": "greedy",
  "slotMinutes": 15,
  "slotSeconds": 10.0,
  "mode": "live",
  "paused": false,
  "slot": 193,
  "slotsTotal": 35040,
  "currentTime": "2021-01-03T00:15:00+01:00",
  "periodStart": "2021-01-01T00:00:00+01:00",
  "periodEnd": "2022-01-01T00:00:00+01:00",
  "progressPct": 0.55,
  "jumpTarget": null,
  "fillerEnabled": false,
  "mqtt": "disabled",
  "liveServers": []
 }
}
```
```json
{
 "type": "slot.tick",
 "channel": "fleet",
 "time": "2021-01-03T00:00:00+01:00",
 "data": {
  "siteId": "H1",
  "slot": 192,
  "demandKwh": 0.05,
  "producedKwh": 0.364,
  "deliveredKwh": 0.05,
  "dumpedKwh": 0.0,
  "unmetKwh": 0.0,
  "tankKwh": 16.9234,
  "loadKw": 1.82,
  "capacityKw": 3.0,
  "serversRunning": 2,
  "serversTotal": 3,
  "time": "2021-01-03T00:00:00+01:00",
  "status": "covered"
 }
}
```
```json
{
 "type": "kpi.update",
 "channel": "fleet",
 "time": "2021-01-03T00:00:00+01:00",
 "data": {
  "coveragePct": 22.7273,
  "demandKwh": 0.22,
  "deliveredKwh": 0.05,
  "dumpedKwh": 0.0,
  "unmetKwh": 0.17,
  "utilisationPct": 14.2857,
  "loadFactorPct": 13.0,
  "serverRunningH": 0.5,
  "tasksRunning": 14,
  "electricityKwh": 0.455,
  "electricityCostChf": 0.1502,
  "heatValueChf": 0.0066,
  "computeIncomeChf": 0,
  "marginChf": -0.1436,
  "serverHoursSold": 0.455,
  "breakEvenChfPerServerHour": 0.3155,
  "avgComputePriceChfPerServerHour": 0.0,
  "maxElectricityPriceChfPerKwh": 0.0,
  "marginChfPerServerHour": -0.3155,
  "paysOffBeforeHardware": 0.0
 }
}
```
```json
{
 "type": "server.status",
 "channel": "server:H1-S1",
 "time": "2021-01-03T00:00:00+01:00",
 "data": {
  "id": "H1-S1",
  "siteId": "H1",
  "capacityKw": 1.0,
  "status": "online",
  "live": false,
  "loadKw": 0.971,
  "cpuPct": 0.0,
  "lastHeartbeat": null,
  "tasks": [
   {
    "id": "J105-T1",
    "name": "train",
    "jobId": "J105",
    "powerKw": 0.122,
    "priority": "normal",
    "filler": false,
    "progressPct": 87.5
   },
   {
    "id": "J117-T1",
    "name": "train",
    "jobId": "J117",
    "powerKw": 0.122,
    "priority": "normal",
    "filler": false,
    "progressPct": 75.0
   },
   "... 6 more"
  ]
 }
}
```
