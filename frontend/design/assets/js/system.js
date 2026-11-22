/* DigitalHeat design system sheet: tokens, type, components (every state), motion rules. */
(function () {
  const DH = window.DH, P = window.htmPreact;
  const { html, useState } = P;
  const { Icon, Logo, Num, StatusChip, OriginBadge, Illustrative, KpiTile, KpiRail, RackBar, ProgressBar, CheckDraw, HeatPulse, TaskChain, Timeline, DataTable, FilterChips, Tabs, Segmented,
    ClockControl, AlertCard, AlertTray, EmptyState, ErrorState, Skeleton, ConnectionBanner, AssumptionPill, PayOffStatement, DonutGauge, HeatFlowChart, StackedBars, SparkTrend, TaskGraph, InfoPop, fmt, cx } = DH;

  /* ---- WCAG contrast, computed live from the token values ---- */
  const hex = (h) => { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(hex(a)), y = lum(hex(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (fg, bg, p) => "#" + hex(fg).map((c, i) => Math.round(c * p + hex(bg)[i] * (1 - p)).toString(16).padStart(2, "0")).join("");
  const DARK = "#0F1B2E", DARKBG = "#07111F", LIGHT = "#FFFFFF", LIGHTBG = "#F6F7F9";
  const TOKENS = [
    { t: "heat", hex: "#FF7A1A", dark: "#FF9447", light: "#A84300", means: "Server heat, active compute, running tasks" },
    { t: "tank", hex: "#3B82F6", dark: "#7FB2FF", light: "#1D4ED8", means: "Thermal tank, stored heat, heat demand" },
    { t: "ok", hex: "#34D399", dark: "#34D399", light: "#047857", means: "Healthy, demand covered, completed" },
    { t: "idle", hex: "#94A3B8", dark: "#A3B1C6", light: "#475569", means: "Idle, infrastructure, neutral" },
    { t: "dump", hex: "#FBBF24", dark: "#FBBF24", light: "#92400E", means: "Heat dumped, caution, deadline risk" },
    { t: "critical", hex: "#F05252", dark: "#FF8080", light: "#B91C1C", means: "Backup heat, unmet demand, failure, missed deadline" },
  ];
  function Ratio({ fg, bg, label, theme }) {
    const r = ratio(fg, bg), lvl = r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA large" : "fail";
    return html`<div class="ds-ratio" style=${`background:${bg};color:${fg};border:1px solid ${theme === "dark" ? "rgba(255,255,255,.1)" : "#E2E7EE"}`}><span>${label}</span><span>${r.toFixed(1)}:1 <span class="ds-pass">${lvl}</span></span></div>`;
  }

  function Spec({ name, note, data, children, light, dark, col, span }) {
    const stage = (theme, content) => html`<div class=${cx("ds-stage", col && "ds-stage--col")} data-theme=${theme}>${content}</div>`;
    return html`<section class="ds-spec" style=${span ? `grid-column:span ${span}` : null}>
      <div class="ds-spec__head"><h3>${name}</h3>${note && html`<p>${note}</p>`}${data && html`<div class="ds-spec__data">data: ${data}</div>`}</div>
      ${light === false ? stage("dark", children) : dark === false ? stage("light", children) : html`<div class="ds-two">${stage("dark", children)}${stage("light", children)}</div>`}
    </section>`;
  }

  function App() {
    const st = DH.useStore();
    const [tab, setTab] = useState("overview"), [seg, setSeg] = useState("status"), [fil, setFil] = useState("flexible"), [replay, setReplay] = useState(0), [tank, setTank] = useState(57.4);
    const pool = DH.sel.site(st, "POOL1"), pharma = DH.sel.serversOf(st, "PHARMA1"), farm = DH.sel.server(st, "FARM1-S1"), idle = DH.sel.server(st, "LAUNDRY1-S2");
    const tk = (id) => DH.sel.task(st, id);
    const k = st.kpis;
    const rail = [
      { label: "Heat coverage", value: k.coveragePct, d: 1, unit: "%", period: "today", tone: "ok", icon: "check-circle", prior: k.prior.coveragePct },
      { label: "Heat delivered", value: k.deliveredKwh, d: 0, unit: "kWh", period: "today", tone: "heat", icon: "flame" },
      { label: "Heat dumped", value: k.dumpedKwh, d: 1, unit: "kWh", period: "today", tone: "dump", icon: "wind", prior: k.prior.dumpedKwh, lowerIsBetter: true },
      { label: "Break-even", value: k.breakEvenChfPerServerHour, d: 2, unit: "CHF / server-h", period: "today", icon: "coins" },
    ];
    const jobTasks = DH.sel.tasksOfJob(st, "J201");
    const energy = st.host.energy.week.map((b) => ({ label: fmt.day(b.bucket).split(" ")[0], tip: fmt.day(b.bucket), segments: [{ key: "s", label: "Recovered server heat", value: b.serverHeatKwh, tone: "heat" }, { key: "b", label: "Backup heat", value: b.backupHeatKwh, tone: "critical" }], marker: { label: "Heat demand", value: b.demandKwh } }));
    const Marker = DH.MarkerSpecimen;

    return html`<div class="ds">
      <header class="ds-head">
        <div><${Logo} size=${36} tagline />
          <h1>Design system</h1>
          <p>One system for three experiences: the Operations Console (dark), the Compute Portal and the Host Portal (light). The one sentence every screen must make obvious: <b style="color:var(--text)">MNC sends AI workloads, DigitalHeat schedules compute, servers create heat, host business uses heat.</b></p></div>
        <div class="col" style="align-items:flex-end;gap:10px"><${Illustrative} text="All sample data is illustrative" />
          <div class="row wrap"><a class="dh-btn" href="../ops/index.html">Operations Console<${Icon} name="arrow-right" size=${14} /></a><a class="dh-btn" href="../compute/index.html">Compute Portal<${Icon} name="arrow-right" size=${14} /></a><a class="dh-btn" href="../host/index.html">Host Portal<${Icon} name="arrow-right" size=${14} /></a></div></div>
      </header>

      <section class="ds-sec"><h2><span>01</span>Colour: six meanings, never reused</h2>
        <p>Saturated colour appears only where data is live. Red is never decoration. Amber only ever means dumped heat or caution. Each token has a fill value and a text variant per theme. The ratios below are computed in this page from the token values (WCAG 2.1).</p>
        <div class="ds-grid ds-g6">${TOKENS.map((c) => html`<div class="ds-swatch" key=${c.t}>
          <div class="ds-swatch__chip" style=${`background:${c.hex}`}>${c.hex}</div>
          <div class="ds-swatch__body"><h3>--${c.t}</h3><p>${c.means}</p>
            <${Ratio} theme="dark" fg=${c.dark} bg=${DARK} label=${`ink ${c.dark} on panel`} />
            <${Ratio} theme="dark" fg=${c.dark} bg=${mix(c.hex, DARK, 0.14)} label="ink on 14 % chip" />
            <${Ratio} theme="light" fg=${c.light} bg=${LIGHTBG} label=${`ink ${c.light} on bg`} />
            <${Ratio} theme="light" fg=${c.light} bg=${mix(c.hex, LIGHT, 0.14)} label="ink on 14 % chip" />
          </div></div>`)}</div>
        <div class="ds-grid ds-g3" style="margin-top:16px">
          <div class="ds-swatch"><div class="ds-swatch__body"><h3>Dark surfaces (Operations)</h3><p>--ops-bg #07111F, glass panel rgba(15,27,46,0.62) with 18 px blur and a 1 px rgba(255,255,255,0.08) border.</p>
            <${Ratio} theme="dark" fg="#E8EEF8" bg=${DARK} label="--text on panel" /><${Ratio} theme="dark" fg="#A9B6C9" bg=${DARK} label="--text-2 on panel" /><${Ratio} theme="dark" fg="#8494AC" bg=${DARK} label="--text-3 on panel" /><${Ratio} theme="dark" fg="#8494AC" bg=${DARKBG} label="--text-3 on --ops-bg" /></div></div>
          <div class="ds-swatch"><div class="ds-swatch__body"><h3>Light surfaces (Compute, Host)</h3><p>--light-bg #F6F7F9, cards #FFFFFF, --ink #0F172A. Body text meets AAA.</p>
            <${Ratio} theme="light" fg="#0F172A" bg=${LIGHTBG} label="--ink on bg" /><${Ratio} theme="light" fg="#475569" bg=${LIGHTBG} label="--text-2 on bg" /><${Ratio} theme="light" fg="#475569" bg=${LIGHT} label="--text-2 on card" /><${Ratio} theme="light" fg="#5B6A80" bg=${LIGHTBG} label="--text-3 on bg (12 px meta)" /></div></div>
          <div class="ds-swatch"><div class="ds-swatch__body"><h3>Rules</h3><p>Status is always icon plus text plus colour. Focus ring is --tank, 2 px, 2 px offset. Categories without a meaning (priority tiers) use the neutral ramp --cat-1 to --cat-3, never a data colour.</p>
            <div class="row wrap" style="margin-top:8px"><button class="dh-btn" style="outline:2px solid var(--tank);outline-offset:2px">Focus ring</button><span class="row" style="gap:4px"><span style="width:18px;height:18px;border-radius:4px;background:var(--cat-1)"></span><span style="width:18px;height:18px;border-radius:4px;background:var(--cat-2)"></span><span style="width:18px;height:18px;border-radius:4px;background:var(--cat-3)"></span></span></div></div></div>
        </div>
      </section>

      <section class="ds-sec"><h2><span>02</span>Type, shape and space</h2>
        <p>Inter for interface text. JetBrains Mono with tabular figures for every number in tables, tickers and KPIs. KPI numerals are large and light, the unit sits small and muted beside them. Every number carries a unit and a period.</p>
        <div class="ds-grid ds-g2">
          <div class="dh-card"><div class="ds-type">
            ${[[40, "KPI hero", 300], [28, "KPI value", 300], [20, "Section title", 600], [16, "Card title, lead", 600], [14, "Body", 400], [13, "Controls, table cells", 500], [12, "Labels, meta, units", 500]].map(([s, l, w]) => html`<code>${s} / ${w}</code><div style=${`font-size:${s}px;font-weight:${w};line-height:1.2;letter-spacing:${s > 20 ? "-0.02em" : 0}`}>${l}</div>`)}
            <code>mono</code><div class="num" style="font-size:20px">0123456789 · 12.5 kWh · 0.42 CHF</div></div></div>
          <div class="dh-card col" style="gap:18px">
            <div><div class="eyebrow">Example</div><div style="margin-top:8px"><${KpiTile} label="Heat delivered" value=${12.5} d=${1} unit="kWh" period="last 15 min" tone="heat" icon="flame" /></div></div>
            <div><div class="eyebrow">Radii</div><div class="row wrap" style="margin-top:8px;gap:12px"><div class="ds-radius" style="border-radius:10px">10 control</div><div class="ds-radius" style="border-radius:16px">16 card</div><div class="ds-radius" style="border-radius:22px">22 drawer</div></div></div>
            <div><div class="eyebrow">Space: 8 px grid</div><div class="row" style="margin-top:8px;gap:8px;align-items:flex-end">${[4, 8, 12, 16, 24, 32, 48].map((s) => html`<div class="col" style="align-items:center;gap:4px"><div style=${`width:${s}px;height:${s}px;background:var(--tank);border-radius:2px;opacity:.7`}></div><code class="num t-12 faint">${s}</code></div>`)}</div></div>
            <p class="t-13 muted">Panels float 16 px from the viewport edge. Shadows are soft and tinted by the content colour (glow follows status), never plain grey on dark.</p>
          </div>
        </div>
      </section>

      <section class="ds-sec"><h2><span>03</span>Component kit</h2>
        <p>Each component is shown on the dark Operations surface and on the light portal surface. Names are final: the build prompt references them as written. Props and consumed data are listed in components.md.</p>
        <div class="ds-grid ds-g2">
          <${Spec} name="StatusChip" note="Site, task, server and severity states. Icon and text carry the meaning, colour supports it. Crossfades in 300 ms." data="site.status · task.state · alert.severity">
            ${["covered", "tank_low", "dumping", "unmet", "offline"].map((s) => html`<${StatusChip} kind="site" value=${s} />`)}
            ${["waiting", "running", "paused", "done", "missed", "cancelled"].map((s) => html`<${StatusChip} kind="task" value=${s} size="sm" />`)}
          <//>
          <${Spec} name="OriginBadge" note="LIVE is a real process on a laptop. SIMULATED is everything else. Told apart by form (solid dot and border against dashed), not colour. The LIVE dot pings once per heartbeat." data="server.live · server.lastHeartbeat">
            <${OriginBadge} live=${true} beat=${DH.sel.server(st, "HOTEL1-S1").lastHeartbeat} /><${OriginBadge} live=${false} /><${Illustrative} />
          <//>
          <${Spec} name="KpiTile" note="Label, light numeral, muted unit, period. Trend appears only when a prior period exists. Value changes count for 400 ms and flash the changed digits." data="GET /admin/kpis · WS kpi.update">
            <${KpiTile} label="Heat coverage" value=${k.coveragePct} d=${1} unit="%" period="today" tone="ok" icon="check-circle" prior=${k.prior.coveragePct} />
            <${KpiTile} label="Missed deadlines" value=${k.missedDeadlinesPct} d=${1} unit="%" period="this month" tone="critical" icon="alert-octagon" />
            <div class="dh-kpi"><div class="dh-kpi__label">Loading</div><${Skeleton} variant="num" /><${Skeleton} w=${70} /></div>
          <//>
          <${Spec} name="KpiRail" light=${false} note="Floating glass strip over the map. Horizontal scroll on narrow screens. Each tile names its period.">
            <${KpiRail} items=${rail} />
          <//>
          <${Spec} name="DonutGauge" note="variant tank: liquid level eases 600 ms with a short surface wave, number counts up. variant ring: coverage." data="site.tankKwh / tankCapacityKwh · kpis.coveragePct">
            <${DonutGauge} variant="tank" tone="tank" value=${tank} max=${70} size=${124} label="Tank level" center=${html`<div class="dh-donut__value t-28"><${Num} value=${(100 * tank) / 70} d=${0} /><span class="unit">%</span></div><div class="dh-donut__sub num">${fmt.num(tank, 1)} / 70 kWh</div>`} />
            <${DonutGauge} value=${k.coveragePct} tone="ok" size=${104} stroke=${9} label="Heat coverage" center=${html`<div class="dh-donut__value t-20"><${Num} value=${k.coveragePct} d=${0} /><span class="unit">%</span></div><div class="dh-donut__sub">covered</div>`} />
            <button class="dh-btn dh-btn--sm" onClick=${() => setTank((t) => (t > 40 ? 18 : 57.4))}>Change level</button>
          <//>
          <${Spec} name="RackBar" col note="One bar per server, one segment per running task. Hatched amber is a paused task. Hatched track is offline." data="server.tasks[].powerKw / server.capacityKw">
            <${RackBar} server=${pharma[0]} showOrigin onClick=${() => {}} /><${RackBar} server=${pharma[2]} showOrigin /><${RackBar} server=${idle} showOrigin /><${RackBar} server=${farm} showOrigin />
          <//>
          <${Spec} name="HeatFlowChart" col span=${2} note="Stacked area. Server heat, tank and backup add up to the demand line. Dumped heat sits above the line: amber is waste. Legend, axis unit, hover tooltip, empty state." data="GET /admin/sites/{id}/timeline">
            <${HeatFlowChart} rows=${st.timeline.PHARMA1.slice(-32)} /><${HeatFlowChart} rows=${[]} height=${90} legend=${false} />
          <//>
          <${Spec} name="StackedBars" col note="Host energy and usage charts. The dark tick is the demand marker. Units on the axis." data="GET /site/sites/{id}/energy">
            <${StackedBars} buckets=${energy} height=${170} />
          <//>
          <${Spec} name="SparkTrend · HeatPulse · ProgressBar" col note="SparkTrend renders nothing without a comparable prior period. HeatPulse runs only while a task runs, speed scales with load. ProgressBar never moves backward. Complete draws a mint check.">
            <div class="row wrap"><${SparkTrend} values=${[91, 93, 92, 95, 94, 96, 96.1]} prior=${94.8} value=${96.1} d=${1} unit="pts" tone="ok" /><span class="t-12 faint">with prior</span><span class="t-12 faint" style="margin-left:16px">without prior: nothing renders</span></div>
            <${HeatPulse} on load=${0.8} label="23 kW into tank" /><${HeatPulse} on=${false} label="idle" />
            <${ProgressBar} value=${62} running lg /><div class="row"><div class="grow"><${ProgressBar} value=${100} tone="ok" lg /></div><span key=${replay}><${CheckDraw} /></span><button class="dh-btn dh-btn--sm dh-btn--ghost" onClick=${() => setReplay((x) => x + 1)}>Replay</button></div>
          <//>
          <${Spec} name="TaskChain" col note="queued → running → paused or migrated → complete. Terminal states: complete (mint), missed (red), cancelled (neutral)." data="task.state · task.events[]">
            ${["J205-T4", "J201-T1", "J202-T4", "J205-T3", "J201-T3", "J209-T1"].map((id) => html`<div><div class="t-12 faint num" style="margin-bottom:6px">${id}</div><${TaskChain} task=${tk(id)} /></div>`)}
          <//>
          <${Spec} name="TaskGraph · Timeline" col note="Dependencies left to right. Running nodes carry their progress. Timeline: newest lifecycle events slide in from the top." data="task.dependsOn[] · task.events[]">
            <${TaskGraph} tasks=${jobTasks} />
            <${Timeline} items=${tk("J202-T4").events.slice().reverse().map((e) => Object.assign({}, e, { detail: DH.eventDetail(e) }))} />
          <//>
          <${Spec} name="DataTable · FilterChips" col span=${2} note="Sortable columns, sticky header, numeric columns right-aligned in mono, selected row opens a drawer. Filter chips are toggle buttons." data="GET /admin/tasks">
            <${FilterChips} groups=${[{ label: "Priority", value: fil, onChange: setFil, options: [{ value: "critical", label: "Critical" }, { value: "normal", label: "Normal" }, { value: "flexible", label: "Flexible" }] }]} />
            <${DataTable} caption="Tasks" rows=${st.tasks.filter((t) => !fil || t.priority === fil).slice(0, 5)} selectedKey="J202-T4" onRow=${() => {}} initialSort=${{ key: "progressPct", dir: "desc" }} columns=${[
              { key: "id", label: "Task", render: (t) => html`<span class="num">${t.id}</span>` }, { key: "name", label: "Name" },
              { key: "state", label: "Status", render: (t) => html`<${StatusChip} kind="task" value=${t.state} size="sm" />` },
              { key: "progressPct", label: "Progress", num: true, render: (t) => `${Math.round(t.progressPct)} %` }, { key: "powerKw", label: "Power", num: true, render: (t) => `${fmt.num(t.powerKw, 1)} kW` }]} />
          <//>
          <${Spec} name="SiteMarker3D · MigrationArc" light=${false} span=${2} note="Column height is heat demand now. Ring is servers running over total. Colour is status. Glyph is the host type. An arc draws in 900 ms on a migrated event, a bead travels along it, the source dims and the target pulses once." data="GET /admin/map/sites · WS slot.tick · WS task.migrated">
            ${Marker ? html`<${Marker} />` : html`<p class="faint">Map module not loaded.</p>`}
          <//>
          <${Spec} name="ClockControl" light=${false} col note="Play or pause, mode, simulated clock with rolling digits, always labelled Simulated time. The play button shows a faint heartbeat ring on every clock.tick. Full variant adds speed and jump." data="GET/PUT /admin/scheduler · WS clock.tick">
            <div><${ClockControl} /></div><${ClockControl} variant="full" />
          <//>
          <${Spec} name="AlertCard · AlertTray" col note="Severity by icon, word and colour. Critical cards breathe at 2.4 s until acknowledged. Actions: Acknowledge, View site." data="GET /admin/events · PATCH /admin/events/{id} · WS alert.raised">
            <div class="row"><${AlertTray} /><span class="t-12 faint">bell with open count, opens the tray</span></div>
            ${[st.alerts.find((a) => a.kind === "unmet_demand"), st.alerts.find((a) => a.kind === "heat_dumped"), st.alerts.find((a) => a.acknowledged)].filter(Boolean).map((a) => html`<${AlertCard} alert=${a} now=${st.scheduler.currentTime} onAck=${(x) => DH.api.ackAlert(x.id)} onView=${() => {}} />`)}
          <//>
          <${Spec} name="EmptyState · ErrorState · Skeleton · ConnectionBanner" col note="Every screen has all four. Empty states offer one helpful action. Errors offer retry. Reconnecting dims data and shows a retry countdown.">
            <${ConnectionBanner} onRetry=${() => {}} />
            <${EmptyState} compact icon="tasks" title="No jobs yet" body="Submit your first job to see it scheduled against heat demand." action=${html`<button class="dh-btn dh-btn--primary">Submit a job</button>`} />
            <${ErrorState} compact onRetry=${() => {}} />
            <div class="col" style="gap:8px"><${Skeleton} variant="title" /><${Skeleton} w="90%" /><${Skeleton} w="70%" /></div>
          <//>
          <${Spec} name="AssumptionPill" note="Every assumption opens a popover with value, source and status. BRIEF, SOURCE, ASSUMPTION, MOCK, LIMIT." data="GET /admin/assumptions">
            ${[0, 2, 4, 6, 7].map((i) => html`<${AssumptionPill} a=${st.assumptions[i]} />`)}
          <//>
          <${Spec} name="PayOffStatement" col note="The backend sentence, verbatim. Numbers and the word NOT are emphasised, never rewritten." data="GET /admin/results → fleet.payOffStatement">
            <${PayOffStatement} text=${st.results.mpc.fleet.payOffStatement} algorithm="mpc" generatedAt=${st.results.mpc.generatedAt} />
          <//>
          <${Spec} name="Controls" col note="Buttons, tabs, segmented control. 36 px controls on desktop, 44 px touch targets on phone.">
            <div class="row wrap"><button class="dh-btn dh-btn--primary">Primary</button><button class="dh-btn">Secondary</button><button class="dh-btn dh-btn--ghost">Ghost</button><button class="dh-btn dh-btn--danger">Cancel task</button><button class="dh-btn" disabled>Disabled</button><${InfoPop}><p>Popovers explain a number: value, source, status.</p><//></div>
            <${Tabs} label="Example tabs" value=${tab} onChange=${setTab} tabs=${[{ value: "overview", label: "Overview" }, { value: "servers", label: "Servers" }, { value: "jobs", label: "Jobs", count: 4 }, { value: "history", label: "History" }]} />
            <div><${Segmented} label="Map view" value=${seg} onChange=${setSeg} options=${[{ value: "demand", label: "Heat Demand", icon: "flame" }, { value: "status", label: "Status", icon: "check-circle" }, { value: "servers", label: "Servers", icon: "server" }, { value: "arcs", label: "Arcs", icon: "shuffle" }]} /></div>
          <//>
        </div>
      </section>

      <section class="ds-sec"><h2><span>04</span>Motion rules</h2>
        <p>All motion is event-driven: nothing moves unless a data event caused it. Under prefers-reduced-motion every animation becomes an instant state change with a text equivalent. The full specification is in motion-spec.md.</p>
        <div class="dh-card" style="padding:8px 12px;overflow:auto"><table class="ds-motion">
          <thead><tr><th>Animation</th><th>Trigger</th><th>Duration, easing</th><th>Reduced motion</th></tr></thead>
          <tbody>${[
            ["Heat pulse", "A task is running on a rack", "1.6 s loop, ease-in-out, faster with load", "Static orange source icon, label “heat flowing”"],
            ["Tank fill", "Tank level changes", "600 ms ease-out, wave settles in 2.8 s", "Level and number jump"],
            ["Column growth", "New heat-demand reading (slot.tick)", "500 ms ease-out, glow follows demand", "Column jumps"],
            ["Ring sweep", "Running / total servers changes", "400 ms, then one soft ping", "Ring jumps"],
            ["Migration arc", "task.migrated", "900 ms draw, bead travels, target pulses once", "Static arc for 4 s, event text in the stream"],
            ["Status change", "site.status changes", "300 ms crossfade, one ripple at the marker base", "Instant colour and chip change"],
            ["Dumping", "Site is dumping heat", "Slow amber shimmer on the column top, never a flash", "Static amber cap"],
            ["Critical", "Backup heat or unmet demand", "Red edge glow breathing at 2.4 s, alert card slides in from the right", "Static red outline, alert appears"],
            ["Clock tick", "clock.tick", "Digits roll 320 ms, heartbeat ring on play", "Digits swap"],
            ["Task progress", "Task progress update", "Bar eases 900 ms, never backward. Mint check draws on complete", "Bar jumps, check appears"],
            ["Drawer", "Open and close", "280 ms slide and fade, content staggers 40 ms", "Instant"],
            ["Number change", "Any KPI", "400 ms count, changed digits highlight", "Instant"],
            ["Skeleton to content", "Data loaded", "200 ms crossfade", "Instant"],
            ["Reconnecting", "WebSocket lost", "Banner slides down 280 ms, data dims, retry countdown", "Banner appears"],
            ["Page and tab", "Navigation", "200 ms fade with 8 px shift", "Instant"],
          ].map((r) => html`<tr><td class="w-600">${r[0]}</td><td>${r[1]}</td><td><code>${r[2]}</code></td><td class="muted">${r[3]}</td></tr>`)}</tbody></table></div>
      </section>
      <${DH.ProtoBar} here="system" />
    </div>`;
  }

  DH.boot();
  DH.mount(App);
})();
