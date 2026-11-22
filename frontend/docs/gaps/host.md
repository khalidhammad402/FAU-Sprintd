# Host Portal gaps

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
