# Demo checklist

Run this end to end before going on stage. Commands are for Windows (Git Bash or PowerShell) from the repo root.

## 0. Once per laptop

- [ ] Backend: `python -m venv .venv`, then `.venv/Scripts/python -m pip install -r requirements.txt websockets` (the `websockets` package is needed for `/api/v1/ws`, see FRONTEND_GAPS.md #3).
- [ ] Frontend: `cd frontend`, `pnpm install`.
- [ ] Optional, for an offline map: `pnpm tiles` refreshes the bundled Basel tiles in `public/basemap` (already committed).

## 1. Start

- [ ] Backend, fresh run (the first weeks of the year load fastest): `DH_MQTT=0 .venv/Scripts/python -m uvicorn api.server:app --host 0.0.0.0 --port 8000`
  (PowerShell: `$env:DH_MQTT="0"; .venv\Scripts\python -m uvicorn api.server:app --host 0.0.0.0 --port 8000`)
- [ ] Frontend: `cd frontend`, `pnpm dev` (live) or `pnpm dev:mock` (no backend needed). Open `http://localhost:5173`.
- [ ] Other laptops on the hotspot: open `http://<host-ip>:5173`, press **Shift + D**, set the API address to `http://<host-ip>:8000/api/v1`, Apply.
- [ ] Shift + D shows connection diagnostics: REST latency, WebSocket state, last message age.

## 2. Three windows, one per role

- [ ] Window 1: **Operations** (admin). Fleet map of Basel with the intro flight, KPI cards, clock running ("Live").
- [ ] Window 2: **Compute buyer** (acme). Overview with running jobs.
- [ ] Window 3, phone size (390 px): **Host business** (h1owner, Hallenbad Gundeli). Today with tank ring and status sentence.

## 3. Run the scheduler for two minutes

- [ ] Scheduler Lab: set speed to 2 s per slot.
- [ ] Map: columns change height each slot, an orange pulse rises through working columns, the clock digits roll.
- [ ] A `task.migrated` between two sites draws an arc (switch the view to **Arcs** to emphasise them).
- [ ] Host window: the tank ring moves each slot. Compute window: running jobs progress.

## 4. Jump to a summer date

- [ ] Scheduler Lab: jump to 17 Jul (forward only; about 1 to 2 minutes). The clock shows "Jumping", then everything refetches.
- [ ] Sites turn amber ("Dumping heat") with a slow shimmer; flexible work migrates, arcs appear.
- [ ] Note: late in the simulated year some backend calls take several seconds (FRONTEND_GAPS.md #10). Prefer jumps of a few weeks on stage.

## 5. Pause and resume a task

- [ ] Jobs and Tasks: filter Status = Running, pick a flexible task, Pause, confirm. It leaves Running at once and shows "Paused by operator".
- [ ] Open it (row click): the task drawer shows the chain, slack and lifecycle. Resume, confirm.

## 6. Kill and restart the backend

- [ ] Stop the backend (Ctrl+C). Within seconds every window shows "Live connection lost" with a retry countdown; data stays visible, dimmed; the clock says "Offline".
- [ ] Start it again. The banner disappears by itself, the clock starts again from 1 Jan (a restart resets the run) and all lists refetch.

## 7. Fallbacks

- [ ] Map without internet: disconnect Wi-Fi, reload the Operations window. The map switches to the bundled Basel tiles ("Offline map" note at the bottom).
- [ ] No backend at all: `pnpm dev:mock`, or Shift + D, Data = Mock. A "Mock data" pill shows in the top bar.
- [ ] Reduced motion: Shift + D, "Reduce motion". Animations become instant changes; the intro is skipped.

## 8. Before the jury

- [ ] Every window on the right role; Operations in dark (or light, top bar switch).
- [ ] Intro flight replays once per browser tab; open a new tab to show it again.
