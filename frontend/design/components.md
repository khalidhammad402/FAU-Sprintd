# DigitalHeat component kit

Every component of the design system, with its props, states and the data it consumes. Names are final: the build prompt can reference them as written. All of them are rendered live, in dark and light, on `system/index.html`.

Source in the prototype: `assets/js/kit.js` (kit), `assets/js/charts.js` (charts), `assets/js/map.js` (map), `assets/css/dh.css` (styles, class prefix `dh-`). The prototype is Preact + htm with no build step. Each component ports 1:1 to a React + TypeScript component with the same name and props.

Conventions

- `tone` is one of `heat | tank | ok | idle | dump | critical`. It selects the semantic colour. Never pass a raw colour for a status.
- Status is always icon + word + colour. No component shows a status by colour alone.
- Numbers always come with a unit and a period. Components that show numbers take `unit` and `period` props.
- Data paths refer to the backend contract in `docs/BACKEND_HANDOFF.md`. `GAP` marks a field that does not exist yet (list at the end of `README.md`).

## 1. Status and identity

| Component | Props | States | Data |
|---|---|---|---|
| `StatusChip` | `kind: "site" \| "task" \| "job" \| "server" \| "severity"`, `value`, `size?: "sm"`, `plain?`, `label?` | site: covered (mint), tank_low (blue), dumping (amber), unmet = "Backup heat needed" (red), offline (grey). task: waiting / ready = Queued, running, paused, done = Complete, missed, cancelled. server: working, idle, offline. Colour crossfades in 300 ms | `site.status`, `task.state`, `job.status`, `server.status`, `alert.severity`. `offline` for a site is a GAP |
| `OriginBadge` | `live: boolean`, `beat?` (last heartbeat value, triggers one ping) | LIVE: solid dot, solid border. SIMULATED: hollow dashed dot, dashed border. Told apart by form, not colour | `server.live`, `server.lastHeartbeat` |
| `Illustrative` | `text?` | Dashed tag "Illustrative data" | Shown wherever sample data is used |
| `AssumptionPill` | `a: { name, value, status, source }`, `inline?`, `align?` | Closed pill, open popover (value, status with meaning, source). Status tones: BRIEF blue, SOURCE mint, ASSUMPTION amber, MOCK red, LIMIT grey | `GET /admin/assumptions` |
| `PayOffStatement` | `text`, `algorithm?`, `generatedAt?`, `source?` | One state. The sentence is shown verbatim. Numbers are bold, the word NOT is marked | `GET /admin/results` → `fleet.payOffStatement` |

## 2. Numbers

| Component | Props | States | Data |
|---|---|---|---|
| `Num` | `value`, `d?` (decimals) | Idle. Changing: counts 400 ms, changed digits highlight | Any number |
| `KpiTile` | `label`, `value` or `text`, `unit?`, `d?`, `period`, `tone?`, `icon?`, `prior?`, `lowerIsBetter?`, `size?: "sm" \| "lg"`, `card?`, `hint?` | Default. With trend (only when `prior` is given). Loading (skeleton). Tone colours the icon only | `GET /admin/kpis`, WS `kpi.update`. `prior` is a GAP |
| `KpiRail` | `items: KpiTile props[]` | Default. Stale (dimmed while reconnecting). Loading. Scrolls sideways on narrow screens | Same as `KpiTile` |
| `Trend` | `value`, `prior`, `d?`, `unit?`, `lowerIsBetter?` | Up, down, flat. Mint when better, amber when worse. Renders nothing without `prior` | Prior-period value (GAP) |
| `SparkTrend` | `values[]`, `prior`, `value?`, `d?`, `unit?`, `tone?` | With prior: sparkline and trend. Without prior: renders nothing | A series plus a comparable prior period (GAP) |
| `DonutGauge` | `value`, `max`, `tone`, `size`, `stroke`, `variant: "ring" \| "tank"`, `center` (content), `label` (aria) | ring: arc eases 600 ms. tank: liquid level eases 600 ms, short wave on change. Tone follows status (tank blue, dump amber, critical red) | `site.tankKwh / site.tankCapacityKwh`, `kpis.coveragePct` |
| `ProgressBar` | `value` (0 to 100), `tone?`, `running?`, `lg?`, `label?` | Idle, running (travelling light), paused (tone dump), complete (tone ok), missed (tone critical). Never moves backward | `task.progressPct`, `job.progressPct` |
| `CheckDraw` | `size?` | Draws once in 420 ms | Shown when a task or job completes |
| `HeatPulse` | `on: boolean`, `load` (0 to 1), `label?` | On: particle travels rack → tank, faster with load. Off: static, muted | `server.loadKw / capacityKw`, `site.loadKw` |
| `RackBar` | `server`, `onClick?`, `showOrigin?`, `lg?`, `label?` | Working (one orange segment per running task), paused segment (amber hatch), idle (empty track), offline (hatched track, "offline") | `server.tasks[].powerKw`, `server.capacityKw`, `server.status`. Paused tasks per server are a GAP |

