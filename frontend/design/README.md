# DigitalHeat design prototype

High-fidelity, interactive prototype of the three DigitalHeat web experiences on one design system. It is the design reference for the frontend build. It is not the production frontend: it runs on sample data and a small simulator instead of the backend in this repository.

One sentence every screen must make obvious: **MNC sends AI workloads, DigitalHeat schedules compute, servers create heat, host business uses heat.**

## Open it

No install, no build, no network. Double-click `design/index.html`, or serve the folder to get the real paths:

```
cd design
python -m http.server 5173
```

| Path | Experience | Theme |
|---|---|---|
| `/system/` | Design system sheet: tokens, type, every component in every state, motion rules | dark and light |
| `/ops/` | Operations Console, fleet map as the hero | dark, desktop first, read-only on tablet |
| `/compute/` | Compute Portal for compute buyers | light, desktop first, usable on tablet |
| `/host/` | Host Portal for host businesses | light, phone first, desktop layout included |

Use Chrome or Edge. The prototype uses `color-mix()`, `backdrop-filter` and `Intl` time zones.

## Deliverables

| File | What it is |
|---|---|
| `system/index.html` | One-page design system sheet (live, contrast ratios computed in the page) |
| `ops/`, `compute/`, `host/` | The three prototypes |
| `design-tokens.json` | Colour, type, space, radius, shadow, motion, breakpoints, with meanings and contrast results |
| `components.md` | Every component: props, states, data consumed |
| `motion-spec.md` | Every animation: trigger, duration, easing, reduced-motion behaviour, intro sequence |
| `assets/js/sampleData.js` | The one sample-data module, shaped like the backend responses |

## How the prototype is put together

```
assets/css/dh.css          tokens + component kit (shared)
assets/css/ops.css         Operations Console and map
assets/css/compute.css     Compute Portal layout
assets/css/host.css        Host Portal layout
assets/js/sampleData.js    ALL sample data, one block per backend endpoint
assets/js/sim.js           store, WebSocket-shaped message bus, fake scheduler, selectors, formatters
assets/js/kit.js           component kit
assets/js/charts.js        DonutGauge, HeatFlowChart, StackedBars, SparkTrend, TaskGraph
assets/js/map.js           FleetMap, SiteMarker3D, MigrationArc
assets/js/ops.js           Operations shell and screens
assets/js/ops-drawers.js   Site, Server and Task drawers
assets/js/compute.js       Compute Portal
assets/js/host.js          Host Portal
assets/js/system.js        Design system sheet
assets/vendor/             htm + Preact standalone (MIT), 13 kB, so there is no build step
assets/fonts/              Inter and JetBrains Mono, variable woff2 (SIL OFL), so type works offline
```

Components are Preact + htm and port 1:1 to React + TypeScript: same names, same props.

### Swapping sample data for the real API

`sim.js` stands in for the backend. It emits the same messages the real WebSocket pushes (`{type, channel, time, data}`: `clock.tick`, `slot.tick`, `kpi.update`, `agents.update`, `alert.raised`, `task.started / paused / resumed / migrated / completed / missed / cancelled`) and exposes the same controls as the REST endpoints (`DH.api.putScheduler`, `jump`, `reset`, `taskAction`, `ackAlert`, `submitJob`, `cancelJob`).

To go live: load initial state with REST into the same store shape, then feed every WebSocket message into `DH.receive(msg)`. The reducer and all screens stay as they are. Each block in `sampleData.js` names the endpoint it stands for, and every field the backend does not have yet is marked `// GAP`.

## Demo script (links work from `file://` too)

| What to show | Link |
|---|---|
| Intro sequence, then the live fleet | `ops/index.html?intro=1` |
| Site drawer on the pool | `ops/index.html#/?site=POOL1` |
| The site that needs backup heat, Jobs tab | `ops/index.html#/?site=BLOCK1&tab=jobs` |
| A LIVE server (real laptop process) | `ops/index.html#/servers?server=POOL1-S2` |
| A paused task with its chain and dependencies | `ops/index.html#/tasks?task=J202-T4` |
| Status view and Arcs view | `ops/index.html#/?view=status` · `#/?view=arcs` |
| Scheduler Lab, Platform Economics | `ops/index.html#/lab` · `#/economics` |
| Compute buyer submits a job | `compute/index.html#/submit?template=embed` |
| Host business, phone | `host/index.html#/` at 390 px wide |

