# Frontend gaps

Things the UI needs that the backend does not provide (yet). No backend code was changed; each item says how the UI degrades.

| # | What | Screen | Suggested backend change | UI today |
|---|---|---|---|---|
| 1 | Bare `Infinity` / `NaN` in JSON (REST KPIs and WebSocket `kpi.update`) | Every KPI | Serialise non-finite floats as `null` (`json.dumps(..., allow_nan=False)` after cleaning) | Tolerant parser maps them to `null`, shown as "–" |
| 2 | `GET /admin/sites/{id}` returns 500 when today's KPIs contain `inf` | Site drawer | Same fix as 1 | Header from `/admin/sites`, today's KPIs from `/admin/kpis?scope=site` |
| 3 | `requirements.txt` has no WebSocket library, so `/api/v1/ws` answers 404 | All live updates | Add `websockets` or `uvicorn[standard]` | Reconnect banner keeps retrying; REST still works |
| 4 | Response bodies are untyped in `openapi.json` | All | `response_model=` on routes | Hand-written zod schemas from captured responses |
| 5 | No `clock.tick` for customer and site-owner roles | Compute and Host time label | Send `clock.tick` on `customer` and `site-owner:{id}` | Simulated time derived from message times |
| 6 | Unmet demand alerts are raised as `warning` | Alerts | Raise `unmet_demand` as `critical` | Shown as critical |
| 7 | No site status `offline` and no `lastSeen` | Map, drawers, Host Today | Add `offline` when all servers of a site are offline | Not shown unless sent |
| 8 | `/meta.roles.siteOwner` says "Client Portal" | Labels | Rename to "Host Portal" | UI uses its own labels |
| 9 | `GET /admin/simulations/compare` needs finished runs; none exist after start | Scheduler Lab | Seed runs from `results/` | Lab compares `/admin/results?algorithm=greedy` and `=mpc` |
| 10 | **Slow endpoints hold the engine lock.** Measured at slot ~19,100 (mid-July): `/site/sites/{id}/overview` 14 s, `/customer/overview` 9 s, `/customer/jobs?status=running` 7.9 s, `/admin/jobs?status=running` 9 s, `/customer/usage` 3.3 s. While they run, the simulated clock stalls (2.6 s per slot with no clients, much longer under load) | Compute and Host first load, every live screen | Index jobs by status and cache `job_dict`; keep per-day aggregates instead of scanning `slot_rows` with pandas per request | Per-slot refetch is throttled per endpoint (8 to 90 s) and never cancels a running request; Compute loads queued and finished lists only on My Jobs. The portals' first load can still take 10 to 20 s late in the year. For the demo, start a fresh backend or jump only a few weeks |
| 11 | `/admin/kpis?from=&to=` filters energy rows but not income or job outcomes (`income_of(all tasks)`) | KPI strip, Economics | Filter tasks and jobs by the same window | Compute income and missed deadlines are labelled "since run start" |
| 12 | **Privacy:** every `job.update` goes to every customer on the shared `customer` channel | Compute Portal | Per-customer channel or a server-side filter | The UI drops other customers' jobs before rendering |
| 13 | **Security:** an API key's `id` is the secret, and the list returns secrets in full | API keys | Separate id and secret; return the secret only on create | The UI masks keys after the one-time reveal |

Per-experience details follow.

## Host Portal gaps

Backend fields and endpoints the Host Portal needs but does not get. No backend code was changed; each line says how the UI degrades.

| # | What | Screen | Suggested backend change | UI today |
|---|---|---|---|---|
| H1 | `/site/sites/{id}/overview` has no `serverHeatTodayKwh` | Today | Add the kWh next to `serverHeatSharePctToday` | Sum of `serverHeatKwh` from `/energy?period=day` |
| H2 | Overview has no `status` and no last-contact time | Today status sentence | Add `status` (covered, tank_low, dumping, unmet, offline) and `lastSeen` | Sentence built client-side (`statusSentence`) from backup kWh, tank level and the live `overview.update` status |
| H3 | `statusMessage` uses operator wording ("All heat covered by servers today") | Today | Send host wording, or drop it in favour of `status` | Not shown; the client sentence is used |
| H4 | `/site/sites/{id}/servers` has no `loadKw` and no `live` flag | My installation | Add both (never customer or task data) | Heat pulse shown on/off from `status`; no LIVE/SIMULATED badge on host server cards |
| H5 | `workKind` has no customer sector ("for a Swiss pharma company") | My installation | Add an anonymous sector phrase | Work category shown as sent |
| H6 | `/savings` has no `tariffVerified` flag and no price field | Savings and reports | Add `tariffVerified`, `verifiedAt`, `pricePerKwhChf` | Always "Not a verified tariff calculation"; price parsed from `explanation` |
| H7 | No monthly report endpoint | Savings and reports | `GET /site/sites/{id}/reports/{yyyy-mm}` (PDF or CSV) | CSV built in the browser from `/savings` |
| H8 | `/site/notifications` has no `title`, `severity`, `recommendedAction`, `resolvedAt` | Notifications | Add them | Title and next action mapped client-side from `kind`; repeated notices of a kind on one day grouped into one card |
| H9 | One notification per dumped slot (180 in a week for one site) | Notifications, badge | Raise `heat_dumped` once per episode, or not to hosts at all | Grouped per kind and day; badge caps at 99 |
| H10 | `site-owner:{id}` carries no per-hour energy push | Today hour chart, Energy | Push `energy.update` or refetch hint | Overview refetched each slot by the reconcile layer; charts refresh on navigation |
| H11 | No support contact field | Rail footer | Add a support address to `/meta` | Placeholder mailto |
| H12 | Mock mode: energy, savings and servers were captured for H1 only | Multi-site users in mock mode | Re-run `pnpm capture` with more site owners | Other sites show the error state for those cards |

