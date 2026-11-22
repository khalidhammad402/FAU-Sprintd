/* ==========================================================================
   Operations Console: Site Drawer, Server Drawer, Task Drawer and the panels
   they share with the Site Details and Server Details pages.
   Drawer state lives in the URL: ?site=POOL1&tab=servers · ?server=POOL1-S2 · ?task=J202-T4
   ========================================================================== */
(function () {
  const DH = window.DH, P = window.htmPreact;
  const { html, useState } = P;
  const { fmt, cx, vocab, sel, Icon, Num, StatusChip, OriginBadge, RackBar, ProgressBar, CheckDraw, HeatPulse, TaskChain, TaskGraph, Timeline, Tabs, Segmented, Drawer, ConfirmDialog,
    AlertCard, EmptyState, DonutGauge, HeatFlowChart, StackedBars, Skeleton, ErrorState } = DH;

  const close = () => DH.router.set({ site: null, tab: null, server: null, task: null });
  const todayRows = (st, id) => (st.timeline[id] || []).filter((r) => r.time.slice(0, 10) === st.scheduler.currentTime.slice(0, 10));
  const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
  DH.opsHelpers = { close, todayRows, sum };

  function DrawerHead({ icon, tone, eyebrow, title, sub, chips, onBack, backLabel }) {
    return html`<div>
      <div class="row-between" style="align-items:flex-start">
        <div class="row" style="gap:12px;align-items:flex-start;min-width:0">
          <span class=${cx("dh-alert__icon", "tone-" + tone)} style="width:40px;height:40px;border-radius:12px;flex:none;animation:dh-pop-in 280ms var(--ease-out) 1"><${Icon} name=${icon} size=${20} /></span>
          <div style="min-width:0">${eyebrow && html`<div class="t-12 faint num">${eyebrow}</div>`}<h2 class="ops-drawer__title">${title}</h2>${sub && html`<div class="t-12 muted" style="margin-top:2px">${sub}</div>`}</div>
        </div>
        <div class="row" style="gap:2px">${onBack && html`<button type="button" class="dh-btn dh-btn--sm dh-btn--ghost" onClick=${onBack}><${Icon} name="chevron-left" size=${12} />${backLabel}</button>`}
          <button type="button" class="dh-iconbtn" data-autofocus onClick=${close} aria-label="Close drawer"><${Icon} name="x" size=${18} /></button></div>
      </div>
      <div class="row wrap" style="margin-top:12px;gap:8px">${chips}</div>
    </div>`;
  }
  const Count = ({ tone, icon, label, value, unit, d = 1, period }) => html`<div class=${cx("ops-count", "tone-" + tone)}><span><${Icon} name=${icon} size=${13} />${label}</span><b><${Num} value=${value} d=${d} /><span class="unit" style="font-size:12px">${unit}</span></b><span class="faint">${period}</span></div>`;

  /* ---------- shared site panels ------------------------------------------------------------- */
  function SiteFlow({ st, site, wide }) {
    const [range, setRange] = useState(wide ? 96 : 24);
    const rows = (st.timeline[site.id] || []).slice(-range), last = rows[rows.length - 1];
    return html`<section class="dh-section">
      <div class="dh-section__head"><div><div class="dh-section__title">Heat flow</div>
          ${last && site.status !== "offline" && html`<div class="t-12 faint">Last 15 minutes: demand <span class="num">${fmt.num(last.demandKwh, 1)} kWh</span>, server heat <span class="num">${fmt.num(last.producedKwh, 1)} kWh</span></div>`}
          ${site.status === "offline" && html`<div class="t-12 faint">No readings since ${fmt.time(site.lastSeen)}</div>`}</div>
        <${Segmented} label="Time range" value=${range} onChange=${setRange} options=${[{ value: 12, label: "3 h" }, { value: 24, label: "6 h" }, { value: 96, label: "24 h" }]} /></div>
      <${HeatFlowChart} rows=${rows} height=${wide ? 240 : 176} until=${st.scheduler.currentTime} />
    </section>`;
  }
  function SiteTank({ site }) {
    const pct = (100 * site.tankKwh) / site.tankCapacityKwh, off = site.status === "offline";
    return html`<section class="dh-section"><div class="dh-section__head"><div class="dh-section__title">Thermal tank</div><span class="t-12 faint">${off ? `last value, ${fmt.time(site.lastSeen)}` : "now"}</span></div>
      <div class=${cx("row", off && "is-stale")} style="gap:20px">
        <${DonutGauge} variant="tank" tone=${site.status === "unmet" ? "critical" : site.status === "dumping" ? "dump" : "tank"} value=${site.tankKwh} max=${site.tankCapacityKwh} size=${128} label=${`Tank ${fmt.pct(pct)} percent full`}
          center=${html`<div class="dh-donut__value t-28"><${Num} value=${pct} d=${0} /><span class="unit">%</span></div><div class="dh-donut__sub num"><${Num} value=${site.tankKwh} d=${1} /> / ${fmt.num(site.tankCapacityKwh, 0)} kWh</div>`} />
        <div class="col grow" style="gap:10px">
          <${HeatPulse} on=${site.loadKw > 0 && !off} load=${site.capacityKw ? site.loadKw / site.capacityKw : 0} />
          <div class="t-13"><span class="num w-600">${fmt.num(site.loadKw, 1)} kW</span> <span class="muted">of ${fmt.num(site.capacityKw, 0)} kW compute is heating the tank</span></div>
          <div class="t-12 faint">${(vocab.site[site.status] || {}).text}</div>
        </div></div></section>`;
  }
  function SiteRacks({ st, site }) {
    return html`<section class="dh-section"><div class="dh-section__head"><div class="dh-section__title">Server racks</div><span class="t-12 faint">load by task, kW</span></div>
      <div class="col" style="gap:2px">${sel.serversOf(st, site.id).map((s) => html`<${RackBar} key=${s.id} server=${s} showOrigin onClick=${() => DH.router.set({ server: s.id })} />`)}</div></section>`;
  }
  function SiteCounters({ st, site }) {
    const rows = todayRows(st, site.id);
    return html`<section class="dh-section"><div class="ops-grid ops-cols-2" style="gap:10px">
      <${Count} tone="dump" icon="wind" label="Heat dumped" value=${sum(rows, "dumpedKwh")} unit="kWh" period="today" />
      <${Count} tone="critical" icon="alert-octagon" label="Unmet, from backup" value=${sum(rows, "unmetKwh")} unit="kWh" period="today" /></div></section>`;
  }
  function SiteAlerts({ st, site, onView }) {
    const list = st.alerts.filter((a) => a.siteId === site.id).slice(0, 2);
    return html`<section class="dh-section"><div class="dh-section__head"><div class="dh-section__title">Recent alerts</div></div>
      ${list.length ? html`<div class="col">${list.map((a) => html`<${AlertCard} key=${a.id} alert=${a} now=${st.scheduler.currentTime} onAck=${(x) => DH.api.ackAlert(x.id)} />`)}</div>` : html`<p class="t-13 faint row"><${Icon} name="check-circle" size=${14} />No alerts for this site.</p>`}</section>`;
  }
  function ServerCard({ st, s, now }) {
    const off = s.status === "offline", state = off ? "offline" : s.tasks.length ? "working" : "idle";
    return html`<button type="button" class="ops-servercard" onClick=${() => DH.router.set({ server: s.id })} aria-label=${`Open server ${s.id}`}>
      <div class="row-between"><span class="num w-600 t-14">${s.id}</span><div class="row"><${StatusChip} kind="server" value=${state} size="sm" /><${OriginBadge} live=${s.live} beat=${s.lastHeartbeat} /></div></div>
      <${RackBar} server=${s} label=${`${fmt.num(s.capacityKw, 0)} kW rack`} />
      <div class="row-between t-12 muted"><span>${s.tasks.length} running${s.pausedTasks.length ? `, ${s.pausedTasks.length} paused` : ""}</span>
        <span class="row" style="gap:6px"><${Icon} name="activity" size=${12} />${s.live ? html`heartbeat <span class="num">${fmt.ago(s.lastHeartbeat, now)}</span>` : off ? html`last seen <span class="num">${fmt.time(s.lastHeartbeat)}</span>` : "no heartbeat, simulated"}</span></div>
    </button>`;
  }
  function TaskRow({ st, t }) {
    const j = sel.job(st, t.jobId), c = j && sel.customer(st, j.customerId);
    return html`<button type="button" class="ops-taskrow" style="width:100%;text-align:left" onClick=${() => DH.router.set({ task: t.id })}>
      <div class="row-between"><span><span class="num w-600">${t.id}</span> <span class="muted">${t.name}</span></span><${StatusChip} kind="task" value=${t.state} size="sm" /></div>
      <div class="t-12 faint">${j ? j.name : ""}${c ? ` · ${c.name}` : ""} · ${vocab.priority[t.priority].label} · ${t.serverId}</div>
      <${TaskChain} task=${t} compact />
      <div class="row"><div class="grow"><${ProgressBar} value=${t.progressPct} running=${t.state === "running"} tone=${t.state === "paused" ? "dump" : "heat"} /></div><span class="num t-12" style="min-width:38px;text-align:right">${Math.round(t.progressPct)} %</span></div>
    </button>`;
  }
  function SiteHistory({ st, site, wide }) {
    const days = st.daily[site.id] || [];
    const cov = days.map((d) => ({ label: fmt.day(d.time).split(" ")[1], tip: fmt.day(d.time), segments: [{ key: "c", label: "Heat coverage", value: d.coveragePct, tone: "ok" }] }));
    const dump = days.map((d) => ({ label: fmt.day(d.time).split(" ")[1], tip: fmt.day(d.time), segments: [{ key: "d", label: "Heat dumped", value: d.dumpedKwh, tone: "dump" }] }));
    const ev = st.stream.filter((e) => e.fromSite === site.id || e.toSite === site.id).slice(0, 12).map((e) => { const t = sel.task(st, e.taskId); return Object.assign({}, e, { title: `${vocab.event[e.kind].label} · ${e.taskId}`, detail: DH.eventDetail(e) || (t ? t.name : "") }); });
    return html`<div class=${wide ? "ops-grid ops-cols-2" : null}>
      <section class="dh-section" style=${wide ? "margin-top:0" : null}><div class="dh-section__head"><div class="dh-section__title">Heat coverage per day</div><span class="t-12 faint">last 14 days</span></div><${StackedBars} buckets=${cov} height=${140} unit="%" yMaxFixed=${100} d=${0} ariaLabel="Heat coverage per day in percent" /></section>
      <section class="dh-section" style=${wide ? "margin-top:0" : null}><div class="dh-section__head"><div class="dh-section__title">Heat dumped per day</div><span class="t-12 faint">last 14 days</span></div><${StackedBars} buckets=${dump} height=${140} unit="kWh" ariaLabel="Heat dumped per day in kilowatt hours" /></section>
      <section class="dh-section" style=${wide ? "grid-column:1/-1;margin-top:0" : null}><div class="dh-section__head"><div class="dh-section__title">Events at this site</div></div><${Timeline} items=${ev} empty="No task events at this site yet." /></section>
    </div>`;
  }
  const siteOrigin = (st, site) => { const sv = sel.serversOf(st, site.id), live = sv.filter((s) => s.live).length; return html`<${OriginBadge} live=${live > 0} beat=${(sv.find((s) => s.live) || {}).lastHeartbeat} />${live > 0 && live < sv.length ? html`<span class="t-12 faint">${live} of ${sv.length} servers live</span>` : null}`; };
  Object.assign(DH, { SiteFlow, SiteTank, SiteRacks, SiteCounters, SiteAlerts, SiteHistory, ServerCard, TaskRow, OpsCount: Count, siteOrigin });

  /* ---------- Site Drawer --------------------------------------------------------------------- */
  function SiteDrawer({ st, id, tab = "overview", state }) {
    const site = sel.site(st, id), now = DH.useNow(1000);
    if (!site) return html`<${Drawer} label="Site" onClose=${close} head=${html`<${DrawerHead} icon="pin" tone="idle" title="Site not found" />`}><${EmptyState} compact icon="search" title="This site does not exist" body="It may have been removed. Pick another site on the map." /><//>`;
    const v = vocab.site[site.status], tasks = sel.tasksAt(st, id), servers = sel.serversOf(st, id);
    const body = state === "loading" ? html`<div class="col" style="gap:16px"><${Skeleton} h=${176} variant="card" /><div class="row" style="gap:20px"><${Skeleton} w=${128} h=${128} variant="circle" /><div class="col grow"><${Skeleton} w="80%" /><${Skeleton} w="60%" /></div></div><${Skeleton} h=${90} variant="card" /></div>`
      : state === "error" ? html`<${ErrorState} compact title="Site data could not be loaded" code=${`GET /admin/sites/${id} failed, 503`} onRetry=${() => DH.router.set({ state: null })} />`
      : tab === "servers" ? html`<div class="col" style="gap:10px">${servers.map((s) => html`<${ServerCard} key=${s.id} st=${st} s=${s} now=${now} />`)}</div>`
      : tab === "jobs" ? (tasks.length ? html`<div class="col" style="gap:10px">${tasks.map((t) => html`<${TaskRow} key=${t.id} st=${st} t=${t} />`)}</div>` : html`<${EmptyState} compact icon="tasks" title="No tasks placed here" body=${site.status === "offline" ? "The site is offline. Its tasks were moved to other sites." : "The scheduler places work here when this site needs heat."} action=${html`<button type="button" class="dh-btn dh-btn--sm" onClick=${() => DH.router.go("/tasks", { fsite: id })}>Open Jobs and Tasks</button>`} />`)
      : tab === "history" ? html`<${SiteHistory} st=${st} site=${site} />`
      : html`<${SiteFlow} st=${st} site=${site} /><${SiteTank} site=${site} /><${SiteRacks} st=${st} site=${site} /><${SiteCounters} st=${st} site=${site} /><${SiteAlerts} st=${st} site=${site} />`;
    return html`<${Drawer} label=${`Site ${site.name}`} onClose=${close} head=${html`
      <${DrawerHead} icon=${vocab.hostType[site.type] || "factory"} tone=${v.tone} eyebrow=${`Host business · ${site.id}`} title=${site.name} sub=${site.hostType}
        chips=${html`<${StatusChip} kind="site" value=${site.status} />${siteOrigin(st, site)}`} />
      <div style="margin-top:14px"><${Tabs} label="Site sections" value=${tab} onChange=${(t) => DH.router.set({ tab: t === "overview" ? null : t })} tabs=${[{ value: "overview", label: "Overview" }, { value: "servers", label: "Servers", count: servers.length }, { value: "jobs", label: "Jobs", count: tasks.length }, { value: "history", label: "History" }]} /></div>`}>
      <div key=${tab} class=${cx("dh-page", state === "reconnecting" && "is-stale")}>${body}</div><//>`;
  }

  /* ---------- Server Drawer ------------------------------------------------------------------- */
  function ServerDrawer({ st, id, backSite }) {
    const s = sel.server(st, id), now = DH.useNow(1000);
    if (!s) return html`<${Drawer} label="Server" onClose=${close} head=${html`<${DrawerHead} icon="server" tone="idle" title="Server not found" />`}><${EmptyState} compact icon="search" title="This server does not exist" /><//>`;
    const site = sel.site(st, s.siteId), off = s.status === "offline", state = off ? "offline" : s.tasks.length ? "working" : "idle";
    const util = s.capacityKw ? (100 * s.loadKw) / s.capacityKw : 0;
    const full = (b) => sel.task(st, b.id);
    const ev = st.stream.filter((e) => e.fromServerId === id || e.toServerId === id).slice(0, 10).map((e) => Object.assign({}, e, { title: `${vocab.event[e.kind].label} · ${e.taskId}`, detail: DH.eventDetail(e) }));
    return html`<${Drawer} label=${`Server ${s.id}`} onClose=${close} head=${html`<${DrawerHead} icon="server" tone=${vocab.server[state].tone} eyebrow=${`Server · ${fmt.num(s.capacityKw, 0)} kW rack`} title=${s.id} sub=${site.name}
        onBack=${backSite ? () => DH.router.set({ server: null }) : null} backLabel="Site"
        chips=${html`<${StatusChip} kind="server" value=${state} /><${OriginBadge} live=${s.live} beat=${s.lastHeartbeat} />`} />`}>
      <section class="dh-section"><div class="dh-section__head"><div class="dh-section__title">Rack utilisation</div><span class="t-12 faint">now</span></div>
        <div class="row" style="align-items:baseline;gap:10px;margin-bottom:8px"><span class="t-28 w-300"><${Num} value=${util} d=${0} /><span class="unit">%</span></span><span class="t-13 muted num">${fmt.num(s.loadKw, 1)} of ${fmt.num(s.capacityKw, 0)} kW</span></div>
        <${RackBar} server=${s} lg label="Load by task" /><${HeatPulse} on=${s.loadKw > 0} load=${util / 100} label=${s.loadKw > 0 ? `${fmt.num(s.loadKw * 0.25 * 0.8, 2)} kWh of heat per 15 min into the tank` : "No heat: server idle"} /></section>
      <section class="dh-section"><div class="ops-grid ops-cols-2" style="gap:10px">
        ${s.live ? html`<${DH.OpsCount} tone="heat" icon="cpu" label="CPU" value=${s.cpuPct} d=${0} unit="%" period=${`measured on ${s.host}`} />
          <div class="ops-count tone-ok"><span><${Icon} name="activity" size=${13} />Heartbeat</span><b class="num" style="font-size:20px">${fmt.ago(s.lastHeartbeat, now)}</b><span class="faint">MQTT agent</span></div>`
        : html`<div class="ops-count tone-idle" style="grid-column:1/-1"><span><${Icon} name="info" size=${13} />${off ? "Server offline" : "Simulated server"}</span><span class="faint" style="white-space:normal">${off ? `No heartbeat since ${fmt.time(s.lastHeartbeat)}. Its tasks were moved to other servers.` : "CPU and heartbeat are reported only by LIVE servers, which run a real process on a laptop."}</span></div>`}</div></section>
      <section class="dh-section"><div class="dh-section__head"><div class="dh-section__title">Tasks on this server</div><span class="t-12 faint">${s.tasks.length} running${s.pausedTasks.length ? `, ${s.pausedTasks.length} paused` : ""}</span></div>
        ${s.tasks.length + s.pausedTasks.length === 0 ? html`<p class="t-13 faint">${off ? "Offline. Nothing can run here." : "Idle. The scheduler will place work here when the site needs heat."}</p>` : html`<div class="col" style="gap:10px">${s.tasks.concat(s.pausedTasks).map(full).filter(Boolean).map((t) => html`<button type="button" key=${t.id} class="ops-taskrow" style="width:100%;text-align:left;gap:8px" onClick=${() => DH.router.set({ task: t.id })}>
          <div class="row-between"><span><span class="num w-600">${t.id}</span> <span class="muted">${t.name}</span></span><span class="row">${t.state === "done" ? html`<${CheckDraw} />` : null}<${StatusChip} kind="task" value=${t.state} size="sm" /></span></div>
          <div class="row"><div class="grow"><${ProgressBar} value=${t.progressPct} running=${t.state === "running"} tone=${t.state === "paused" ? "dump" : "heat"} /></div><span class="num t-12" style="min-width:86px;text-align:right">${Math.round(t.progressPct)} % · ${fmt.num(t.powerKw, 1)} kW</span></div></button>`)}</div>`}</section>
      <section class="dh-section"><div class="dh-section__head"><div class="dh-section__title">Lifecycle on this server</div></div><${Timeline} items=${ev} empty="No task events on this server yet." /></section>
    <//>`;
  }

  /* ---------- Task Drawer ------------------------------------------------------------------------ */
  function TaskDrawer({ st, id }) {
    const t = sel.task(st, id);
    const [confirm, setConfirm] = useState(null);
    if (!t) return html`<${Drawer} label="Task" onClose=${close} head=${html`<${DrawerHead} icon="tasks" tone="idle" title="Task not found" />`}><${EmptyState} compact icon="search" title="This task is no longer in the list" body="Finished jobs are archived after a while." /><//>`;
    const j = sel.job(st, t.jobId), c = j && sel.customer(st, j.customerId), v = vocab.task[t.state], srv = t.serverId && sel.server(st, t.serverId), site = t.siteId && sel.site(st, t.siteId);
    const open = !["done", "missed", "cancelled"].includes(t.state);
    const slackTone = t.slackMin == null ? null : t.slackMin < 0 ? "critical" : t.slackMin < 60 ? "dump" : null;
    const acts = { pause: { title: `Pause ${t.id}?`, body: "The task stops producing heat and keeps its progress. It stays paused until an operator resumes it. Its deadline does not move.", label: "Pause task" },
      resume: { title: `Resume ${t.id}?`, body: "The scheduler may run this task again on the next slot.", label: "Resume task" },
      cancel: { title: `Cancel ${t.id}?`, body: "The task stops and cannot be resumed. Work done so far is billed. Tasks that depend on it will not start.", label: "Cancel task", danger: true } };
    return html`<${Drawer} label=${`Task ${t.id}`} onClose=${close} head=${html`<${DrawerHead} icon="tasks" tone=${v.tone} eyebrow=${`Task · ${t.id}`} title=${t.name} sub=${j ? `${j.name} · ${c ? c.name : ""}` : null}
        chips=${html`<${StatusChip} kind="task" value=${t.state} label=${t.hold && t.state === "paused" ? "Paused by operator" : null} /><span class="dh-chip tone-idle"><${Icon} name=${vocab.priority[t.priority].icon} size=${14} />${vocab.priority[t.priority].label}</span>${srv ? html`<${OriginBadge} live=${srv.live} beat=${srv.lastHeartbeat} />` : null}`} />`}>
      <section class="dh-section"><${TaskChain} task=${t} />
        ${t.state === "running" || t.state === "paused" ? html`<div class="row" style="margin-top:14px"><div class="grow"><${ProgressBar} lg value=${t.progressPct} running=${t.state === "running"} tone=${t.state === "paused" ? "dump" : "heat"} /></div><span class="num t-13 w-600">${fmt.num(t.progressPct, 0)} %</span></div>` : null}</section>
      <section class="dh-section"><dl class="ops-meta">
        <dt>Placed at</dt><dd>${site ? html`<button type="button" class="dh-btn dh-btn--sm dh-btn--ghost" style="margin:-6px -8px" onClick=${() => DH.router.go("/", { site: site.id })}>${site.name}<${Icon} name="chevron-right" size=${12} /></button>` : html`<span class="muted">Not placed</span>`}</dd>
        <dt>Server</dt><dd class="num">${t.serverId || "–"}</dd>
        <dt>Power, runtime</dt><dd class="num">${fmt.num(t.powerKw, 1)} kW · ${fmt.dur(t.runtimeMin)}</dd>
        <dt>Energy so far</dt><dd class="num">${fmt.num(t.energyKwh, 1)} kWh · ${fmt.num(t.heatDeliveredKwh, 1)} kWh heat</dd>
        <dt>Effective deadline</dt><dd class="num">${fmt.dayTime(t.deadline)}</dd>
        <dt>Estimated finish</dt><dd class="num">${t.estimatedFinish ? fmt.dayTime(t.estimatedFinish) : t.finished ? `finished ${fmt.time(t.finished)}` : "–"}</dd>
        <dt>Slack</dt><dd class=${cx("num", slackTone && "tone-" + slackTone)} style=${slackTone ? "color:var(--tone-ink);font-weight:600" : null}>${t.slackMin == null ? "–" : html`${slackTone ? html`<${Icon} name=${slackTone === "critical" ? "alert-octagon" : "alert-triangle"} size=${12} class="dh-inline" /> ` : null}${t.slackMin < 0 ? `late by ${fmt.dur(-t.slackMin)}` : fmt.dur(t.slackMin)}`}</dd>
        <dt>Interruptible</dt><dd>${t.interruptible ? "Yes, can pause or move" : "No, runs to the end"}</dd></dl></section>
      ${j && j.taskIds.length > 1 ? html`<section class="dh-section"><div class="dh-section__head"><div class="dh-section__title">Dependencies in ${j.id}</div><span class="t-12 faint">${j.taskIds.length} tasks</span></div><${TaskGraph} tasks=${sel.tasksOfJob(st, j.id)} selected=${t.id} onSelect=${(x) => DH.router.set({ task: x.id })} /></section>` : null}
      <section class="dh-section"><div class="dh-section__head"><div class="dh-section__title">Lifecycle</div></div><${Timeline} items=${t.events.slice().reverse().map((e) => Object.assign({}, e, { detail: DH.eventDetail(e) }))} empty="Waiting for its dependencies. Nothing has happened yet." /></section>
      ${open && html`<section class="dh-section"><div class="row wrap">
        ${t.state === "paused" || t.hold ? html`<button type="button" class="dh-btn" onClick=${() => setConfirm("resume")}><${Icon} name="play" size=${12} />Resume</button>` : html`<button type="button" class="dh-btn" disabled=${!t.interruptible} title=${t.interruptible ? null : "This task is not interruptible"} onClick=${() => setConfirm("pause")}><${Icon} name="pause" size=${12} />Pause</button>`}
        <button type="button" class="dh-btn dh-btn--danger" onClick=${() => setConfirm("cancel")}><${Icon} name="x" size=${14} />Cancel task</button></div>
        ${!t.interruptible && html`<p class="t-12 faint" style="margin-top:8px">Critical, non-interruptible work cannot be paused. It can only be cancelled.</p>`}</section>`}
      ${confirm && html`<${ConfirmDialog} title=${acts[confirm].title} body=${acts[confirm].body} confirmLabel=${acts[confirm].label} danger=${acts[confirm].danger} onCancel=${() => setConfirm(null)} onConfirm=${() => { DH.api.taskAction(t.id, confirm); setConfirm(null); }} />`}
    <//>`;
  }

  Object.assign(DH, { SiteDrawer, ServerDrawer, TaskDrawer });
})();