About 5 seconds after load the scheduler migrates a paused task from Pharma Park Kleinhüningen (tank full, dumping) to Wäscherei Rhein (tank low): the first migration arc. The dumping resolves within a few slots and returns later in the simulated day.

Prototype controls (the dashed pill at the bottom of every page, not part of the product):

- **State**: Live, Loading, Empty, Error, Reconnecting. Also reachable by URL: add `state=loading` to the hash query, for example `ops/index.html#/tasks?state=empty`.
- **Reduced motion**: simulates `prefers-reduced-motion`.
- Extra URL switches: `tick=3` fast-forwards three slots before the first paint, `host/#/?demo=offline` shows the unreachable-site case, `host/#/savings?verified=1` shows the verified-tariff variant.

## Design decisions worth knowing

1. **Colour semantics follow the prompt, not the reference image or the backend `/meta.colours`.** Orange = server heat and running compute, blue = tank, mint = healthy, amber = dumped heat or caution, red = backup heat, unmet demand, failure, missed deadline. The backend says "backup heater = grey": the design uses red.
2. **LIVE and SIMULATED differ by form, not colour** (solid dot and border against dashed), so the badge never competes with the six data colours.
3. **Priority tiers and revenue streams use a neutral ramp**, never a data colour, because they have no physical meaning.
4. **Drawer and filter state live in the URL**, so every state is linkable and the back button works.
5. **Trends render only with a comparable prior period.** The sample data has one so the design is visible. The backend has none yet, so in the build the arrows stay hidden until it does.
6. **Platform Economics follows the prompt's four-sided model**: compute and heat show live figures, grid flexibility and certificates are dashed "Roadmap, scenario" cards with no income figures. The business-model analysis dated 21 Nov 2026 removes the grid side (three-sided, 65 / 25 / 10). If that becomes the plan, delete the grid card and change `platform.planMixPct` in `sampleData.js`: nothing else depends on it.
7. **The map is offline by construction.** It is a stylised canvas of Basel (rivers, bridges, rail, low-contrast extrusions), not survey data. In the build it is the fallback layer behind MapLibre GL + deck.gl.
8. **Wording rules are enforced in the copy**: "Host business", "Host Portal", "site". No "home", "household", "Client Portal", "free heat", bill-saving percentages, or unbadged CO2 figures. The Host Portal says "Recovered heat value this month" with the pricing assumption one tap away.

## Honest limits of the prototype

- **All data is illustrative.** Site names, customers, jobs and every figure are invented. The UI marks this with "Illustrative data" tags.
- **The fake scheduler is a toy.** It places work where heat is needed, pauses or moves flexible work when a tank is full, and keeps new jobs arriving. It is not the Greedy or MPC code in `core/`. The Greedy / MPC comparison numbers in the Scheduler Lab are sample values, not the results in `results/`.
- **Sample economics are not derived from rack sizes.** The break-even of 0.42 CHF per server-hour comes from the design brief. With the backend's current 1 kW servers and 0.33 CHF/kWh the real value is 0.22 to 0.31. Live values will come from `/admin/kpis`.
- **"Today" does not roll over at midnight** in the simulator, and "Run year" in the Scheduler Lab is a progress animation that adds a sample row.
- **Shared-element transition** (marker to drawer header) is specified in `motion-spec.md` but shown only as its end state.
- **Not tested**: screen readers, Safari, Firefox, real touch devices, and the Operations Console below 1024 px (its tablet and phone rules are written but were not looked at).
- **Checked in headless Chrome**: every Operations route at 1440 and the fleet map at 1024. Every portal route at 1440, the portal start screens at 1024, 768 and 390. Loading, empty, error and reconnecting on at least one route per experience. A sweep of 35 route and state combinations logged zero console errors.
- **Downloads** (invoices, monthly reports) are generated in the browser from sample data.
- **Security wording** in the Compute Portal (sealed rack, confidential computing, ephemeral execution) is design copy and needs confirming by whoever owns security claims.

## Backend fields and endpoints the design needs

Compared with `docs/BACKEND_HANDOFF.md`. Each item is marked `// GAP` where it appears in `sampleData.js` or `sim.js`.

### Affects the stage demo