## Compute Portal: backend gaps

Found while building `/compute` (role `customer`). No backend code was changed; each item says how the UI degrades.

| # | What | Screen | Suggested backend change | UI today |
|---|---|---|---|---|
| 1 | **Privacy:** every `job.update` is sent on the shared `customer` channel to every customer (`allowed()` lets any customer subscribe to `customer`; `build_messages` sends all jobs there). ACME receives Globex's job names, costs and deadlines. | All live job progress | Send `job.update` only to the owning customer (e.g. channel `customer:{id}`, or filter in the broadcaster) | `useLiveOwnJobs()` drops jobs whose `customerId` is not the signed-in buyer before anything is shown |
| 2 | **Privacy:** `/customer/jobs/{id}` and `/customer/jobs/{id}/tasks` return `siteId`, `serverId` and events with `fromServerId` / `toServerId` | Job detail | Strip host details for the customer role; add a pause reason (`tank_full` / `operator`) | Ids are never rendered; events are worded "moved to another site", "paused while a host's tank was full" |
| 3 | **Security:** the API key `id` is the secret itself, and `GET /customer/api-keys` returns every secret in full on each call | API keys | Store a hash; return `id`, `name`, `prefix`, `createdAt`, `lastUsedAt`; return the secret once on create | List shows only the first 7 characters; the full key is shown once after creation |
| 4 | API key `createdAt` uses the wall clock, not simulated time; no `name` or `lastUsedAt` | API keys | Add the fields; use simulated time or label it | Shown as returned |
| 5 | No price list for buyers (`/admin/settings/pricing` is operator-only) | Submit Job estimate, tier cards | `GET /customer/pricing` per tier | Rate = this buyer's billed average per tier from `/customer/usage` (cost ÷ server-hours); a tier without usage gets the midpoint, labelled; "Not a quote" |
| 6 | No pre-submit estimate of start, finish or cost | Submit Job | `POST /customer/jobs/estimate` (dry run) | Earliest finish = longest dependency chain from the simulated now; wait per tier described in words only |
| 7 | Largest server size is not exposed to buyers | Submit Job validation | Return max task power in `/meta` or a customer endpoint | Assumes 1.0 kW (every server in `data/servers.csv`) |
| 8 | No simulated clock for customers (`clock.tick` goes to `fleet` only) | Header time, "queued" | Send `clock.tick` on the customer channel | Time derived from message times; until the first push, queued jobs and the job list show a skeleton |
| 9 | `jobsQueued` (10,545 for ACME) counts jobs whose arrival is still in the future | Overview | Separate `jobsQueued` (arrived) from `jobsScheduled` (future) | Queued = arrived jobs counted client-side; the rest are explained in a popover |
| 10 | `jobsDone` has no period; `spendMonthChf` has no stated month boundary | Overview | Add `periodStart` / `periodEnd` | Labelled "since the run started" and "this month so far" |
| 11 | Job lists page oldest first with no sort parameter (23,000 jobs for ACME) | My Jobs, Recently finished | `sort=-submittedAt` | Last page fetched by offset cursor (`total - 30`) |
| 12 | `jobsAtRisk` returns ids only; no slack per job | Deadline risk | Add `slackMin` / `atRisk` to each job | Risk = listed in `jobsAtRisk` or estimated finish after deadline |
| 13 | `/customer/impact` returns totals only, no monthly series, no period parameter | Impact | `?from&to` and a monthly series | Totals plus monthly electricity from `/customer/usage`; no heat-over-time chart |
| 14 | The 80 % heat recovery and the pricing basis are only in `/admin/assumptions` | Impact methodology | Expose the buyer-relevant assumptions | Methodology described in words without the percentage |
| 15 | No invoice download endpoint; invoice `status` values other than `open` are undocumented | Usage and invoices | `GET /customer/invoices/{id}.pdf`; document statuses | CSV built in the browser from `/customer/usage`; "Open" or "Paid" chip |
| 16 | No CO2 figure (correctly) | Impact | Only with a verified method, value, status and source | Not shown; the page says so |
| 17 | No support contact in the API | Shell footer | Add a support address to `/meta` | `mailto:` placeholder address |

## Gaps found while building the Operations specialist screens

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