## 3. Charts

All charts: compact legend, axis unit, hover tooltip with exact values, `role="img"` with a text summary, and an empty state.

| Component | Props | States | Data |
|---|---|---|---|
| `HeatFlowChart` | `rows` (slot readings), `height?`, `until?` (ISO, draws a "no data" band up to now), `unit?`, `legend?`, `empty?` | Data. Hover (cursor and tooltip). Gap (site offline). Empty: "No heat demand data for this period" | `GET /admin/sites/{id}/timeline`, WS `slot.tick`. Stack: server heat used directly (orange), from tank (blue), backup (red) add up to the demand line. Dumped (amber) sits above the line |
| `StackedBars` | `buckets: [{ label, tip?, segments: [{ key, label, value, tone? \| color? }], marker?: { label, value } }]`, `height?`, `unit`, `d?`, `yMaxFixed?`, `legendItems?`, `ariaLabel` | Data. Hover (other bars dim). Empty | Host energy: `GET /site/sites/{id}/energy`. Usage: `GET /customer/usage` (neutral ramp). History: `/timeline?resolution=1d` |
| `TaskGraph` | `tasks[]`, `selected?`, `onSelect?` | Node tones follow task state. Running nodes show progress along the bottom edge. Selected node has a thick border. Edges turn mint when the dependency is done | `task.dependsOn[]`, `task.state`, `task.progressPct` |
| `Legend` | `items: [{ label, tone? \| color?, line?, dash? }]` | One state | Static |

## 4. Tasks and time

| Component | Props | States | Data |
|---|---|---|---|
| `TaskChain` | `task` (with `events[]`), `compact?` | Four steps: Queued → Running → Paused or migrated → Complete. Step 3 shows "Paused", "Paused by operator", "Migrated ×n" or "No pause or move" (dashed). Terminal: Complete (mint), Missed deadline (red), Cancelled (grey). `compact` hides the labels | `task.state`, `task.hold`, `task.events[]` |
| `Timeline` | `items: [{ time, kind, title?, detail?, isNew? }]`, `empty?` | Rows by event kind: started, paused, resumed, migrated, server_lost, completed, missed, cancelled. New rows drop in from the top | `task.events[]`, WS `task.*` |
| `ClockControl` | `variant: "bar" \| "full"` | Live (mint play ring beats on each tick), Paused, Jumping (amber label). Digits roll on change. Always labelled "Simulated time". `full` adds speed (10 s, 5 s, 2 s per slot), jump to date and reset | `GET/PUT /admin/scheduler`, `POST /admin/scheduler/jump`, `POST /admin/scheduler/reset`, WS `clock.tick` |

## 5. Tables, filters, navigation

| Component | Props | States | Data |
|---|---|---|---|
| `DataTable` | `columns: [{ key, label, num?, sortable?, render?, sortValue?, width? }]`, `rows`, `rowKey?`, `onRow?`, `selectedKey?`, `initialSort?`, `empty?`, `maxHeight?`, `caption`, `expanded?`, `renderExpanded?` | Sorted asc / desc (`aria-sort`), row hover, row selected (opens a drawer), row expanded, empty, sticky header. Rows are keyboard reachable (Enter opens) | Any list endpoint |
| `FilterChips` | `groups: [{ label, value, onChange, options: [{ value, label, icon?, count? }] }]` | Chip off, chip on (`aria-pressed`). One value per group, click again to clear | Client-side filters, or query params of `/admin/tasks` |
| `Tabs` | `tabs: [{ value, label, count? }]`, `value`, `onChange`, `label` | Selected, hover, focus. Arrow keys move between tabs | Drawer sections |
| `Segmented` | `options: [{ value, label, icon?, title? }]`, `value`, `onChange`, `label` | Pressed, hover, focus | Map view, time range, algorithm, clock speed |
| `PortalShell` | `here`, `product`, `nav: [{ path, label, short?, icon, badge?, alert? }]`, `current`, `user`, `title`, `actions?`, `tabs?`, `support?` | Desktop: navy rail 240 px. Tablet: icon rail 72 px. Phone: top bar plus bottom tab bar (`tabs`) or slide-in menu. Shows `ConnectionBanner` while reconnecting | Frame of the Compute and Host portals |

## 6. Overlays