| # | Need | Today | Used by |
|---|---|---|---|
| 1 | Commercial host sites in the demo data | `data/sites.csv` has `Household H1`, `Household H2`. The product excludes homes | Every screen |
| 2 | Site `type` values `hotel, pool, plant, laundry, block, farm` plus a display label (`hostType`) | `household, farm, hotel, spa, business` | Map glyphs, drawers, Host Portal |
| 3 | Site status `offline` with `lastSeen` (all servers of the site unreachable) | `covered, tank_low, unmet, dumping` only | Map, drawers, Host Portal Today |
| 4 | `unmet_demand` alerts raised as `critical` | Raised as `warning` | Alert tray, toasts, critical motion |
| 5 | UI names: "Host Portal", role label "Host business", route `/host` | `/meta.roles.siteOwner = "Client Portal"`, handoff routes `/home/*` | All copy |

### Operations Console

| # | Need | Today |
|---|---|---|
| 6 | KPIs for a period ("today", "this month") and the same window one period earlier, for trend arrows | `/admin/kpis` has scope fleet or site. WS `kpi.update` is per slot, so the client accumulates. No prior-period values |
| 7 | Fleet-wide task lifecycle history for the Events screen | Only per task (`/admin/tasks/{id}.events`) and live over the WebSocket |
| 8 | Paused tasks per server, for the hatched segment in `RackBar` | `server.tasks` lists running tasks only |
| 9 | Customers: `sector`, `jobsRunning`, `jobsAtRisk`, `jobsMissed`, `heatSharePct`, and the period of `revenueChf` | `id, name, jobs, tasksRunning, revenueChf` |
| 10 | Task-level `estimatedFinish` and `slackMin` | Derived client-side from runtime, progress and dependencies |
| 11 | A source for the plan revenue mix and roadmap texts | Not backend data. Kept as static content |

### Compute Portal

| # | Need | Today |
|---|---|---|
| 12 | Price list per tier readable by customers | Only `/admin/settings/pricing` |
| 13 | Cost and finish estimate before submitting | `estimatedFinish` exists only after `POST /customer/jobs`. Typical wait per tier is a design assumption |
| 14 | Largest task power a customer may request | Not exposed. The form assumes 10 kW |
| 15 | `slackMin` and `atRisk` per job | `/customer/overview.jobsAtRisk[]` returns ids only |
| 16 | Confirm that `costChf` accrues while a job runs | The example response shows `0.0` at submission |
| 17 | Impact as a monthly series with a `period` parameter | `/customer/impact` returns totals only |
| 18 | CO2 figure with `value, status, source` | Not in the backend. Shown only with an ASSUMPTION badge |
| 19 | Task events without `siteId`, `serverId`, `fromServerId`, `toServerId` for the customer role, plus the pause reason | `/customer/jobs/{id}/tasks` returns them. The portal hides them, the API should not send them |
| 20 | API keys: `name, prefix, createdAt, lastUsedAt`, secret returned once on create | Response shape not documented |
| 21 | Invoice download, and the documented `status` values | No download endpoint. Only `open` is shown |
| 22 | Period of `jobsDone`, `spendMonthChf`, `sitesHeated` in simulated time | Not stated |

### Host Portal

| # | Need | Today |
|---|---|---|
| 23 | Overview: `serverHeatTodayKwh`, `status`, last-contact time | Only the share % exists. kWh is derived from `/energy?period=day` |
| 24 | Status sentence in host wording | Backend sends "All heat covered by servers today". Map client-side from `status`, or send the final sentence |
| 25 | Servers: `loadKw`, `live`, and the customer sector in `workKind` ("for a Swiss pharma company") | `name, capacityKw, status, workKind` |
| 26 | Savings: `tariffVerified` with date and source, and the price per kWh as a field | Price is only inside the `explanation` string |
| 27 | Monthly report endpoint | None. The CSV is built client-side |
| 28 | Notifications: `title`, `severity`, `recommendedAction`, `resolvedAt`, kinds `maintenance` and `report` | `id, time, kind, message, siteId, read` |
| 29 | Live update of the day chart on `site-owner:{id}` | Only `overview.update` and `notification.new` |

## Third-party files

- `assets/vendor/htm-preact-standalone.umd.js`: htm 3.1.1 with Preact, MIT licence.
- `assets/fonts/`: Inter and JetBrains Mono variable fonts from Fontsource, SIL Open Font Licence. Licence texts are in the folder.
