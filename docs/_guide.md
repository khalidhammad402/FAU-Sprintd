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
