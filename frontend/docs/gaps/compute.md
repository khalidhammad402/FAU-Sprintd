# Compute Portal: backend gaps

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
