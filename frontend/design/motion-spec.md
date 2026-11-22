# DigitalHeat motion specification

All motion is event-driven. Nothing moves unless a data event or a user action caused it. Two effects loop, and both loop only while a data state lasts: the dumping shimmer (site is dumping) and the critical breathing (backup heat is needed). The heat pulse loops only while a task is running.

Tokens: durations and easings are in `design-tokens.json` under `motion`.
`out` = `cubic-bezier(0.16, 1, 0.3, 1)`, `inOut` = `cubic-bezier(0.65, 0, 0.35, 1)`, `standard` = `cubic-bezier(0.2, 0, 0, 1)`.

One simulated slot lasts `slotSeconds` of real time (10, 5 or 2 s). Every animation below finishes inside the shortest slot (2 s) except the two state loops.

## 1. Animations

| # | Animation | Trigger (backend event) | Duration, easing | What moves | Where implemented | Reduced motion |
|---|---|---|---|---|---|---|
| 1 | Heat pulse | A task is running on a rack (`server.tasks.length > 0`, refreshed by `slot.tick` / `server.status`) | 1.6 s loop, `inOut`. Speed scales with load: 2.4 s at 0 % down to 1.0 s at 100 % | An orange particle travels from the rack glyph to the blue tank glyph and turns blue on arrival. On the map: one orange band rises through the column per `slot.tick` | `HeatPulse` (kit.js), `FleetMap` pulses (map.js) | Particle hidden. Source icon stays orange, label reads "x kW into tank" |
| 2 | Tank fill | `site.tankKwh` changes (`slot.tick`) | 600 ms `out` for level and ring. Surface wave runs twice (2.8 s) then rests. Number counts 400 ms | Liquid level, ring arc, percentage and kWh | `DonutGauge variant="tank"` | Level and number jump |
| 3 | Column growth | New heat-demand reading (`slot.tick.demandKwh`) | 500 ms `out`. Ground glow intensity follows demand | Column height and glow | `FleetMap` | Column jumps |
| 4 | Ring sweep | `serversRunning / serversTotal` changes | 400 ms `out`, then one soft ping (900 ms) | Arc of the marker badge | `SiteMarker3D` | Ring jumps, no ping |
| 5 | Migration arc | `task.migrated` with `fromSite != toSite` | Arc draws in 900 ms `out`. A bead travels at the head. Source column dims to 45 % for 1.1 s. Target base pulses once (900 ms) on arrival. The arc then fades over the next slots | Arc, bead, source column, target ripple | `FleetMap` (MigrationArc) | Arc appears complete, no bead. The event is in the Events stream as text |
| 6 | Status change | `site.status` changes | 300 ms colour crossfade, one ripple at the marker base (900 ms) | Column colour, chip colour, ripple | `FleetMap`, `StatusChip` | Instant colour and chip change |
| 7 | Dumping | `site.status == "dumping"` | Slow shimmer across the column top, 3.2 s cycle, plus a faint amber ring rising 8 px. Never a flash | Column cap | `FleetMap` | Static amber cap |
| 8 | Critical | `site.status == "unmet"` or an unacknowledged critical alert | Red glow breathing at 2.4 s `inOut`. New alert card slides in from the right, 360 ms `out` | Marker badge glow, ground glow, alert card edge | `SiteMarker3D`, `AlertCard`, `AlertToasts` | Static red outline. Alert appears without slide |
| 9 | Clock tick | `clock.tick` | Changed digits roll up 320 ms `out`. Play button shows one heartbeat ring (900 ms) | Clock digits, ring on the play button | `ClockControl`, `RollText` | Digits swap, no ring |
| 10 | Task progress | Task `progressPct` update | Bar eases 900 ms `out` and never moves backward. Running bars carry a travelling light (1.6 s). On complete: mint check draws in 420 ms | Progress bar, check mark | `ProgressBar`, `CheckDraw` | Bar jumps, no travelling light, check appears |
| 11 | Drawer | Open and close | Open: 280 ms slide (28 px) and fade, `out`. Content blocks stagger 40 ms apart. Close: 200 ms | Drawer, its sections | `Drawer` | Instant |
| 12 | Number change | Any KPI value changes | Count tween 400 ms `out`. Changed digits get a highlight that fades in 900 ms | Digits | `Num` | Value swaps, no highlight |
| 13 | Skeleton to content | Data loaded | Shimmer loop while loading (1.5 s linear). Content fades in over 200 ms | Skeleton blocks, content | `Skeleton`, `ViewState` | No shimmer, instant swap |
| 14 | Reconnecting | WebSocket lost | Banner slides down 280 ms `out`. Data dims to 55 % and desaturates in 300 ms. Retry countdown ticks each second | Banner, all live data | `ConnectionBanner`, `.is-stale` | Banner appears, data dims instantly |
| 15 | Page and tab | Navigation | 200 ms fade with 8 px upward shift | Page content | `.dh-page` | Instant |
| 16 | Camera | Site selected or deselected, 3D toggle, reset north, locate fleet | 700 ms `out` to the site with pitch 55° to 60°. 600 ms for 3D toggle. 500 ms for reset north | Map camera | `FleetMap.flyTo` | Camera jumps |
| 17 | New event | A lifecycle event arrives in a list | Row drops in from 10 px above, 360 ms `out` | Timeline row | `Timeline`, Events screen | Row appears |
| 18 | Heartbeat | `agents.update` for a LIVE server | One ping on the LIVE dot, 900 ms | Dot of the `OriginBadge` | `OriginBadge` | No ping. "heartbeat 2 s ago" text updates |

