# DigitalHeat – scheduler, live prototype and API

Servers in building basements run compute jobs; their heat warms the building through a tank.
Every 15-minute slot the scheduler decides which task runs on which server, so that heat demand is
met, little heat is dumped and every job finishes before its deadline.

The same code produces the offline results (simulation) and controls real processes on laptops (live).

## Walkthrough video

A 9-minute tour of the web frontend with voiceover: the Operations Console (3D fleet map of Basel, site, server
and task drawers, scheduler lab, events, platform economics, settings), the Compute Portal and the Host Portal.
Click the image to open the video.

[![DigitalHeat walkthrough: Operations Console, Compute Portal and Host Portal](docs/media/walkthrough-thumbnail.jpg)](docs/media/DigitalHeat_walkthrough.mp4)

Recorded in the frontend's mock mode (recorded backend data, simulated time). The frontend and how to run it:
[`frontend/README.md`](frontend/README.md).

## Quick start

```
pip install -r requirements.txt
python make_mock_data.py                      # or: python make_mock_data.py --demand my_heat.xlsx
python -m sim.run --algorithm both            # greedy vs MPC, results in results/
python -m pytest -q                           # 16 tests
DH_MQTT=0 uvicorn api.server:app --port 8000  # API + simulated live clock, docs at http://localhost:8000/docs
```

## Using your own data

1. `python make_mock_data.py --demand path/to/your.xlsx`
   - copies your file to `data/demand.xlsx` and creates `sites.csv`, `servers.csv` and `jobs.json` to match it
     (servers sized to each site's peak; jobs = an illustrative mix).
2. Edit `data/servers.csv` and `data/jobs.json` to your own fleet and jobs (formats below).
3. `python -m sim.run --algorithm both`

## Jobs for a whole year (`make_jobs.py`)

`data/job_types.json` is a catalogue of job types (runtime, GPUs, priority, deadline, jobs per day, how a job
splits into tasks), each number with its source (Alibaba GPU trace 2020, NVIDIA L4 datasheet, AWS prices) or
marked ASSUMPTION. `python make_jobs.py` repeats these types every day of the demand file (Poisson counts,
arrival hours from the trace) and writes `data/jobs.json`; it prints how much of the heat need the jobs cover.
`--scale 0.5` halves the volume, `--days 7` limits it to a week.
`python make_mock_data.py --demand <file> --no-jobs` regenerates sites and servers without touching jobs.json.
Missing slots in the demand file (summer-time change) are filled by interpolation when it is loaded.
Raw source data lives in `data/sources/`.

## Input files (`data/`)

| File | Columns / fields | Unit |
|---|---|---|
| `demand.xlsx` (or .csv) | 1st column timestamp (15-min steps), then one column per site | kWh per slot |
| `sites.csv` (optional) | `site_id, name, type, lat, lon, building_height_m, tank_kwh, owner` | `type`: household / farm / hotel / spa / business |
| `servers.csv` | `server_id, site_id, capacity_kw` | kW |
| `jobs.json` | list of jobs, see below | |

`site_id` = the column name in the demand file.

```json
{
  "job_id": "J7", "customer": "acme", "name": "Embed archive", "priority": "flexible",
  "arrival": "2025-01-13T08:00:00", "deadline": "2025-01-14T08:00:00",
  "tasks": [
    {"task_id": "J7-T1", "name": "batch 1", "runtime_min": 30, "power_kw": 0.3, "threads": 1, "interruptible": true},
    {"task_id": "J7-T2", "name": "batch 2", "runtime_min": 30, "power_kw": 0.3},
    {"task_id": "J7-T3", "name": "merge", "runtime_min": 15, "power_kw": 0.3, "depends_on": ["J7-T1", "J7-T2"]}
  ]
}
```

Every task has: runtime, power (all threads together), deadline (from the job), priority
(critical / normal / flexible), interruptible, threads, depends_on, arrival. The job author decides how a job
is split into tasks, like threads in an OS; the scheduler only decides when and where each task runs.

## Project structure

```
config.py            every setting and assumption
core/models.py       Site, Server, Task, Job
core/data.py         reads the input files
core/scheduler.py    greedy scheduler (the heart)
core/mpc.py          MPC planner: 24 h look-ahead optimisation -> heat target per site
core/physics.py      tank: produced, delivered, dumped, unmet
core/engine.py       runs one slot: states -> plan -> apply -> physics -> progress (used by sim AND live)
core/metrics.py      key figures
sim/run.py           offline simulation over the whole demand file
live/master.py       demo clock, same engine, sends commands to laptops over MQTT
live/agent.py        runs on each laptop, starts / pauses / resumes / stops real processes
live/workload.py     the real CPU job (replace with real AI work later)
api/server.py        REST + WebSocket for the three dashboards
api/helpers.py       formatting helpers for the API
make_mock_data.py    creates test inputs (or matches them to your demand file)
tests/               unit tests (scheduler) and API tests
```

## How the scheduler decides (core/scheduler.py)

Each slot:

1. **States.** A task becomes *ready* when it has arrived and all `depends_on` tasks are done. A task past its
   deadline becomes *missed*, and so does everything that depends on it. Tasks on a server that went offline
   lose their server and are placed elsewhere.
2. **Effective deadlines.** A task others depend on must finish early enough for them:
   `effective deadline = min(own deadline, dependent's effective deadline − dependent's runtime)`.
   Slack = effective deadline − now − remaining runtime.
3. **Order.** Pinned (running, cannot be paused) → critical → urgent (slack < 1 slot) → normal → flexible;
   inside a group, running tasks first, then least slack.
4. **Placement.** A task fits a server if its power fits the server's free capacity (a multi-thread task needs
   one server big enough). Per site: `low = demand − tank` (below: house not warm),
   `high = low + free tank space` (above: heat dumped), `target` = keep tank half full (greedy) or the MPC plan.
   - Pinned, critical and urgent tasks run now, preferring sites that can use the heat. Lower-priority tasks
     not placed this slot are paused automatically (preemption).
   - Normal and flexible tasks run only where heat is still wanted; a running task keeps its server while its
     heat is useful. When a house's tank is full, they pause, or move to a site that needs heat.
