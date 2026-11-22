# Gaps found while building the Operations specialist screens

Screens: Jobs and Tasks, Customers, Scheduler Lab, Events, Platform Economics, Settings. No backend code was changed.

| # | What | Screen | Suggested backend change | UI today |
|---|---|---|---|---|
| 1 | `computeIncomeChf` in `/admin/kpis` ignores `from`/`to`: `income_of(tasks)` sums every task of the run, so "today" and "yesterday" return the same run total | Economics, KPI strip | Count income only for task energy inside the window (per-slot income) | Economics labels compute income "since run start" and builds the live revenue mix from run totals. The KPI strip's "Compute income, today" (built elsewhere) shows the run total too |
| 2 | Tasks carry no customer; `/admin/tasks` has no `customerId` filter | Jobs and Tasks | Add `customerId` to the task dict and the filter | Customer resolved from the loaded job, else from the job-type catalogue by task name (`/admin/task-types`); custom submitted jobs show "–" until their job is loaded |
| 3 | No server-side "most recent first" for `/admin/tasks?state=done` | Jobs and Tasks | `order=desc` or `since` parameter | Reads the total, then the last page via `cursor = total - 100` |
| 4 | No slack or effective deadline on tasks | Jobs and Tasks | `slackMin`, `estimatedFinish` per task (the scheduler knows them) | Slack = deadline − now − remaining runtime, ignoring dependencies and queueing |
| 5 | No REST history of fleet-wide task lifecycle events | Events | `GET /admin/task-events?limit&cursor` | Events start when the console opens (WebSocket only); alerts come from `/admin/events` |
| 6 | Customers: no `jobsRunning`, `jobsAtRisk`, `jobsMissed`, sector, share of fleet heat, and `revenueChf` has no stated period | Customers | Add them to `/admin/customers` | Three `/admin/jobs?customerId&status` calls per customer; at risk = running job whose estimated finish is under one hour before its deadline; no heat share column |
| 7 | `/admin/jobs?status=` builds every job dict (~30k) per call and the list refetches once per slot | Customers, Jobs and Tasks | Index jobs by status, or cache per slot | Works, but costs backend CPU at 2 s slots |
| 8 | `/admin/simulations` is empty after a backend start, so `/admin/simulations/compare` has nothing to compare | Scheduler Lab | Register the yearly runs in `results/` as finished runs | Lab compares `/admin/results?algorithm=greedy` with `=mpc` |
| 9 | Simulation run response shape is undocumented (`startedAt`, `datasetId`, progress) | Scheduler Lab | Document it, add `progressPct` | Shows id, algorithm, status and the fields that exist |
| 10 | No endpoint that returns the plan revenue mix or roadmap text | Economics | Not needed in the backend; static content | Static, labelled "plan, not measured" and "Roadmap, scenario" |