Shared-element transition (selected site marker to drawer header): the drawer header shows the same host glyph in the same status tone and scales in over 280 ms. In the build, give the marker badge and the header glyph the same `view-transition-name` (`site-<id>`) and open the drawer inside `document.startViewTransition`. The prototype shows the end state and the timing, not the morph.

## 2. Intro sequence (Operations Console)

Plays once per browser session on first load of `/ops`. Replay from Settings, or open `ops/index.html?intro=1`. A "Skip intro" button is visible for the whole sequence. Disabled under reduced motion.

| Time | Step | Spec |
|---|---|---|
| 0 ms | Map fades in | Canvas opacity 0 to 1 over 700 ms |
| 200 ms | Top bar slides in | 700 ms `out`, 16 px from above |
| 450 ms | Columns rise | Each column grows from 0 to its height in 620 ms `out`, staggered 60 ms from the back of the scene to the front. Badges fade in with their column |
| 500 ms | Left rail slides in | 700 ms `out`, 16 px from the left |
| 1200 ms | KPI rail and view toggles slide in | 700 ms `out`, 16 px from above |
| about 1570 ms | First heat pulse fires | One orange band rises through every column that has running servers |
| about 2000 ms | Live | The scheduler clock takes over |

## 3. Reduced motion

`prefers-reduced-motion: reduce` is honoured in CSS (all durations collapse) and in JS (`DH.reducedMotion`: tweens, canvas loops, the intro and arcs are skipped). The prototype bar has a "Reduced motion" switch to demo this without changing the system setting.

Text equivalents that stay when motion is off:

- Heat flowing: the heat pulse has `aria-label="Server heat is flowing into the tank"` and a visible "x kW into tank" label.
- Status: every status is a chip with icon and word. Status changes are also announced by the alert toast (`role="status"`, `aria-live`).
- Migration: listed in the Events stream as "Migrated, J202-T4, PHARMA1-S3 → LAUNDRY1-S2".
- Clock: the simulated time is plain text with an `aria-label`.
- Progress: every bar is a `role="progressbar"` with `aria-valuenow`.

## 4. Rules for new motion

1. Name the data event that triggers it. If there is none, do not animate.
2. One-shot by default. A loop needs a data state that is true for as long as it runs.
3. Never flash. Nothing changes brightness faster than 3 times per second.
4. Stay inside 2 s so the animation finishes before the next slot at the fastest clock speed.
5. Provide the reduced-motion end state and the text equivalent in the same change.