5. **Filler.** If `FILLER_ENABLED`, remaining heat gaps are filled with background work (unlimited spot-market
   tasks), choosing the task size and server that gets closest to the target (best fit).

**MPC mode** (`ALGORITHM = "mpc"`): every slot a linear program plans the next 24 h of server power per site
(meet demand > avoid dumping > keep a small tank buffer > save power) and pre-charges tanks before peaks.
Only the first slot is used, as the heat target for the same greedy placement. Deadlines, dependencies and
server fit stay in the greedy step. On the mock data with undersized servers it cut unmet demand from
349 to 318 kWh; with enough servers both reach 100 % coverage.

## Outputs (`results/<algorithm>/`)

| File | Content |
|---|---|
| `timeline.csv` | per site and slot: demand, produced, delivered, dumped, unmet, tank, load |
| `servers_timeline.csv` | per server and slot: load, capacity, online |
| `tasks.csv` | every task: state, server, energy, heat, finish time |
| `events.csv` | lifecycle events: started, paused, resumed, migrated, completed, missed |
| `summary_sites.csv` | per site: coverage %, dumped, unmet, utilisation % |
| `summary_fleet.json` | coverage, dumped, utilisation, missed deadlines %, migrations, electricity cost, heat value, compute income, break-even CHF per server-hour |

Definitions (case brief, see `core/metrics.py`): coverage = delivered ÷ demand;
utilisation = server running hours ÷ (servers × 8,760 h), a server runs in a slot when it has any load
(`load_factor_pct` = average load ÷ capacity is reported too); missed deadlines = jobs with a missed task ÷ finished
jobs; server-hours sold = Σ load ÷ capacity × hours (= kWh for 1 kW servers);
heat value = heat used × electricity price ÷ 2.5; break-even = (electricity cost − heat value) ÷ server-hours sold.
`summary_fleet.json` also holds `pay_off_statement`: when the model does not pay off (hardware not included).

All assumptions with value, source and status: `python -m core.assumptions` writes `ASSUMPTIONS.md`;
every run also saves `results/<algorithm>/assumptions.csv`.

