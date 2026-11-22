/* ==========================================================================
   Operations Console (/ops): shell, fleet map and the eight other screens.
   Routes (hash): / map · /sites · /servers · /tasks · /customers · /lab · /events · /economics · /settings
   ========================================================================== */
(function () {
  const DH = window.DH, P = window.htmPreact;
  const { html, useState, useEffect } = P;
  const { fmt, cx, vocab, sel, Icon, Logo, Num, StatusChip, OriginBadge, Illustrative, KpiTile, KpiRail, RackBar, ProgressBar, TaskChain, Timeline, DataTable, FilterChips, Segmented, Pop, InfoPop,
    ConfirmDialog, ClockControl, AlertTray, AlertToasts, EmptyState, ErrorState, Skeleton, SkeletonBlock, ConnectionBanner, ViewState, AssumptionPill, PayOffStatement, Legend, ProtoBar,
    DonutGauge, StackedBars, FleetMap, SiteDrawer, ServerDrawer, TaskDrawer, SiteFlow, SiteTank, SiteRacks, SiteCounters, SiteHistory, ServerCard, OpsCount, siteOrigin } = DH;
  const { todayRows, sum } = DH.opsHelpers;

  const NAV = [
    { path: "/", label: "Fleet Map", icon: "map" }, { path: "/sites", label: "Site Details", icon: "pin" }, { path: "/servers", label: "Server Details", icon: "server" },
    { path: "/tasks", label: "Jobs and Tasks", icon: "tasks" }, { path: "/customers", label: "Customers", icon: "users" }, { path: "/lab", label: "Scheduler Lab", icon: "flask" },
    { path: "/events", label: "Events", icon: "activity" }, { path: "/economics", label: "Platform Economics", icon: "coins" }, { path: "/settings", label: "Settings", icon: "sliders" },
  ];
  const retry = () => DH.router.set({ state: null });
  const PageHead = ({ title, sub, children }) => html`<div class="ops-page__head"><div><h1>${title}</h1>${sub && html`<p>${sub}</p>`}</div><div class="row wrap">${children}</div></div>`;
  const Card = ({ title, sub, right, children, cls, style }) => html`<section class=${cx("dh-card", cls)} style=${style}>${(title || right) && html`<div class="row-between" style="margin-bottom:14px;align-items:flex-start"><div><h2 class="dh-card__title">${title}</h2>${sub && html`<div class="dh-card__sub">${sub}</div>`}</div>${right}</div>`}${children}</section>`;
  const tableSkeleton = html`<div class="dh-card" aria-busy="true"><span class="sr-only">Loading</span><div class="row wrap" style="margin-bottom:16px">${[90, 70, 110, 80].map((w) => html`<${Skeleton} w=${w} h=${30} style="border-radius:15px" />`)}</div><div class="col" style="gap:14px">${Array.from({ length: 8 }, (_, i) => html`<div class="row" style="gap:16px"><${Skeleton} w=${70} /><${Skeleton} w=${`${28 - (i % 3) * 5}%`} /><${Skeleton} w=${90} /><span class="grow"></span><${Skeleton} w=${120} /></div>`)}</div></div>`;

  /* ---------- KPI definitions shared by the rail card and the floating KpiRail ---------------- */
  function railItems(k) {
    const p = k.prior || {};
    return [
      { label: "Heat coverage", value: k.coveragePct, d: 1, unit: "%", period: "today", tone: "ok", icon: "check-circle", prior: p.coveragePct },
      { label: "Heat delivered", value: k.deliveredKwh, d: 0, unit: "kWh", period: "today", tone: "heat", icon: "flame", prior: p.deliveredKwh },
      { label: "Heat dumped", value: k.dumpedKwh, d: 1, unit: "kWh", period: "today", tone: "dump", icon: "wind", prior: p.dumpedKwh, lowerIsBetter: true },
      { label: "Active tasks", value: k.tasksRunning, d: 0, period: "now", tone: "heat", icon: "play" },
      { label: "Fleet utilisation", value: k.utilisationPct, d: 0, unit: "%", period: "today", icon: "server", prior: p.utilisationPct },
      { label: "Missed deadlines", value: k.missedDeadlinesPct, d: 1, unit: "%", period: "this month", tone: "critical", icon: "alert-octagon", prior: p.missedDeadlinesPct, lowerIsBetter: true },
      { label: "Compute income", value: k.computeIncomeChf, d: 0, unit: "CHF", period: "today", icon: "coins", prior: p.computeIncomeChf },
      { label: "Break-even", value: k.breakEvenChfPerServerHour, d: 2, unit: "CHF / server-h", period: "today", icon: "target", prior: p.breakEvenChfPerServerHour, lowerIsBetter: true },
    ];
  }
  function KpiOverview({ st, loading }) {
    const k = st.kpis;
    if (loading) return html`<div class="ops-rail__kpi dh-glass" aria-busy="true"><${Skeleton} w=${110} /><div style="display:grid;place-items:center;padding:8px"><${Skeleton} w=${112} h=${112} variant="circle" /></div>${Array.from({ length: 6 }, () => html`<${Skeleton} w="100%" h=${14} />`)}</div>`;
    const rows = [["dump", "wind", "Dumped", html`<${Num} value=${k.dumpedKwh} d=${1} /> kWh`], ["critical", "alert-octagon", "Unmet", html`<${Num} value=${k.unmetKwh} d=${1} /> kWh`], ["idle", "server", "Utilisation", html`<${Num} value=${k.utilisationPct} d=${0} /> %`],
      ["heat", "play", "Tasks running", html`<${Num} value=${k.tasksRunning} d=${0} />`], ["critical", "clock", "Missed, this month", html`<${Num} value=${k.missedDeadlinesPct} d=${1} /> %`], ["idle", "target", "Break-even", html`<${Num} value=${k.breakEvenChfPerServerHour} d=${2} /><span class="faint" style="font-size:11px"> CHF/server-h</span>`]];
    return html`<div class="ops-rail__kpi dh-glass" aria-label="KPI overview">
      <div class="ops-rail__mini"><${DonutGauge} value=${k.coveragePct} tone="ok" size=${48} stroke=${5} label=${`Heat coverage ${fmt.pct(k.coveragePct)} percent`} center=${html`<span class="num t-12 w-600">${Math.round(k.coveragePct)}</span>`} /></div>
      <div class="row-between"><span class="eyebrow">KPI overview</span><span class="t-12 faint">today</span></div>
      <div class="row" style="gap:14px"><${DonutGauge} value=${k.coveragePct} tone="ok" size=${84} stroke=${8} label=${`Heat coverage ${fmt.pct(k.coveragePct, 1)} percent today`}
          center=${html`<div class="dh-donut__value t-20"><${Num} value=${k.coveragePct} d=${0} /><span class="unit">%</span></div>`} />
        <div><div class="t-13 w-600">Heat coverage</div><div class="t-12 muted" style="margin-top:2px">of host heat demand met by server heat and tanks</div></div></div>
      <dl style="margin:0">${rows.map(([tone, icon, label, val]) => html`<div class=${cx("ops-kv", "tone-" + tone)}><dt><${Icon} name=${icon} size=${13} />${label}</dt><dd class="num">${val}</dd></div>`)}</dl>
      
    </div>`;
  }

  /* ---------- Fleet Map screen ------------------------------------------------------------------- */
  function MapOverlays({ st, view, setView, list, setList, state }) {
    const lg = [["ok", "check-circle", "Covered"], ["tank", "droplet", "Tank low"], ["dump", "wind", "Dumping"], ["critical", "alert-octagon", "Backup heat"], ["idle", "wifi-off", "Offline"]];
    return html`<div class="ops-mapbar">
      ${state === "loading" ? html`<div class="dh-glass dh-rail" aria-busy="true">${Array.from({ length: 8 }, () => html`<div class="dh-kpi" style="gap:8px"><${Skeleton} w=${90} /><${Skeleton} variant="num" w=${70} h=${26} /><${Skeleton} w=${50} /></div>`)}</div>` : html`<${KpiRail} items=${railItems(st.kpis)} class=${state === "reconnecting" ? "is-stale" : null} />`}
      <div class="ops-mapbar__row">
        <${Segmented} label="Map view" value=${view} onChange=${setView} options=${DH.MAP_VIEWS} />
        <div class="ops-legend dh-glass" aria-label="Status legend">${lg.map(([tone, icon, label]) => html`<span class=${cx("row", "tone-" + tone)} style="gap:5px"><span style="color:var(--tone-ink);display:inline-flex"><${Icon} name=${icon} size=${13} /></span>${label}</span>`)}</div>
        <span class="grow"></span>
        <button type="button" class="dh-btn" style="background:rgba(11,22,40,.78)" aria-pressed=${list} onClick=${() => setList(!list)}><${Icon} name=${list ? "map" : "list"} size=${14} />${list ? "Back to map" : "View sites as list"}</button>
      </div>
    </div>`;
  }
  function SiteList({ st }) {
    const cols = [
      { key: "name", label: "Site", render: (s) => html`<span class="row"><${Icon} name=${vocab.hostType[s.type]} size=${14} class="faint" /><span class="w-600">${s.name}</span></span>` },
      { key: "hostType", label: "Host type" },
      { key: "status", label: "Status", render: (s) => html`<${StatusChip} kind="site" value=${s.status} size="sm" />` },
      { key: "demandKwh", label: "Demand, last 15 min", num: true, render: (s) => `${fmt.num(s.demandKwh, 1)} kWh` },
      { key: "tank", label: "Tank", num: true, sortValue: (s) => s.tankKwh / s.tankCapacityKwh, render: (s) => `${fmt.pct((100 * s.tankKwh) / s.tankCapacityKwh)} %` },
      { key: "serversRunning", label: "Servers", num: true, render: (s) => `${s.serversRunning} / ${s.serversTotal}` },
      { key: "live", label: "Origin", sortable: false, render: (s) => html`<${OriginBadge} live=${s.live} />` },
    ];
    return html`<div class="ops-sitelist dh-glass dh-page"><div class="row-between" style="margin-bottom:12px"><h2 class="t-16 w-600">Sites</h2><span class="t-12 faint">Same data as the map. Select a row to open the site.</span></div>
      <${DataTable} caption="Sites of the fleet" columns=${cols} rows=${st.sites} onRow=${(s) => DH.router.set({ site: s.id })} selectedKey=${DH.router.get().q.site} /></div>`;
  }
  function Story() {
    return html`<div class="ops-story dh-glass" aria-label="How DigitalHeat works"><b>MNC sends AI workloads</b><${Icon} name="arrow-right" size=${13} /><b>DigitalHeat schedules compute</b><${Icon} name="arrow-right" size=${13} /><b>servers create heat</b><${Icon} name="arrow-right" size=${13} /><b>host business uses heat</b></div>`;
  }

  /* ---------- Site Details page -------------------------------------------------------------------- */
  function SitesPage({ st, q }) {
    const id = q.id || "POOL1", site = sel.site(st, id), now = DH.useNow(1000);
    const rows = todayRows(st, id), dem = sum(rows, "demandKwh"), del = sum(rows, "deliveredKwh");
    return html`<${PageHead} title="Site Details" sub="One host business at a time: heat flow, tank, racks and history." />
      <div class="ops-grid ops-split">
        <div class="col" style="gap:8px" role="list" aria-label="Sites">${st.sites.map((s) => html`<button type="button" role="listitem" key=${s.id} class=${cx("ops-servercard", "tone-" + vocab.site[s.status].tone)} style=${s.id === id ? "border-color:var(--tank);background:color-mix(in srgb, var(--tank) 12%, transparent)" : null} aria-current=${s.id === id ? "true" : null} onClick=${() => DH.router.set({ id: s.id })}>
          <div class="row-between"><span class="row"><${Icon} name=${vocab.hostType[s.type]} size=${15} class="faint" /><span class="w-600 t-13">${s.name}</span></span><${StatusChip} kind="site" value=${s.status} size="sm" /></div>
          <div class="row"><div class="grow"><${ProgressBar} value=${(100 * s.tankKwh) / s.tankCapacityKwh} tone="tank" label="Tank level" key=${s.id + Math.round(s.tankKwh)} /></div><span class="num t-12 muted" style="min-width:64px;text-align:right">tank ${fmt.pct((100 * s.tankKwh) / s.tankCapacityKwh)} %</span></div></button>`)}</div>
        <div class="col" style="gap:16px" key=${id}>
          <${Card} cls="dh-page"><div class="row-between wrap" style="align-items:flex-start"><div><div class="t-12 faint num">Host business · ${site.id}</div><h2 class="t-20 w-600">${site.name}</h2><div class="t-12 muted">${site.hostType}</div></div>
              <div class="row wrap"><${StatusChip} kind="site" value=${site.status} />${siteOrigin(st, site)}<button type="button" class="dh-btn dh-btn--sm" onClick=${() => DH.router.go("/", { site: id })}><${Icon} name="map" size=${12} />Show on map</button></div></div>
            <div class="ops-grid ops-cols-4" style="margin-top:18px">
              <${KpiTile} label="Heat coverage" value=${dem ? (100 * del) / dem : 0} d=${1} unit="%" period="today" tone="ok" icon="check-circle" />
              <${KpiTile} label="Heat demand" value=${dem} d=${0} unit="kWh" period="today" tone="tank" icon="droplet" />
              <${KpiTile} label="Heat dumped" value=${sum(rows, "dumpedKwh")} d=${1} unit="kWh" period="today" tone="dump" icon="wind" />
              <${KpiTile} label="Backup heat" value=${sum(rows, "unmetKwh")} d=${1} unit="kWh" period="today" tone="critical" icon="alert-octagon" /></div><//>
          <div class="ops-grid ops-cols-2"><${Card}><${SiteFlow} st=${st} site=${site} wide /><//>
            <${Card}><${SiteTank} site=${site} /><${SiteRacks} st=${st} site=${site} /><//></div>
          <${Card}><${SiteHistory} st=${st} site=${site} wide /><//>
        </div></div>`;
  }

  /* ---------- Server Details page ------------------------------------------------------------------- */
  function ServersPage({ st }) {
    const now = DH.useNow(1000), live = st.servers.filter((s) => s.live);
    return html`<${PageHead} title="Server Details" sub="Every rack in the fleet. LIVE servers run a real process on a laptop. All others are simulated by the scheduler model.">
        <span class="ops-status"><i></i>MQTT ${st.scheduler.mqtt}</span><//>
      <${Card} title="Live laptops" sub="What really runs on each agent, measured on the device" right=${html`<${OriginBadge} live=${true} beat=${live[0] && live[0].lastHeartbeat} />`}>
        ${live.length === 0 ? html`<${EmptyState} compact icon="plug" title="No laptop connected" body="Start an agent with: python -m live.agent --server-id HOTEL1-S1 --host <ip>. Until then every server is SIMULATED." />` : html`<div class="ops-grid ops-cols-2">${live.map((s) => html`<div class="ops-servercard" key=${s.id}>
          <div class="row-between"><span><span class="num w-600">${s.host}</span> <span class="muted t-12">as ${s.id}, ${sel.site(st, s.siteId).name}</span></span><span class="t-12 muted row"><${Icon} name="activity" size=${12} />heartbeat <span class="num">${fmt.ago(s.lastHeartbeat, now)}</span></span></div>
          <div class="row" style="gap:16px"><${KpiTile} size="sm" label="CPU" value=${s.cpuPct} d=${0} unit="%" tone="heat" icon="cpu" /><div class="grow col" style="gap:8px">${s.tasks.map((t) => html`<div key=${t.id}><div class="row-between t-12"><span><span class="num">${t.id}</span> <span class="muted">${t.name}</span></span><span class="num">${Math.round(t.progressPct)} %</span></div><${ProgressBar} value=${t.progressPct} running /></div>`)}${s.tasks.length === 0 ? html`<span class="t-12 faint">Idle: no process running</span>` : null}</div></div>
        </div>`)}</div>`}<//>
      <div class="col" style="gap:16px;margin-top:16px">${st.sites.map((site) => html`<${Card} key=${site.id} title=${site.name} sub=${`${site.hostType} · ${site.serversRunning} of ${site.serversTotal} servers running · ${fmt.num(site.loadKw, 1)} of ${fmt.num(site.capacityKw, 0)} kW`} right=${html`<${StatusChip} kind="site" value=${site.status} size="sm" />`}>
        <div class="ops-grid ops-cols-3">${sel.serversOf(st, site.id).map((s) => html`<${ServerCard} key=${s.id} st=${st} s=${s} now=${now} />`)}</div><//>`)}</div>`;
  }

  /* ---------- Jobs and Tasks (task explorer) ---------------------------------------------------------- */
  function TasksPage({ st, q }) {
    const [f, setF] = useState({ customer: q.fcust || null, priority: null, status: null, site: q.fsite || null });
    const [confirm, setConfirm] = useState(null);
    const set = (k) => (v) => setF((x) => Object.assign({}, x, { [k]: v }));
    const bucket = (t) => (t.state === "waiting" || t.state === "ready" ? "queued" : t.state);
    const rows = st.tasks.map((t) => { const j = sel.job(st, t.jobId); return Object.assign({}, t, { job: j, customer: j && sel.customer(st, j.customerId) }); })
      .filter((t) => (!f.customer || (t.customer && t.customer.id === f.customer)) && (!f.priority || t.priority === f.priority) && (!f.status || bucket(t) === f.status) && (!f.site || t.siteId === f.site));
    const cnt = (fn) => st.tasks.filter(fn).length;
    const groups = [
      { label: "Customer", value: f.customer, onChange: set("customer"), options: st.customers.map((c) => ({ value: c.id, label: c.name.split(",")[0] })) },
      { label: "Priority", value: f.priority, onChange: set("priority"), options: ["critical", "normal", "flexible"].map((p) => ({ value: p, label: vocab.priority[p].label, count: cnt((t) => t.priority === p) })) },
      { label: "Status", value: f.status, onChange: set("status"), options: [["running", "Running"], ["paused", "Paused"], ["queued", "Queued"], ["done", "Complete"], ["missed", "Missed"]].map(([v, l]) => ({ value: v, label: l, count: cnt((t) => bucket(t) === v) })) },
      { label: "Site", value: f.site, onChange: set("site"), options: st.sites.filter((s) => s.status !== "offline").map((s) => ({ value: s.id, label: s.name.split(" ").slice(-1)[0] })) },
    ];
    const act = (e, t, a) => { e.stopPropagation(); setConfirm({ t, a }); };
    const text = { pause: ["Pause", "The task keeps its progress and stays paused until an operator resumes it.", "Pause task"], resume: ["Resume", "The scheduler may run this task again on the next slot.", "Resume task"], cancel: ["Cancel", "The task stops and cannot be resumed. Tasks that depend on it will not start.", "Cancel task"] };
    const cols = [
      { key: "id", label: "Task", render: (t) => html`<span class="num w-600">${t.id}</span>` },
      { key: "name", label: "Name", render: (t) => html`<div>${t.name}</div><div class="t-12 faint">${t.job ? t.job.name : ""}</div>` },
      { key: "customer", label: "Customer", sortValue: (t) => (t.customer ? t.customer.name : ""), render: (t) => (t.customer ? t.customer.name.split(",")[0] : "–") },
      { key: "priority", label: "Priority", render: (t) => html`<span class="row" style="gap:5px"><${Icon} name=${vocab.priority[t.priority].icon} size=${13} class="faint" />${vocab.priority[t.priority].label}</span>` },
      { key: "state", label: "Status", render: (t) => html`<${StatusChip} kind="task" value=${t.state} size="sm" />` },
      { key: "serverId", label: "Server", render: (t) => html`<span class="num">${t.serverId || "–"}</span>` },
      { key: "progressPct", label: "Progress", width: "150px", render: (t) => html`<div class="row"><div class="grow"><${ProgressBar} value=${t.progressPct} running=${t.state === "running"} tone=${t.state === "done" ? "ok" : t.state === "paused" ? "dump" : t.state === "missed" ? "critical" : "heat"} /></div><span class="num t-12" style="min-width:34px;text-align:right">${Math.round(t.progressPct)} %</span></div>` },
      { key: "deadline", label: "Deadline", num: true, render: (t) => fmt.dayTime(t.deadline) },
      { key: "slackMin", label: "Slack", num: true, render: (t) => (t.slackMin == null ? "–" : html`<span class=${t.slackMin < 0 ? "tone-critical" : t.slackMin < 60 ? "tone-dump" : null} style=${t.slackMin < 60 ? "color:var(--tone-ink);font-weight:600" : null}>${t.slackMin < 0 ? "late " + fmt.dur(-t.slackMin) : fmt.dur(t.slackMin)}</span>`) },
      { key: "act", label: "Actions", sortable: false, render: (t) => (["done", "missed", "cancelled"].includes(t.state) ? html`<span class="faint">–</span>` : html`<span class="row" style="gap:2px">
        ${t.state === "paused" ? html`<button type="button" class="dh-iconbtn dh-iconbtn--sm" aria-label=${`Resume ${t.id}`} title="Resume" onClick=${(e) => act(e, t, "resume")}><${Icon} name="play" size=${12} /></button>` : html`<button type="button" class="dh-iconbtn dh-iconbtn--sm" aria-label=${`Pause ${t.id}`} title=${t.interruptible ? "Pause" : "Not interruptible"} disabled=${!t.interruptible || t.state !== "running"} style=${!t.interruptible || t.state !== "running" ? "opacity:.35" : null} onClick=${(e) => act(e, t, "pause")}><${Icon} name="pause" size=${12} /></button>`}
        <button type="button" class="dh-iconbtn dh-iconbtn--sm" aria-label=${`Cancel ${t.id}`} title="Cancel" onClick=${(e) => act(e, t, "cancel")}><${Icon} name="x" size=${14} /></button></span>`) },
    ];
    return html`<${PageHead} title="Jobs and Tasks" sub="Every task the scheduler knows, with its chain, deadline and slack. Select a row for the detail."><span class="t-12 faint num">${rows.length} of ${st.tasks.length} tasks</span><//>
      <div class="dh-card" style="padding:16px"><${FilterChips} groups=${groups} />
        <div style="margin-top:14px"><${DataTable} caption="Tasks" columns=${cols} rows=${rows} onRow=${(t) => DH.router.set({ task: t.id })} selectedKey=${q.task} initialSort=${{ key: "state", dir: "desc" }} maxHeight="calc(100vh - 330px)"
          empty=${html`<${EmptyState} compact icon="filter" title="No tasks match these filters" body="Remove a filter to see more tasks." action=${html`<button type="button" class="dh-btn dh-btn--sm" onClick=${() => setF({ customer: null, priority: null, status: null, site: null })}>Clear filters</button>`} />`} /></div></div>
      ${confirm && html`<${ConfirmDialog} title=${`${text[confirm.a][0]} ${confirm.t.id}?`} body=${text[confirm.a][1]} confirmLabel=${text[confirm.a][2]} danger=${confirm.a === "cancel"} onCancel=${() => setConfirm(null)} onConfirm=${() => { DH.api.taskAction(confirm.t.id, confirm.a); setConfirm(null); }} />`}`;
  }

  /* ---------- Customers ----------------------------------------------------------------------------------- */
  function CustomersPage({ st }) {
    const cols = [
      { key: "name", label: "Compute buyer", render: (c) => html`<div class="w-600">${c.name}</div><div class="t-12 faint">${c.sector}</div>` },
      { key: "revenueChf", label: "Spend, this month", num: true, render: (c) => `${fmt.chf(c.revenueChf, 0)} CHF` },
      { key: "jobsRunning", label: "Running jobs", num: true },
      { key: "tasksRunning", label: "Tasks running", num: true },
      { key: "risk", label: "Deadline risk", sortValue: (c) => c.jobsMissed * 10 + c.jobsAtRisk, render: (c) => (c.jobsMissed ? html`<span class="dh-chip dh-chip--sm tone-critical"><${Icon} name="alert-octagon" size=${12} />${c.jobsMissed} missed</span>` : c.jobsAtRisk ? html`<span class="dh-chip dh-chip--sm tone-dump"><${Icon} name="alert-triangle" size=${12} />${c.jobsAtRisk} at risk</span>` : html`<span class="dh-chip dh-chip--sm tone-ok"><${Icon} name="check" size=${12} />On track</span>`) },
      { key: "heatSharePct", label: "Share of fleet heat", width: "220px", render: (c) => html`<div class="row"><div class="grow"><${ProgressBar} value=${c.heatSharePct} tone="heat" label="Share of fleet heat" /></div><span class="num t-12" style="min-width:48px;text-align:right">${fmt.num(c.heatSharePct, 1)} %</span></div>` },
    ];
    const tot = st.customers.reduce((a, c) => a + c.revenueChf, 0);
    return html`<${PageHead} title="Customers" sub="Compute buyers: the paying side of the platform. Share of fleet heat is the part of all reused heat that came from each customer's workloads this month." />
      <div class="ops-grid ops-cols-4" style="margin-bottom:16px">
        <${KpiTile} card label="Compute buyers" value=${st.customers.length} d=${0} period="active this month" icon="users" />
        <${KpiTile} card label="Compute spend" value=${tot} d=${0} unit="CHF" period="this month" icon="coins" />
        <${KpiTile} card label="Running jobs" value=${st.customers.reduce((a, c) => a + c.jobsRunning, 0)} d=${0} period="now" tone="heat" icon="play" />
        <${KpiTile} card label="Jobs at deadline risk" value=${st.customers.reduce((a, c) => a + c.jobsAtRisk, 0)} d=${0} period="now" tone="dump" icon="alert-triangle" /></div>
      <${DataTable} caption="Compute buyers" columns=${cols} rows=${st.customers} initialSort=${{ key: "revenueChf", dir: "desc" }} onRow=${(c) => DH.router.go("/tasks", { fcust: c.id })} />`;
  }

  /* ---------- Scheduler Lab ------------------------------------------------------------------------------------ */
  function LabPage({ st }) {
    const sch = st.scheduler, g = st.results.greedy.fleet, m = st.results.mpc.fleet;
    const [run, setRun] = useState(null);
    const rows = [["Heat coverage", "coveragePct", 1, "%", false], ["Heat dumped", "dumpedKwh", 0, "kWh", true], ["Unmet demand", "unmetKwh", 0, "kWh", true], ["Missed deadlines", "missedDeadlinesPct", 1, "%", true], ["Break-even", "breakEvenChfPerServerHour", 2, "CHF / server-h", true], ["Migrations", "migrations", 0, "", null]];
    const areas = [...new Set(st.assumptions.map((a) => a.area))];
    const start = () => { setRun({ pct: 0 }); let p = 0; const t = setInterval(() => { p += 9; if (p >= 100) { clearInterval(t); setRun(null); DH.store.update((s) => s.simulations.unshift({ id: "run-000" + (s.simulations.length + 5), algorithm: sch.algorithm, datasetId: "demand - latest.xlsx", status: "done", startedAt: sch.currentTime, durationS: 96, coveragePct: s.results[sch.algorithm].fleet.coveragePct, dumpedKwh: s.results[sch.algorithm].fleet.dumpedKwh, missedDeadlinesPct: s.results[sch.algorithm].fleet.missedDeadlinesPct })); } else setRun({ pct: p }); }, 350); };
    return html`<div class="ops-lab"><${PageHead} title="Scheduler Lab" sub="Control the simulated clock, switch algorithms and compare offline runs. Nothing here touches a real installation."><span class="ops-simlabel"><${Icon} name="flask" size=${12} />Simulation</span><//>
      <div class="ops-grid ops-cols-2">
        <${Card} title="Simulated clock" sub="PUT /admin/scheduler · POST /admin/scheduler/jump"><${ClockControl} variant="full" />
          <dl class="ops-meta" style="margin-top:16px"><dt>Mode</dt><dd><span class=${cx("dh-chip dh-chip--sm", sch.mode === "live" ? "tone-ok" : sch.mode === "jumping" ? "tone-dump" : "tone-idle")}><${Icon} name=${sch.mode === "live" ? "play" : sch.mode === "jumping" ? "forward" : "pause"} size=${12} />${sch.mode}</span></dd>
            <dt>Slot</dt><dd class="num">${fmt.num(sch.slot)} of ${fmt.num(sch.slotsTotal)} · ${fmt.num(sch.progressPct, 1)} % of the year</dd>
            <dt>MQTT</dt><dd>${sch.mqtt}</dd><dt>Live servers</dt><dd class="num">${sch.liveServers.join(", ") || "none"}</dd></dl><//>
        <${Card} title="Algorithm" sub="Applies to the live run from the next slot" right=${html`<${Segmented} label="Scheduling algorithm" value=${sch.algorithm} onChange=${(v) => DH.api.putScheduler({ algorithm: v })} options=${[{ value: "greedy", label: "Greedy" }, { value: "mpc", label: "MPC" }]} />`}>
          <div class="ops-grid ops-cols-2" style="gap:10px">
            <div class="ops-servercard" style=${sch.algorithm === "greedy" ? "border-color:var(--tank)" : null}><span class="w-600">Greedy</span><span class="t-12 muted">Decides slot by slot. Fills tanks to a target level, pauses or moves flexible work when a tank is full.</span></div>
            <div class="ops-servercard" style=${sch.algorithm === "mpc" ? "border-color:var(--tank)" : null}><span class="w-600">MPC</span><span class="t-12 muted">Looks 24 hours ahead with a demand forecast and plans compute so tanks are neither full nor empty.</span></div></div>
          <div class="eyebrow" style="margin:18px 0 4px">Comparison, last offline runs <${Illustrative} text="illustrative" /></div>
          <div class="ops-compare"><span class="is-head">Metric, simulated year</span><span class="is-head num">Greedy</span><span class="is-head num">MPC</span><span class="is-head">Better</span>
            ${rows.map(([label, key, d, unit, lower]) => { const a = g[key], b = m[key], win = lower == null ? null : (lower ? a < b : a > b) ? "greedy" : a === b ? null : "mpc";
              return html`<span>${label}</span><span class=${cx("num", win === "greedy" && "is-win")}>${fmt.num(a, d)} ${unit}</span><span class=${cx("num", win === "mpc" && "is-win")}>${fmt.num(b, d)} ${unit}</span><span class="t-12">${win ? html`<span class="row tone-ok" style="gap:4px;color:var(--ok-ink)"><${Icon} name="check" size=${12} />${win === "mpc" ? "MPC" : "Greedy"}</span>` : html`<span class="faint">–</span>`}</span>`; })}</div><//>
        <${Card} title="Historical reports" sub="GET /admin/simulations" right=${html`<button type="button" class="dh-btn dh-btn--sm" disabled=${!!run} onClick=${start}><${Icon} name="play" size=${12} />${run ? "Running…" : `Run year with ${sch.algorithm.toUpperCase()}`}</button>`}>
          ${run && html`<div style="margin-bottom:12px"><div class="row-between t-12 muted" style="margin-bottom:6px"><span>Simulating 35,040 slots</span><span class="num">${run.pct} %</span></div><${ProgressBar} value=${run.pct} running tone="tank" /></div>`}
          <${DataTable} caption="Offline simulation runs" rows=${st.simulations} columns=${[{ key: "id", label: "Run", render: (r) => html`<span class="num">${r.id}</span>` }, { key: "algorithm", label: "Algorithm", render: (r) => r.algorithm.toUpperCase() }, { key: "startedAt", label: "Started", render: (r) => fmt.dayTime(r.startedAt) },
            { key: "coveragePct", label: "Coverage", num: true, render: (r) => `${fmt.num(r.coveragePct, 1)} %` }, { key: "dumpedKwh", label: "Dumped", num: true, render: (r) => `${fmt.num(r.dumpedKwh)} kWh` }, { key: "missedDeadlinesPct", label: "Missed", num: true, render: (r) => `${fmt.num(r.missedDeadlinesPct, 1)} %` }]} /><//>
        <${Card} title="Assumptions" sub="Every number the model rests on. Select one for value, source and status.">
          <div class="col" style="gap:14px">${areas.map((ar) => html`<div key=${ar}><div class="eyebrow" style="margin-bottom:8px">${ar}</div><div class="row wrap">${st.assumptions.filter((a) => a.area === ar).map((a) => html`<${AssumptionPill} key=${a.name} a=${a} />`)}</div></div>`)}</div>
          <${Legend} items=${[["BRIEF", "tank"], ["SOURCE", "ok"], ["ASSUMPTION", "dump"], ["MOCK", "critical"], ["LIMIT", "idle"]].map(([l, t]) => ({ label: l, tone: t }))} /><//>
        <div style="grid-column:1/-1"><${PayOffStatement} text=${st.results[sch.algorithm].fleet.payOffStatement} algorithm=${sch.algorithm} generatedAt=${st.results[sch.algorithm].generatedAt} /></div>
      </div></div>`;
  }

  /* ---------- Events --------------------------------------------------------------------------------------------- */
  function EventsPage({ st }) {
    const [kind, setKind] = useState(null);
    const kinds = ["started", "paused", "resumed", "migrated", "completed", "missed"];
    const list = st.stream.filter((e) => !kind || e.kind === kind).slice(0, 80);
    return html`<${PageHead} title="Events" sub="Task lifecycle across the fleet, newest first. Alerts live in the bell at the top right."><span class="t-12 faint num">${st.stream.length} events in this run</span><//>
      <div class="dh-card" style="padding:16px">
        <${FilterChips} groups=${[{ label: "Show", value: kind, onChange: setKind, options: kinds.map((k) => ({ value: k, label: vocab.event[k].label, icon: vocab.event[k].icon, count: st.stream.filter((e) => e.kind === k).length })) }]} />
        <div style="margin-top:18px;max-width:880px">${list.length === 0
          ? html`<${EmptyState} compact icon="activity" title="No events of this kind yet" body="Events appear here as the scheduler starts, pauses, moves and completes tasks." action=${html`<button type="button" class="dh-btn dh-btn--sm" onClick=${() => setKind(null)}>Show all events</button>`} />`
          : html`<ol class="dh-timeline" aria-live="polite">${list.map((e) => { const v = vocab.event[e.kind], t = sel.task(st, e.taskId), j = sel.job(st, e.jobId), c = j && sel.customer(st, j.customerId), site = sel.site(st, e.toSite || e.fromSite);
            return html`<li key=${e.id} class=${cx("dh-timeline__item", "tone-" + v.tone, e.isNew && "is-new")}>
              <span class="dh-timeline__dot"><${Icon} name=${v.icon} size=${11} /></span>
              <span><button type="button" class="w-600" style="text-decoration:underline;text-decoration-color:var(--line-2);text-underline-offset:3px" onClick=${() => DH.router.set({ task: e.taskId })}>${v.label} · <span class="num">${e.taskId}</span></button> <span class="muted">${e.taskName}${DH.eventDetail(e) ? ", " + DH.eventDetail(e) : ""}</span>
                <div class="t-12 faint">${[j && j.name, c && c.name.split(",")[0], site && site.name, e.kind === "migrated" && e.fromSite !== e.toSite && sel.site(st, e.fromSite) ? `from ${sel.site(st, e.fromSite).name}` : null].filter(Boolean).join(" · ")}</div></span>
              <time class="dh-timeline__time" datetime=${e.time}>${fmt.dayTime(e.time)}</time></li>`; })}</ol>`}</div></div>`;
  }

  /* ---------- Platform Economics ----------------------------------------------------------------------------------- */
  function EconomicsPage({ st }) {
    const k = st.kpis, pl = st.platform, f = st.results[st.scheduler.algorithm].fleet;
    const live = k.computeIncomeChf + k.heatValueChf, lc = (100 * k.computeIncomeChf) / live, lh = 100 - lc;
    const mix = pl.planMixPct;
    const Fig = ({ label, value, d = 0, unit, period = "today" }) => html`<div class="ops-count"><span>${label}</span><b><${Num} value=${value} d=${d} /><span class="unit" style="font-size:12px">${unit}</span></b><span class="faint">${period}</span></div>`;
    const Side = ({ n, title, role, who, icon, children, roadmap, share }) => html`<section class=${cx("dh-card", roadmap && "ops-roadmap")}>
      <div class="row-between" style="align-items:flex-start"><div class="row" style="gap:12px;align-items:flex-start"><span class="dh-alert__icon tone-idle" style="width:36px;height:36px;border-radius:10px"><${Icon} name=${icon} size=${18} /></span>
          <div><div class="eyebrow">Side ${n} · ${role}</div><h2 class="t-16 w-600" style="margin-top:2px">${title}</h2><div class="t-12 muted">${who}</div></div></div>
        ${roadmap ? html`<span class="ops-roadmaplabel">Roadmap, scenario</span>` : html`<span class="dh-chip dh-chip--sm tone-ok"><${Icon} name="activity" size=${12} />Live figures</span>`}</div>
      <div style="margin-top:16px">${children}</div>
      <div class="row-between t-12" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)"><span class="muted">Share of revenue, plan</span><span class="num w-600">about ${share} %</span></div></section>`;
    return html`<${PageHead} title="Platform Economics" sub="A four-sided platform. Two sides earn today and show live figures from the backend. Two sides are roadmap and show a scenario only."><${Illustrative} /><//>
      <div class="ops-flow" style="margin-bottom:16px" aria-label="How the platform works">${[["1", "MNC sends AI workloads", "Compute buyers pay for sovereign Swiss compute"], ["2", "DigitalHeat schedules compute", "Every 15 minutes, against heat demand and deadlines"], ["3", "Servers create heat", "Electricity leaves the rack as 55 to 65 °C water"], ["4", "Host business uses heat", "The tank covers hot water and process heat"]].map(([n, b, t]) => html`<div><span class="num faint t-12">${n}</span><b>${b}</b>${t}</div>`)}</div>
      <div class="ops-grid ops-cols-2">
        <${Side} n="1" role="money side" title="Compute buyers" who="Pharma, banks, universities, AI start-ups" icon="cpu" share=${mix.compute}>
          <div class="ops-grid ops-cols-3" style="gap:10px"><${Fig} label="Compute income" value=${k.computeIncomeChf} unit="CHF" /><${Fig} label="Average price" value=${k.avgComputePriceChfPerServerHour} d=${2} unit="CHF / server-h" /><${Fig} label="Break-even" value=${k.breakEvenChfPerServerHour} d=${2} unit="CHF / server-h" /></div><//>
        <${Side} n="2" role="thermal sink" title="Heat hosts" who="Hotels, pools, plants, laundries, apartment blocks, farms" icon="tank" share=${mix.heat}>
          <div class="ops-grid ops-cols-3" style="gap:10px"><${Fig} label="Heat value" value=${k.heatValueChf} unit="CHF" /><${Fig} label="Heat delivered" value=${k.deliveredKwh} unit="kWh" /><${Fig} label="Electricity cost" value=${k.electricityCostChf} unit="CHF" /></div><//>
        <${Side} n="3" role="flexibility buyer" title=${pl.sides.grid.title} who=${pl.sides.grid.who} icon="zap" roadmap share=${mix.grid}>
          <p class="t-13 muted">${pl.sides.grid.explanation}</p><div class="eyebrow" style="margin:12px 0 6px">Preconditions</div><ul class="t-13" style="margin:0;padding-left:18px;color:var(--text-2)">${pl.sides.grid.preconditions.map((p) => html`<li>${p}</li>`)}</ul><//>
        <${Side} n="4" role="ecosystem" title=${pl.sides.certificates.title} who="Certified installers, hardware partners, sustainability teams" icon="shield" roadmap share=${mix.certificates}>
          <p class="t-13 muted">${pl.sides.certificates.explanation}</p><div class="eyebrow" style="margin:12px 0 6px">Preconditions</div><ul class="t-13" style="margin:0;padding-left:18px;color:var(--text-2)">${pl.sides.certificates.preconditions.map((p) => html`<li>${p}</li>`)}</ul>
          <div class="row wrap" style="margin-top:12px">${pl.partners.map((p) => html`<span class="dh-illustrative" title=${p.role}>${p.name}</span>`)}</div><//>
        <${Card} title="Revenue mix" sub="Plan and live are different things: the plan is a target, live is what the backend measures today." style="grid-column:1/-1">
          <div class="ops-grid ops-cols-2" style="gap:24px">
            <div><div class="row-between t-12" style="margin-bottom:8px"><span class="w-600">Plan mix <span class="ops-roadmaplabel" style="margin-left:6px">plan</span></span><span class="faint">${pl.planSource}</span></div>
              <div class="ops-mix" role="img" aria-label=${`Plan mix: compute ${mix.compute} percent, heat ${mix.heat} percent, grid flexibility ${mix.grid} percent, certificates and licensing ${mix.certificates} percent`}>
                <span style=${`width:${mix.compute}%;background:var(--cat-1)`}>${mix.compute} %</span><span style=${`width:${mix.heat}%;background:var(--cat-2)`}>${mix.heat} %</span>
                <span style=${`width:${mix.grid}%;background:repeating-linear-gradient(135deg,var(--cat-3) 0 4px,transparent 4px 8px);color:var(--text);border:1px dashed var(--line-2)`}>${mix.grid} %</span><span style=${`width:${mix.certificates}%;background:repeating-linear-gradient(135deg,var(--cat-3) 0 4px,transparent 4px 8px);color:var(--text);border:1px dashed var(--line-2)`}>${mix.certificates} %</span></div></div>
            <div><div class="row-between t-12" style="margin-bottom:8px"><span class="w-600">Live mix, today <span class="dh-chip dh-chip--sm tone-ok" style="margin-left:6px">live</span></span><span class="faint">computeIncomeChf and heatValueChf, GET /admin/kpis</span></div>
              <div class="ops-mix" role="img" aria-label=${`Live mix today: compute ${fmt.num(lc)} percent, heat ${fmt.num(lh)} percent`}><span style=${`width:${lc}%;background:var(--cat-1);transition:width 500ms`}>${fmt.num(lc)} %</span><span style=${`width:${lh}%;background:var(--cat-2);transition:width 500ms`}>${fmt.num(lh)} %</span></div></div>
          </div>
          <div style="margin-top:14px"><${Legend} items=${[{ label: "Compute-as-a-service", color: "var(--cat-1)" }, { label: "Heat-as-a-service", color: "var(--cat-2)" }, { label: "Grid flexibility, certificates and licensing (roadmap, no income today)", color: "var(--cat-3)" }]} /></div><//>
        <div style="grid-column:1/-1"><${PayOffStatement} text=${f.payOffStatement} algorithm=${st.scheduler.algorithm} generatedAt=${st.results[st.scheduler.algorithm].generatedAt} /></div>
      </div>`;
  }

  /* ---------- Settings ------------------------------------------------------------------------------------------------- */
  function SettingsPage({ st }) {
    const p = st.pricing, [draft, setDraft] = useState(null), [saved, setSaved] = useState(false);
    const d = draft || { e: p.electricityChfPerKwh, cop: p.heatPumpCop, c: p.computeChfPerServerHour.critical, n: p.computeChfPerServerHour.normal, f: p.computeChfPerServerHour.flexible };
    const up = (k) => (e) => { setSaved(false); setDraft(Object.assign({}, d, { [k]: e.target.value })); };
    const bad = (v) => !(Number(v) > 0);
    const invalid = ["e", "cop", "c", "n", "f"].some((k) => bad(d[k]));
    const save = () => { DH.store.update((s) => { s.pricing.electricityChfPerKwh = +d.e; s.pricing.heatPumpCop = +d.cop; s.pricing.heatValueChfPerKwh = +(d.e / d.cop).toFixed(4); s.pricing.computeChfPerServerHour = { critical: +d.c, normal: +d.n, flexible: +d.f }; }); setDraft(null); setSaved(true); };
    const F = ({ k, label, unit, hint }) => html`<div class="dh-field"><label for=${"set-" + k}>${label}</label><div class="row"><input id=${"set-" + k} class="dh-input dh-input--num" inputmode="decimal" value=${d[k]} onInput=${up(k)} aria-invalid=${bad(d[k])} aria-describedby=${"set-" + k + "-h"} /><span class="t-12 faint" style="white-space:nowrap">${unit}</span></div>
      ${bad(d[k]) ? html`<span class="dh-field__error" id=${"set-" + k + "-h"}><${Icon} name="alert-octagon" size=${12} />Enter a number above 0</span>` : html`<span class="dh-field__hint" id=${"set-" + k + "-h"}>${hint}</span>`}</div>`;
    return html`<${PageHead} title="Settings" sub="Prices behind the money figures, connections and display options." />
      <div class="ops-grid ops-cols-2">
        <${Card} title="Pricing" sub="GET / PUT /admin/settings/pricing. Changes last until the backend restarts.">
          <div class="ops-grid ops-cols-2" style="gap:14px"><${F} k="e" label="Electricity price" unit="CHF / kWh" hint="ElCom 2026, IWB Basel, H4. To be confirmed." /><${F} k="cop" label="Heat pump efficiency (COP)" unit="" hint="Heat replaces a heat pump with this efficiency." />
            <${F} k="c" label="Compute price, critical" unit="CHF / server-h" hint="On-demand reference" /><${F} k="n" label="Compute price, normal" unit="CHF / server-h" hint="Midpoint" /><${F} k="f" label="Compute price, flexible" unit="CHF / server-h" hint="Spot reference" />
            <div class="ops-count"><span>Value of heat, derived</span><b class="num">${bad(d.e) || bad(d.cop) ? "–" : fmt.num(d.e / d.cop, 3)}<span class="unit" style="font-size:12px">CHF / kWh</span></b><span class="faint">electricity price ÷ COP</span></div></div>
          <div class="row" style="margin-top:16px"><button type="button" class="dh-btn dh-btn--primary" disabled=${!draft || invalid} onClick=${save}>Save prices</button><button type="button" class="dh-btn dh-btn--ghost" disabled=${!draft} onClick=${() => setDraft(null)}>Discard</button>${saved && html`<span class="t-12 row tone-ok" style="color:var(--ok-ink)" role="status"><${Icon} name="check" size=${14} />Saved. Money figures use the new prices from the next slot.</span>`}</div>
          <p class="t-12 faint" style="margin-top:12px">Source: ${p.source}</p><//>
        <div class="col" style="gap:16px">
          <${Card} title="Connections"><dl class="ops-meta"><dt>API</dt><dd class="num">/api/v1 · version ${st.meta.version}</dd><dt>WebSocket</dt><dd><span class="dh-chip dh-chip--sm tone-ok"><${Icon} name="check" size=${12} />subscribed: fleet</span></dd><dt>MQTT broker</dt><dd>${st.scheduler.mqtt}</dd><dt>Live servers</dt><dd class="num">${st.scheduler.liveServers.join(", ")}</dd><dt>Data period</dt><dd class="num">${fmt.date(st.meta.periodStart)} to ${fmt.date(st.meta.periodEnd)}</dd></dl><//>
          <${Card} title="Display"><div class="col" style="gap:12px">
            <label class="row-between t-13"><span>Reduce motion<div class="t-12 faint">Follows your system setting. Animations become instant changes with text equivalents.</div></span><input type="checkbox" style="width:20px;height:20px;accent-color:var(--tank)" checked=${DH.reducedMotion} onChange=${(e) => DH.setReducedMotion(e.target.checked)} /></label>
            <div class="row-between t-13"><span>Intro sequence<div class="t-12 faint">Map fades in, columns rise, first heat pulse fires. About 2 seconds.</div></span><a class="dh-btn dh-btn--sm" href="index.html?intro=1#/" onClick=${() => setTimeout(() => location.reload(), 30)}>Replay intro</a></div></div><//>
          <${Card} title="Roles" sub="Who sees what. One audience never sees another audience's data."><dl class="ops-meta"><dt>Operator</dt><dd>Operations Console, everything</dd><dt>Compute buyer</dt><dd>Own jobs, usage, aggregate heat impact</dd><dt>Host business</dt><dd>Own site: heat, tank, servers in plain words</dd></dl><//>
        </div></div>`;
  }

  /* ---------- App shell ----------------------------------------------------------------------------------------------------- */
  const EMPTY = {
    "/": ["map", "No sites in the fleet yet", "Add the first host business to see it on the map.", "Open Settings", "/settings"],
    "/sites": ["pin", "No sites yet", "Sites appear here once a host business is connected.", "Open the fleet map", "/"],
    "/servers": ["server", "No servers registered", "Servers appear when a rack is installed or a laptop agent connects.", "Open Scheduler Lab", "/lab"],
    "/tasks": ["tasks", "No tasks in this run", "Tasks appear when a compute buyer submits a job.", "Open Customers", "/customers"],
    "/customers": ["users", "No compute buyers yet", "Customers appear with their first submitted job.", "Open Jobs and Tasks", "/tasks"],
    "/lab": ["flask", "No simulation results yet", "Run a simulated year to compare Greedy and MPC.", "Open the fleet map", "/"],
    "/events": ["activity", "Nothing has happened yet", "Events appear as the scheduler starts, pauses, moves and completes tasks.", "Open the fleet map", "/"],
    "/economics": ["coins", "No economics yet", "Money figures need at least one finished slot with running compute.", "Open Scheduler Lab", "/lab"],
    "/settings": ["sliders", "Settings unavailable", "Prices could not be read from the backend.", "Open the fleet map", "/"],
  };
  function App() {
    const st = DH.useStore(), r = DH.useRoute(), q = r.q;
    const path = NAV.some((n) => n.path === r.path) ? r.path : "/";
    const [collapsed, setCollapsed] = useState(false), [view, setView] = useState(q.view || "demand"), [list, setList] = useState(q.list === "1"), [intro, setIntro] = useState(st.ui.intro), [role, setRole] = useState(false);
    const state = st.ui.dataState, isMap = path === "/";
    const drawer = q.task ? "task" : q.server ? "server" : q.site && isMap ? "site" : null;
    useEffect(() => { if (!intro) return; const t = setTimeout(() => setIntro(false), 3200); return () => clearTimeout(t); }, []);
    const viewAlert = (a) => (a.siteId ? DH.router.go("/", { site: a.siteId }) : DH.router.go("/tasks", { task: a.jobId + "-T1" }));
    const e = EMPTY[path];
    const page = { "/sites": SitesPage, "/servers": ServersPage, "/tasks": TasksPage, "/customers": CustomersPage, "/lab": LabPage, "/events": EventsPage, "/economics": EconomicsPage, "/settings": SettingsPage }[path];
    const unack = sel.unacked(st).length;
    return html`<div class=${cx("ops", collapsed && "is-collapsed", drawer && "has-drawer", intro && "is-intro")} data-theme="dark">
      ${isMap && state !== "empty" && state !== "error" && state !== "loading"
        ? html`<div class=${cx("ops__map", state === "reconnecting" && "is-stale")}><${FleetMap} view=${view} selected=${q.site || null} onSelect=${(id) => DH.router.set({ site: q.site === id ? null : id, tab: null, server: null, task: null })} intro=${st.ui.intro}
            inset=${{ l: collapsed ? 104 : 288, r: drawer ? 452 : 16, t: 200, b: 40 }} /></div>`
        : html`<div class="ops__bg"></div>`}

      <header class="ops-top dh-glass">
        <a href="#/" aria-label="DigitalHeat Operations Console, fleet map" style="text-decoration:none;color:inherit"><${Logo} tagline /></a>
        <span class="ops-top__tag eyebrow" style="padding-left:12px;border-left:1px solid var(--line)">Operations Console</span>
        <span class="ops-top__spacer"></span>
        <${ClockControl} />
        <span class="ops-top__spacer"></span>
        <span class=${cx("ops-status", state === "reconnecting" && "is-down")} title="WebSocket to the backend"><i></i>${state === "reconnecting" ? "Reconnecting" : "Connected"}</span>
        <span class="ops-readonly dh-illustrative">Read-only on tablet</span>
        <span class="ops-top__tag"><${Illustrative} /></span>
        <${AlertTray} onView=${viewAlert} />
        <${Pop} align="right" width=${250} label="Role menu" trigger=${({ props }) => html`<button type="button" class="ops-top__user" ...${props} aria-label="Account and role menu"><span class="dh-avatar" aria-hidden="true">OP</span><div class="col" style="gap:0;text-align:left"><span class="t-13 w-600">Operator</span><span class="t-12 faint">admin</span></div><${Icon} name="chevron-down" size=${14} class="faint" /></button>`}>
          <div class="eyebrow" style="margin-bottom:8px">Switch role</div><div class="col" style="gap:2px"><a class="dh-navitem" aria-current="page" href="#/"><${Icon} name="map" size=${16} /><span>Operator</span></a><a class="dh-navitem" href="../compute/index.html"><${Icon} name="cpu" size=${16} /><span>Compute buyer</span></a><a class="dh-navitem" href="../host/index.html"><${Icon} name="tank" size=${16} /><span>Host business</span></a><a class="dh-navitem" href="../system/index.html"><${Icon} name="grid" size=${16} /><span>Design system</span></a></div><//>
      </header>
      ${state === "reconnecting" && html`<div style="position:absolute;top:84px;left:16px;right:16px;z-index:45;border-radius:12px;overflow:hidden"><${ConnectionBanner} onRetry=${retry} /></div>`}

      <aside class="ops-rail" aria-label="Navigation and KPI overview">
        <nav class="ops-rail__nav dh-glass" aria-label="Main">${NAV.map((n) => html`<a key=${n.path} class="dh-navitem" href=${DH.router.href(n.path, state !== "live" ? { state } : null)} aria-current=${path === n.path ? "page" : null} title=${n.label}><${Icon} name=${n.icon} size=${17} /><span>${n.label}</span>${n.path === "/events" && unack ? html`<span class="dh-navitem__badge" style="display:none"></span>` : null}</a>`)}
          <div class="ops-rail__collapse"><button type="button" class="dh-navitem" style="width:100%" onClick=${() => setCollapsed(!collapsed)} aria-pressed=${collapsed} title=${collapsed ? "Expand navigation" : "Collapse navigation"}><${Icon} name="panel" size=${17} /><span>Collapse</span></button></div></nav>
        <${KpiOverview} st=${st} loading=${state === "loading"} />
      </aside>

      ${isMap ? html`
        ${state === "loading" && html`<${MapOverlays} st=${st} view=${view} setView=${setView} list=${list} setList=${setList} state=${state} /><div class="ops-page" style="top:250px;display:grid;place-items:center"><div class="dh-glass" style="padding:24px 28px;width:340px" aria-busy="true"><div class="row" style="gap:12px;margin-bottom:14px"><${Icon} name="refresh" size=${18} class="dh-spin" /><span class="w-600">Loading fleet state</span></div><div class="col" style="gap:10px"><${Skeleton} w="100%" /><${Skeleton} w="80%" /><${Skeleton} w="60%" /></div></div></div>`}
        ${state === "empty" && html`<div class="ops-page" style="display:grid;place-items:center"><div class="dh-glass" style="width:460px"><${EmptyState} icon=${e[0]} title=${e[1]} body=${e[2]} action=${html`<a class="dh-btn dh-btn--primary" href=${DH.router.href(e[4])}>${e[3]}</a>`} /></div></div>`}
        ${state === "error" && html`<div class="ops-page" style="display:grid;place-items:center"><div class="dh-glass" style="width:460px"><${ErrorState} title="The fleet could not be loaded" code="GET /admin/map/sites failed, 503" onRetry=${retry} /></div></div>`}
        ${(state === "live" || state === "reconnecting") && html`<${MapOverlays} st=${st} view=${view} setView=${setView} list=${list} setList=${setList} state=${state} />${list && html`<${SiteList} st=${st} />`}<${Story} />`}`
      : html`<main class="ops-page" id="main"><div class="dh-page" key=${path}>
          <${ViewState} state=${state} skeleton=${path === "/tasks" || path === "/customers" || path === "/events" ? tableSkeleton : html`<div class="ops-grid ops-cols-2"><${SkeletonBlock} card rows=${5} /><${SkeletonBlock} card rows=${5} /><${SkeletonBlock} card rows=${3} /><${SkeletonBlock} card rows=${3} /></div>`}
            empty=${html`<div class="dh-card"><${EmptyState} icon=${e[0]} title=${e[1]} body=${e[2]} action=${html`<a class="dh-btn dh-btn--primary" href=${DH.router.href(e[4])}>${e[3]}</a>`} /></div>`}>
            <${page} st=${st} q=${q} /><//></div></main>`}

      ${drawer === "site" && html`<${SiteDrawer} key=${"s" + q.site} st=${st} id=${q.site} tab=${q.tab} state=${state} />`}
      ${drawer === "server" && html`<${ServerDrawer} key=${"v" + q.server} st=${st} id=${q.server} backSite=${!!q.site && isMap} />`}
      ${drawer === "task" && html`<${TaskDrawer} key=${"t" + q.task} st=${st} id=${q.task} />`}
      ${intro && html`<button type="button" class="dh-btn ops-skip" onClick=${() => { setIntro(false); location.hash = DH.router.href("/", { intro: "0" }); location.reload(); }}>Skip intro<${Icon} name="forward" size=${14} /></button>`}
      <${AlertToasts} onView=${viewAlert} />
      <${ProtoBar} here="ops" />
    </div>`;
  }

  DH.boot({ intro: /[?&]intro=1/.test(location.search) || !sessionStorage.getItem("dh-intro") });
  try { sessionStorage.setItem("dh-intro", "1"); } catch (e) {}
  DH.mount(App);
})();
