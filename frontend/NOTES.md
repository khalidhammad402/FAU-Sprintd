# Frontend notes

What I learned before building, and the assumptions I made. Read with `docs/FRONTEND_GAPS.md`.

## Product and vocabulary
- Commercial heat-and-compute network in Basel. Chain shown everywhere: MNC sends AI workloads, DigitalHeat schedules compute, servers create heat, host business uses heat.
- Three experiences, one codebase: `/ops` (backend role `admin`), `/compute` (`customer`), `/host` (`site_owner`; UI name "Host business"). Visible words come from `src/lib/terms.ts`; `scripts/check-terms.mjs` fails the lint step on forbidden words.
- Design source: `design/` (Fable prototype, tokens, components.md, motion-spec.md) and `design/reference.png` (Ops home layout). `DigitalHeat_Frontend_Blueprint.md` was not provided; the build prompt and the design output were used instead.

## Backend facts that shaped the code
- Base `/api/v1`, camelCase JSON, ISO times with the Zurich offset, slots of 15 min, simulated year 2021.
- `docs/openapi.json` types request bodies only; every response is `{}`. So `src/api/schema.ts` (generated) covers bodies, and `src/api/types.ts` holds zod schemas written from real captured responses. Parsing never crashes: a schema miss is logged and the raw data used.
- The backend writes Python `inf`/`nan` as bare `Infinity`/`NaN` (invalid JSON) in KPIs. `src/lib/json.ts` turns them into `null` for REST and WebSocket.
- `GET /admin/sites/{id}` returns 500 when today's KPIs contain `inf`. The site drawer header uses the site list instead.
- `/admin/kpis` accepts `from`/`to`: the KPI strip compares "today so far" with the same hours yesterday. Those are the only trend arrows.
- WebSocket: `site:{id}` carries `slot.tick` and the task lifecycle (`task.started`...); `fleet` carries `clock.tick`, `slot.tick`, `kpi.update`, `alert.raised`, `agents.update` and only `task.migrated` (with `fromSite`/`toSite`). The operator therefore subscribes to `fleet` plus every `site:{id}`. Task events use `fromServer`/`toServer` (REST task detail uses `fromServerId`/`toServerId`).
- Only admins receive `clock.tick`. For compute buyers and hosts, simulated "now" is derived from message times (`time` + 15 min) and the host overview `time`.
- `requirements.txt` lacks a WebSocket library: uvicorn needs `websockets` (or `uvicorn[standard]`) for `/ws`.

## Data
- `data/sites.csv` was changed in a separate commit (`data: commercial host story`, approved): commercial names and types at plausible Basel-Stadt coordinates, same ids. The demand workbook holds no coordinates.
- Demand values are still one household meter replicated (assumptions register says MOCK). The UI marks the data illustrative.

## Architecture decisions
- Live state: REST through TanStack Query, socket pushes through `src/live/reconcile.ts` into a Zustand store (`src/live/store.ts`). Reducers are idempotent (dedupe keys per slot/task/alert). Lists the socket only partly covers are refetched once per slot (active queries only). A finished jump or reset bumps an epoch and refetches everything.
- Mock mode (`VITE_DEMO_MODE=mock`, `pnpm dev:mock`): MSW serves real captured responses (`src/mocks/fixtures/rest.json`, `pnpm capture`) and `MockTransport` replays one recorded simulated day of real WebSocket messages, looping with shifted times. Channels that were not recorded are derived the same way the backend builds them.
- Map: MapLibre GL with real OpenStreetMap vector tiles (OpenFreeMap, no key) styled to the tokens, 3D building extrusions, deck.gl layers interleaved (columns, arcs, pulses). Offline fallback: bundled Basel tiles (`public/basemap`), then a blank navy grid.
- Ops theme: dark and light (reference image has both). Portals are light.
- Drawer and filter state lives in the URL.
- Fonts bundled (Fontsource Inter + JetBrains Mono): no network fonts on the hotspot.

## Learned in live testing
- Late in the simulated year several endpoints take 3 to 14 s and hold the engine lock, which stalls the clock (FRONTEND_GAPS.md #10). The per-slot refetch is therefore throttled per endpoint and never cancels a running request; heavy job lists load only where they are shown.
- `/admin/kpis` with `from`/`to` still returns the whole run's compute income and job outcomes, so those figures say "since run start".
- Skills applied from skills.sh as guidance (not installed): Anthropic `frontend-design` (one bold moment: the map; no gradients, glows, generic eyebrows), Vercel `web-design-guidelines` (labels, focus, reduced motion, URL state), Vercel `react-best-practices` (lazy chunks per experience, no derived state in effects), `emil-design-eng` (ease-out curves, drawer timing, no animation on keyboard actions).

## Assumptions
- Alert severity: `unmet_demand` and `server_offline` are shown as critical (backend sends warning); `heat_dumped` info alerts are listed but do not raise the bell badge.
- Mock replay slot length defaults to 5 s; live mode uses the backend's `slotSeconds`.
- Demo logins: Operations = `admin`, Compute buyer = `acme`, Host business = `h1owner` (Hallenbad Gundeli).
