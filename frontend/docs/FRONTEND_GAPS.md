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

Portal and screen-specific gaps are added below as the screens are built.