## Live demo with laptops

1. On the host laptop: `python -m live.broker` (MQTT broker in Python, port 1883; no Mosquitto needed;
   allow Python through the firewall on private networks).
2. On the host laptop: `python -m uvicorn api.server:app --host 0.0.0.0 --port 8000` (starts the master and the API).
3. On each laptop (same repo): `python -m live.agent --server-id H1-S1 --host <host laptop IP>`.
   The server id must exist in `servers.csv`. That server now runs real processes; all others stay simulated.
   Every run / pause / resume / stop / done is logged with a timestamp in `logs/agent_<server-id>.log`.
4. Demo clock: one slot = `SLOT_SECONDS` real seconds (default 10). Change live with
   `PUT /api/v1/admin/scheduler {"slotSeconds": 2}`; pause with `{"paused": true}`; fast-forward with
   `POST /api/v1/admin/scheduler/jump {"to": "2021-07-17T00:00:00"}`; start again with `POST .../scheduler/reset`.

The real job (`live/workload.py`) is AI image recognition: a scikit-learn neural network (1024-1024-512-10)
classifying 32x32 handwritten digits from scikit-learn's bundled dataset (no download), CPU only, with a progress
checkpoint so a task can continue on another laptop. `python -m live.measure` (laptop on battery) measures its
runtime, images/s and energy with the battery meter and writes `data/measurements/<host>.json`, including the
scaling to the 1 kW reference server (same energy per image).

What happens: tasks placed on a laptop's server start as real processes; pause/resume use `psutil`
suspend/resume; a task moved to another server stops on the old laptop and continues on the new one from its
last progress. If a laptop disconnects, the broker's Last Will marks it offline and its tasks are re-placed.
Heat is computed from each task's nominal power: a laptop *represents* a server, it does not heat anything.

Without laptops: `python -m live.master --no-mqtt` prints the live run in the terminal.

## API

**Frontend developers: start with [docs/BACKEND_HANDOFF.md](docs/BACKEND_HANDOFF.md)** (full context, every
endpoint with a real request/response, WebSocket messages) and `docs/openapi.json`. Regenerate both after any API
change with `python -m tools.make_handoff` (hand-written part: `docs/_guide.md`).

Base `/api/v1`, interactive docs at `/docs`. Login: `POST /auth/login {"username": "admin", "password": "demo"}`
(demo users in `config.USERS`: admin, acme, globex, h1owner … hotelgroup), then `Authorization: Bearer <token>`.
Errors: `{"error": {"code", "message"}}`. New in 1.1: `/health`, `/meta`, `/admin/servers`, `/admin/task-types`,
`/admin/live/agents`, `/admin/scheduler/jump`, `/admin/scheduler/reset`, `/admin/results`,
`/admin/results/timeline`, `/admin/assumptions`, WS `clock.tick` and `agents.update`.

- **Admin** `/admin/...`: map/sites (GeoJSON), kpis, sites, sites/{id}/timeline, servers, jobs, tasks
  (+ pause/resume/cancel), customers, scheduler, datasets, simulations (+ compare), events, settings/pricing
- **Customer** `/customer/...`: overview, jobs (submit with tasks, list, detail, cancel, results), usage,
  invoices, impact, api-keys
- **Site owner** `/site/...`: sites, overview, energy, savings, servers, notifications
- **WebSocket** `/api/v1/ws?token=<token>`, send `{"action": "subscribe", "channels": ["fleet", "site:H1"]}`.
  Channels: `fleet`, `site:{id}`, `server:{id}`, `task:{id}` (admin), `customer`, `job:{id}` (customer),
  `site-owner:{id}` (site owner). Messages: `{type, channel, time, data}`.

## Assumptions and limits

- Prices in `config.py` are placeholders: set the ElCom IWB H4 price and your compute prices.
- Task runtime/power in the mock jobs are illustrative; replace them with measured values.
- State is in memory: restarting the API restarts the replay. Auth is a demo, not secure.
- Moving results between laptops (for a merge task) is not modelled.
- The MPC uses perfect foresight by default (`FORECAST = "perfect"`); set `"persistence"` for a realistic
  forecast (same slot yesterday).