| Component | Props | States | Data |
|---|---|---|---|
| `Drawer` | `label`, `onClose`, `head`, `children`, `width?` | Opening (280 ms, content staggers), open, closing. Traps focus, closes on Escape, returns focus to the opener. Full screen on phone | Site, server and task detail |
| `Pop` / `InfoPop` | `trigger`, `children`, `align?`, `width?`, `label` | Closed, open. Closes on outside click and Escape | Explanations of a number: value, source, status |
| `ConfirmDialog` | `title`, `body`, `confirmLabel`, `cancelLabel?`, `danger?`, `onConfirm`, `onCancel` | Default, danger. Focus starts on the safe action | Pause, resume, cancel task. Cancel job. Revoke key |
| `AlertTray` | `onView?` | Bell with open count (red when a critical alert is open, grey otherwise). Tray tabs: Open, Acknowledged. Empty state per tab | `GET /admin/events`, WS `alert.raised` |
| `AlertCard` | `alert`, `onAck?`, `onView?`, `now?` | Critical (red edge, breathing until acknowledged), warning (amber), info (grey), acknowledged (dimmed), new (slides in from the right) | `alert.severity`, `kind`, `message`, `time`, `acknowledged`. `PATCH /admin/events/{id}` |
| `AlertToasts` | `onView?` | Critical alerts slide in bottom right and leave after 9 s | WS `alert.raised` |

## 7. States of a screen

| Component | Props | States | Use |
|---|---|---|---|
| `ViewState` | `state: "live" \| "loading" \| "empty" \| "error" \| "reconnecting"`, `skeleton?`, `empty?`, `error?` | Picks skeleton, empty, error or content. Content crossfades in 200 ms. Reconnecting dims content | Wraps every screen. In the prototype the state comes from the URL: `?state=loading` |
| `Skeleton` / `SkeletonBlock` | `w?`, `h?`, `variant: "text" \| "title" \| "num" \| "card" \| "circle"` | Shimmer | Each screen has a skeleton in its own shape |
| `EmptyState` | `icon`, `title`, `body`, `action?`, `tone?`, `compact?` | One state. Always offers one helpful action | "No jobs yet. Submit your first job." |
| `ErrorState` | `title?`, `body?`, `code?`, `onRetry`, `compact?` | One state with Try again | Failed request |
| `ConnectionBanner` | `onRetry` | Slides down, counts down to the next retry | WebSocket lost |

## 8. Map

| Component | Props | States | Data |
|---|---|---|---|
| `FleetMap` | `view: "demand" \| "status" \| "servers" \| "arcs"`, `selected?`, `onSelect`, `intro?`, `onIntroDone?`, `inset` (free area in px), `height?` | Views: Heat Demand (height by demand), Status (equal heights, stronger glow, status word in the label), Servers (grey columns, ring shows running / total), Arcs (columns dimmed, arcs bright). 3D or flat. Site selected (camera eases 700 ms, others dim). Stale. Controls: 3D, zoom in, zoom out, reset north, locate fleet. Keyboard: arrows pan, plus and minus zoom | `GET /admin/map/sites`, `GET /admin/servers`, WS `slot.tick`, `task.migrated` |
| `SiteMarker3D` | `site`, `view`, `selected`, `dimmed` | Column: height = heat demand now, colour = status, heat pulse while servers work, amber shimmer while dumping, red breathing while backup heat is needed, dashed and grey when offline. Badge: ring = servers running / total (sweeps 400 ms, one ping on change), host-type glyph (bed, waves, factory, washer, building, wheat), label with name. Hover and focus show the tooltip card: name, status chip, origin badge, demand kWh (last 15 min), servers, tank % | One `site` from `/admin/sites`. Host glyph needs the extended `type` (GAP) |
| `MigrationArc` | drawn by `FleetMap` from events | Drawing (900 ms, bead at the head), settled (fades over the next slots), emphasised (Arcs view) | WS `task.migrated` with `fromSite`, `toSite` |

The prototype map is a stylised, offline canvas of Basel (Rhine, Wiese, Birs, bridges, rail, low-contrast building extrusions). In the build it is the fallback layer behind MapLibre GL + deck.gl: if tiles cannot load, show this canvas so the demo never shows a broken map. "View sites as list" swaps the map for a `DataTable` with the same data.

## 9. Screen-level components

Built from the kit. Source: `assets/js/ops.js`, `ops-drawers.js`, `compute.js`, `host.js`.

| Experience | Components | Notes |
|---|---|---|
| Operations Console | `KpiOverview`, `MapOverlays`, `SiteList`, `SiteDrawer` (tabs Overview, Servers, Jobs, History), `ServerDrawer`, `TaskDrawer`, `SitesPage`, `ServersPage`, `TasksPage`, `CustomersPage`, `LabPage`, `EventsPage`, `EconomicsPage`, `SettingsPage` | Drawer state lives in the URL: `?site=POOL1&tab=servers`, `?server=POOL1-S2`, `?task=J202-T4` |
| Compute Portal | `Overview`, `JobCard`, `SubmitJob`, `MyJobs`, `JobDetail`, `Usage`, `Impact`, `ApiKeys`, `TierChip`, `Risk`, `TrustLine` | A buyer never sees site names, server ids or tank levels |
| Host Portal | `Today`, `Energy`, `Installation`, `Savings`, `Alerts`, `Fact` | A host never sees customer names, job ids or task data |
