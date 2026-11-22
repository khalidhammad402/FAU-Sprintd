/* ==========================================================================
   DigitalHeat Compute Portal (/compute): light, precise B2B console.
   Role: customer. Demo login: st.compute.user (Rheinpharm AG).
   Routes: /  /submit  /jobs?job=ID  /usage  /impact  /keys  /support
   Privacy rule: a compute buyer never sees host operations. No site names,
   no server ids, no tank levels. Aggregate impact only.
   Backend: /customer/* endpoints (docs/BACKEND_HANDOFF.md). GAPs are marked.
   ========================================================================== */
(function () {
  const DH = window.DH, P = window.htmPreact;
  const { html, useState, useRef } = P;
  const { Icon, Num, StatusChip, KpiTile, ProgressBar, CheckDraw, HeatPulse, TaskGraph, Timeline, DataTable, FilterChips, Segmented, Pop, InfoPop,
    ConfirmDialog, EmptyState, Skeleton, ViewState, AssumptionPill, StackedBars, PortalShell, fmt, vocab, cx } = DH;

  const TIERS = ["critical", "normal", "flexible"]; // backend priority -> buyer tier Priority / Standard / Flexible
  const CAT = { critical: "var(--cat-1)", normal: "var(--cat-2)", flexible: "var(--cat-3)" }; // neutral ramp, never a data colour
  const TYPICAL_WAIT_MIN = { critical: 0, normal: 30, flexible: 120 }; // GAP: design assumption, no estimate endpoint exists
  const MAX_TASK_KW = 10; // GAP: largest single server; not exposed to customers today
  const go = (path, q) => DH.router.go(path, q);
  const isOpen = (j) => j.status === "running" || j.status === "queued";
  const axisMax = (v) => { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), n = (v * 1.08) / p; return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => x >= n) || 10) * p; };

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/csv;charset=utf-8" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  /* ---------- small shared pieces ------------------------------------------------ */
  function TierChip({ priority, tiers }) {
    const v = vocab.priority[priority] || vocab.priority.normal;
    return html`<span class="dh-chip dh-chip--sm tone-idle" title=${tiers ? tiers[priority].blurb : null}><${Icon} name=${v.icon} size=${12} />${v.buyer}</span>`;
  }
  // deadline risk of one job: amber = caution, red only when the deadline was missed
  function riskOf(j) {
    if (j.status === "missed") return { tone: "critical", icon: "alert-octagon", label: "Missed deadline" };
    if (j.status === "done") return { tone: "ok", icon: "check", label: "Finished" };
    if (j.status === "cancelled") return { tone: "idle", icon: "x", label: "Cancelled" };
    if (j.slackMin == null) return { tone: "idle", icon: "clock", label: "No estimate yet" };
    if (j.slackMin < 0) return { tone: "dump", icon: "alert-triangle", label: `At risk, about ${fmt.dur(-j.slackMin)} late` };
    if (j.atRisk) return { tone: "dump", icon: "alert-triangle", label: `At risk, ${fmt.dur(j.slackMin)} spare` };
    return { tone: "ok", icon: "check-circle", label: `On track, ${fmt.dur(j.slackMin)} spare` };
  }
  function Risk({ job }) { const r = riskOf(job); return html`<span class=${cx("cp-inline", "tone-" + r.tone)}><${Icon} name=${r.icon} size=${14} />${r.label}</span>`; }
  function Field({ id, label, hint, error, children, style }) {
    return html`<div class="dh-field" style=${style}><label for=${id}>${label}</label>${children}
      ${error ? html`<span class="dh-field__error" id=${id + "-err"}><${Icon} name="alert-octagon" size=${12} />${error}</span>` : hint ? html`<span class="dh-field__hint">${hint}</span>` : null}</div>`;
  }
  function SubmitButton({ label = "Submit a job" }) { return html`<button type="button" class="dh-btn dh-btn--primary" onClick=${() => go("/submit")}><${Icon} name="plus" size=${14} />${label}</button>`; }
  function TrustLine() {
    return html`<div class="cp-trust"><${Icon} name="shield" size=${16} /><span>Swiss-hosted, data stays in Switzerland</span>
      <${Pop} width=${340} label="How your data is protected" trigger=${({ props }) => html`<button type="button" class="cp-linkbtn" ...${props}>How your data is protected</button>`}>
        <div class="w-600" style="margin-bottom:12px">How your data is protected</div>
        <ul class="cp-security">
          <li><${Icon} name="lock" size=${16} /><div><b>Sealed rack</b><span>Servers sit in sealed, liquid-cooled racks. The host business has no physical or network access to them.</span></div></li>
          <li><${Icon} name="shield" size=${16} /><div><b>Confidential computing</b><span>Workloads run in hardware-isolated environments. Data stays encrypted while it is processed.</span></div></li>
          <li><${Icon} name="refresh" size=${16} /><div><b>Ephemeral execution</b><span>Nothing stays on a server after a task ends. Scratch storage is wiped before the next task.</span></div></li>
        </ul><//></div>`;
  }
  // buyer-safe wording of task lifecycle events: never a site name or server id
  const BUYER_EVENT = {
    ready: ["Ready to run", "waiting for a server"], started: ["Started", "on a Swiss-hosted server"],
    paused: ["Paused", "while a host's tank was full"], resumed: ["Resumed", ""],
    migrated: ["Moved to another site", "where heat was needed"], server_lost: ["Queued again", "its server went offline"],
    completed: ["Completed", ""], missed: ["Missed deadline", ""], cancelled: ["Cancelled", ""],
  };
  function activityOf(tasks, now) {
    const items = []; let n = 0;
    tasks.forEach((t) => t.events.forEach((e) => {
      if (e.kind === "ready" && t.state !== "ready") return;
      const [title, phrase] = BUYER_EVENT[e.kind] || [e.kind, ""];
      const sameDay = fmt.day(e.time) === fmt.day(now);
      items.push({ id: t.id + "-" + n, seq: n++, time: e.time, kind: e.kind, title, detail: `· ${t.name}${phrase ? ", " + phrase : ""}`, timeLabel: sameDay ? fmt.time(e.time) : fmt.dayTime(e.time) });
    }));
    return items.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : b.seq - a.seq));
  }

  /* ---------- Overview ------------------------------------------------------------- */
  function JobCard({ job, tiers, now }) {
    const done = job.status === "done", active = job.status === "running" && job.tasksRunning > 0;
    const waitingOnHeat = job.status === "running" && !job.tasksRunning && job.tasksPaused > 0;
    return html`<a class="cp-job" href=${DH.router.href("/jobs", { job: job.id })} onClick=${(e) => { e.preventDefault(); go("/jobs", { job: job.id }); }} aria-label=${`${job.name}, ${job.id}, ${(vocab.job[job.status] || {}).label}, ${Math.round(job.progressPct)} percent. Open details.`}>
      <div class="row-between" style="align-items:flex-start">
        <div class="col" style="gap:2px;min-width:0"><span class="cp-job__name truncate">${job.name}</span><span class="t-12 faint num">${job.id} · submitted ${fmt.time(job.submittedAt)}</span></div>
        <div class="row wrap" style="justify-content:flex-end"><${TierChip} priority=${job.priority} tiers=${tiers} /><${StatusChip} kind="job" value=${job.status} size="sm" /></div>
      </div>
      <div class="cp-job__bar"><${ProgressBar} value=${job.progressPct} lg tone=${done ? "ok" : job.status === "missed" ? "critical" : "heat"} running=${active} label=${`Progress of ${job.name}`} />
        <span class="cp-job__pct">${done ? html`<${CheckDraw} size=${20} />` : null}<${Num} value=${job.progressPct} d=${0} /><span class="unit">%</span></span></div>
      ${waitingOnHeat && html`<p class="t-12 cp-inline tone-dump" style="margin-top:8px"><${Icon} name="pause" size=${12} />Paused while a host's tank is full. It resumes on its own.</p>`}
      <dl class="cp-facts">
        <div><dt>Deadline</dt><dd>${fmt.dayTime(job.deadline)}<span class="faint"> · ${fmt.rel(job.deadline, now)}</span></dd></div>
        <div><dt>Estimated finish</dt><dd>${job.estimatedFinish ? fmt.dayTime(job.estimatedFinish) : done ? "Finished" : "–"}</dd></div>
        <div><dt>Deadline risk</dt><dd><${Risk} job=${job} /></dd></div>
      </dl></a>`;
  }
  function OverviewSkeleton() {
    return html`<div class="cp-stack" aria-busy="true"><span class="sr-only">Loading overview</span>
      <div class="col" style="gap:10px"><${Skeleton} w=${320} h=${30} /><${Skeleton} w=${420} /></div>
      <div class="cp-kpis">${[0, 1, 2, 3, 4].map((i) => html`<div class="dh-kpi dh-kpi--card" key=${i}><${Skeleton} w=${90} /><${Skeleton} variant="num" style="margin:6px 0" /><${Skeleton} w=${70} /></div>`)}</div>
      <div class="cp-two"><div class="col" style="gap:16px">${[0, 1, 2].map((i) => html`<div class="dh-card" key=${i}><${Skeleton} variant="title" /><${Skeleton} h=${10} style="margin:16px 0" /><${Skeleton} w="70%" /></div>`)}</div>
        <div class="dh-card"><${Skeleton} variant="title" /><${Skeleton} w=${150} h=${44} style="margin:16px 0" /><${Skeleton} w="85%" /><${Skeleton} w="60%" style="margin-top:8px" /></div></div></div>`;
  }
  function Overview({ st, jobs, ov }) {
    const user = st.compute.user, now = st.scheduler.currentTime, tiers = st.compute.tiers, imp = st.compute.impact;
    const h = fmt.hour(now), hello = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    const open = jobs.filter(isOpen), atRisk = open.filter((j) => j.atRisk), missed = jobs.filter((j) => j.status === "missed");
    const risk = missed.length ? { tone: "critical", icon: "alert-octagon", label: `${missed.length} missed` } : atRisk.length ? { tone: "dump", icon: "alert-triangle", label: `${atRisk.length} at risk` } : { tone: "ok", icon: "check-circle", label: "On track" };
    const month = fmt.month(now);
    const shown = jobs.slice(0, 5);
    const empty = html`<div class="dh-card"><${EmptyState} icon="tasks" title=${`Welcome, ${user.name}`} body="You have no jobs yet. Submit your first job and follow it here: progress, deadline and cost, live." action=${html`<${SubmitButton} label="Submit your first job" />`} /></div>`;
    return html`<${ViewState} state=${st.ui.dataState} skeleton=${html`<${OverviewSkeleton} />`} empty=${empty}>
      <div class="cp-stack">
        <div class="cp-hero"><div><h2>${hello}, ${user.name}</h2>
          <p>${open.length ? `${open.length} job${open.length > 1 ? "s" : ""} in progress on Swiss-hosted servers. ` : "No jobs in progress. "}${missed.length ? "One or more deadlines were missed." : atRisk.length ? `${atRisk.length} job${atRisk.length > 1 ? "s need" : " needs"} attention.` : open.length ? "All on track for their deadlines." : ""}</p></div>
          <${TrustLine} /></div>
        <div class="cp-kpis">
          <${KpiTile} card label="Running jobs" value=${ov.jobsRunning} d=${0} unit="jobs" period="right now" tone="heat" icon="play" />
          <${KpiTile} card label="Queued" value=${ov.jobsQueued} d=${0} unit="jobs" period="waiting to start" icon="clock" />
          <${KpiTile} card label="Done this month" value=${ov.jobsDone} d=${0} unit="jobs" period=${month} tone="ok" icon="check-circle" />
          <${KpiTile} card label="Spend this month" value=${ov.spendMonthChf} d=${2} unit="CHF" period=${`${month}, so far`} icon="coins" />
          <div class=${cx("dh-kpi dh-kpi--card", "tone-" + risk.tone)}><div class="dh-kpi__label"><${Icon} name="target" size=${14} />Deadline risk</div>
            <div class="cp-risk"><${Icon} name=${risk.icon} size=${20} />${risk.label}</div>
            <div class="dh-kpi__foot"><span>${atRisk.length} of ${open.length} open jobs at risk</span></div></div>
        </div>
        <div class="cp-banner" role="note"><span class="cp-banner__icon"><${Icon} name="flame" size=${20} /></span>
          <div class="grow"><div class="w-600">Your compute does two jobs at once.</div><p>The electricity your workloads use comes back as hot water for ${imp.sitesHeated} host businesses in the Basel region. Flexible jobs run where heat is needed, which is why they cost least.</p></div>
          <button type="button" class="dh-btn" onClick=${() => go("/impact")}>See your impact<${Icon} name="arrow-right" size=${14} /></button></div>
        <div class="cp-two">
          <section class="col" style="gap:12px" aria-label="Your jobs">
            <div class="row-between"><h3 class="t-16 w-600">Your jobs</h3><button type="button" class="cp-linkbtn" onClick=${() => go("/jobs")}>All jobs<${Icon} name="chevron-right" size=${12} /></button></div>
            ${shown.length === 0 ? html`<div class="dh-card"><${EmptyState} compact icon="tasks" title="No jobs in progress" body="Finished jobs are under My Jobs." action=${html`<${SubmitButton} />`} /></div>` : shown.map((j) => html`<${JobCard} key=${j.id} job=${j} tiers=${tiers} now=${now} />`)}
          </section>
          <div class="col" style="gap:16px">
            <section class="dh-card" aria-label="Heat enabled">
              <div class="row-between"><div class="dh-card__title row"><span class="cp-inline tone-heat"><${Icon} name="flame" size=${16} /></span>Heat enabled</div>
                <${InfoPop} align="right" label="How heat enabled is calculated"><p class="w-600" style="margin-bottom:6px">How this is calculated</p><p class="muted">The electricity each of your tasks uses becomes heat. The share recovered into hot water and used by host businesses is added up for your workloads. Fleet reuse share this period: <span class="num">${fmt.num(imp.heatReusedSharePct, 1)} %</span>.</p><p class="muted" style="margin-top:8px">It is not a CO2 figure and not a cost saving.</p><//></div>
              <div class="cp-heat__value" style="margin-top:12px"><${Num} value=${ov.heatDeliveredKwh} d=${0} /><span class="unit">kWh</span></div>
              <p class="t-13 muted" style="margin-top:6px">${month}, so far. This is the share of reused fleet heat associated with your workloads.</p>
              <div style="margin-top:14px"><${HeatPulse} on=${ov.jobsRunning > 0} load=${Math.min(1, ov.jobsRunning / 4)} label=${ov.jobsRunning > 0 ? "heat flows while your jobs run" : "no job running"} /></div>
              <hr class="dh-divider" />
              <dl class="cp-facts" style="grid-template-columns:1fr 1fr"><div><dt>Host businesses heated</dt><dd class="num">${imp.sitesHeated} sites</dd></div><div><dt>Fleet reuse share</dt><dd class="num">${fmt.num(imp.heatReusedSharePct, 1)} %</dd></div></dl>
            </section>
            <section class="dh-card" aria-label="Recently finished">
              <div class="dh-card__title">Recently finished</div>
              <ul class="cp-list" style="margin-top:6px">${st.compute.jobHistory.slice(0, 4).map((j) => html`<li key=${j.id}>
                <span class=${cx("cp-inline", j.status === "missed" ? "tone-critical" : "tone-ok")}><${Icon} name=${j.status === "missed" ? "alert-octagon" : "check"} size=${14} /></span>
                <div class="grow col" style="gap:0"><span class="w-500 truncate">${j.name}</span><span class="t-12 faint">${j.status === "missed" ? `Missed deadline ${fmt.dayTime(j.deadline)}` : `Finished ${fmt.dayTime(j.finished)}`}</span></div>
                <span class="num t-13">${fmt.chf(j.costChf, 2)} CHF</span></li>`)}</ul>
            </section>
          </div>
        </div>
      </div><//>`;
  }

  /* ---------- Submit Job ---------------------------------------------------------------- */
  const TEMPLATES = {
    single: { label: "Single task", name: "", priority: "normal", tasks: [["", 60, 4, []]] },
    embed: { label: "Embed archive: 2 batches, then merge", name: "Embed document archive", priority: "flexible", tasks: [["embed batch 1", 90, 4, []], ["embed batch 2", 90, 4, []], ["merge index", 30, 3, [0, 1]]] },
    finetune: { label: "Fine-tune: 4 workers, then evaluate", name: "Fine-tune language model", priority: "flexible", tasks: [["fine-tune worker 1", 480, 4, []], ["fine-tune worker 2", 480, 4, []], ["fine-tune worker 3", 480, 4, []], ["fine-tune worker 4", 480, 4, []], ["evaluate", 30, 4, [0, 1, 2, 3]]] },
  };
  const keyOf = (i) => (i < 26 ? String.fromCharCode(65 + i) : "T" + (i + 1));
  function fromTemplate(t) {
    return { name: t.name, priority: t.priority, n: t.tasks.length, tasks: t.tasks.map(([name, runtimeMin, powerKw, deps], i) => ({ key: keyOf(i), name, runtimeMin: String(runtimeMin), powerKw: String(powerKw), dependsOn: deps.map(keyOf), interruptible: true })) };
  }
  function fromJob(st, jobId) {
    const j = DH.sel.job(st, jobId), ts = j ? DH.sel.tasksOfJob(st, jobId) : [];
    if (!j || !ts.length) return null;
    const map = Object.fromEntries(ts.map((t, i) => [t.id, keyOf(i)]));
    return { name: j.name, priority: j.priority, n: ts.length, tasks: ts.map((t) => ({ key: map[t.id], name: t.name, runtimeMin: String(t.runtimeMin), powerKw: String(t.powerKw), dependsOn: t.dependsOn.map((d) => map[d]).filter(Boolean), interruptible: t.interruptible })) };
  }
  function SubmitSkeleton() {
    return html`<div class="cp-submit" aria-busy="true"><span class="sr-only">Loading form</span>
      <div class="col" style="gap:16px">${[3, 2, 4].map((n, i) => html`<div class="dh-card" key=${i}><${Skeleton} variant="title" /><div class="col" style="gap:12px;margin-top:16px">${Array.from({ length: n }, (_, k) => html`<${Skeleton} key=${k} h=${38} />`)}</div></div>`)}</div>
      <div class="dh-card"><${Skeleton} variant="title" /><${Skeleton} variant="num" style="margin:16px 0" /><${Skeleton} w="80%" /><${Skeleton} h=${44} style="margin-top:20px" /></div></div>`;
  }
  function SubmitJob({ st, q }) {
    const emptyState = st.ui.dataState === "empty";
    const now = st.scheduler.currentTime, nowMs = new Date(now).getTime(), tiers = st.compute.tiers, prices = st.pricing.computeChfPerServerHour;
    const toLocal = (ms) => fmt.iso(ms).slice(0, 16);
    const toMs = (s) => { if (!s) return NaN; let ms = new Date(s + ":00" + fmt.iso(nowMs).slice(19)).getTime(); if (!isFinite(ms)) return NaN; return new Date(s + ":00" + fmt.iso(ms).slice(19)).getTime(); };
    const [form, setForm] = useState(() => (emptyState ? { name: "", priority: "normal", n: 0, tasks: [] } : (q.from && fromJob(st, q.from)) || fromTemplate(TEMPLATES[q.template] || TEMPLATES.single)));
    const [deadline, setDeadline] = useState(() => toLocal(nowMs + 24 * 3600000));
    const [tried, setTried] = useState(false);
    const formRef = useRef(null);
    const { name, priority, tasks } = form;
    const patch = (p) => setForm((f) => Object.assign({}, f, p));
    const patchTask = (key, p) => setForm((f) => Object.assign({}, f, { tasks: f.tasks.map((t) => (t.key === key ? Object.assign({}, t, p) : t)) }));
    const addTask = () => setForm((f) => Object.assign({}, f, { n: f.n + 1, tasks: [...f.tasks, { key: keyOf(f.n), name: "", runtimeMin: "60", powerKw: "4", dependsOn: [], interruptible: true }] }));
    const removeTask = (key) => setForm((f) => Object.assign({}, f, { tasks: f.tasks.filter((t) => t.key !== key).map((t) => Object.assign({}, t, { dependsOn: t.dependsOn.filter((d) => d !== key) })) }));
    const toggleDep = (key, dep) => { const t = tasks.find((x) => x.key === key); patchTask(key, { dependsOn: t.dependsOn.includes(dep) ? t.dependsOn.filter((d) => d !== dep) : [...t.dependsOn, dep] }); };

    // live estimate
    const rt = (t) => Number(t.runtimeMin), pw = (t) => Number(t.powerKw);
    const serverHours = tasks.reduce((a, t) => a + (rt(t) > 0 && pw(t) > 0 ? (rt(t) / 60) * pw(t) : 0), 0);
    const costOf = (p) => serverHours * prices[p];
    const fin = {}; const finish = (t) => (fin[t.key] != null ? fin[t.key] : (fin[t.key] = Math.max(0, ...t.dependsOn.map((d) => { const x = tasks.find((y) => y.key === d); return x ? finish(x) : 0; })) + (rt(t) > 0 ? rt(t) : 0)));
    const chainMin = tasks.length ? Math.max(...tasks.map(finish)) : 0;
    const slotUp = (ms) => Math.ceil(ms / 900000) * 900000;
    const minFinishMs = slotUp(nowMs + chainMin * 60000), estMs = slotUp(nowMs + (TYPICAL_WAIT_MIN[priority] + chainMin) * 60000);
    const deadlineMs = toMs(deadline);

    const errs = {};
    if (!name.trim()) errs.name = "Give the job a name so you can find it later.";
    if (!tasks.length) errs.tasks = "Add at least one task.";
    tasks.forEach((t) => {
      if (!(rt(t) > 0)) errs["rt" + t.key] = "More than 0 min.";
      if (!(pw(t) > 0)) errs["pw" + t.key] = "More than 0 kW."; else if (pw(t) > MAX_TASK_KW) errs["pw" + t.key] = `Max ${MAX_TASK_KW} kW per task.`;
    });
    if (!isFinite(deadlineMs)) errs.deadline = "Choose a deadline.";
    else if (tasks.length && deadlineMs < minFinishMs) errs.deadline = `Too early. These tasks need at least ${fmt.dur(chainMin)}. Earliest possible finish: ${fmt.dayTime(fmt.iso(minFinishMs))}.`;
    const show = (k) => (tried ? errs[k] : null);
    const nErr = Object.keys(errs).length;
    const tight = !errs.deadline && tasks.length && deadlineMs < estMs;
    const spareMin = isFinite(deadlineMs) ? Math.round((deadlineMs - estMs) / 60000) : 0;

    const submit = (e) => {
      e.preventDefault();
      if (nErr) { setTried(true); requestAnimationFrame(() => { const el = formRef.current && formRef.current.querySelector('[aria-invalid="true"]'); if (el) el.focus(); }); return; }
      const job = DH.api.submitJob({ customerId: st.compute.user.id, name: name.trim(), priority, deadline: fmt.iso(deadlineMs),
        tasks: tasks.map((t) => ({ taskId: t.key, name: t.name.trim() || `task ${t.key}`, runtimeMin: rt(t), powerKw: pw(t), interruptible: t.interruptible, dependsOn: t.dependsOn })) });
      go("/jobs", { job: job.id, submitted: 1 });
    };
    const preview = tasks.map((t) => ({ id: t.key, name: `${t.key} · ${t.name || "unnamed"}`, dependsOn: t.dependsOn, state: "waiting", progressPct: 0 }));

    return html`<${ViewState} state=${emptyState ? "live" : st.ui.dataState} skeleton=${html`<${SubmitSkeleton} />`}>
      <form class="cp-submit" ref=${formRef} onSubmit=${submit} novalidate>
        <div class="col" style="gap:16px">
          <section class="dh-card" aria-labelledby="cp-s1">
            <div class="cp-step"><span class="cp-step__n">1</span><h2 class="dh-card__title" id="cp-s1">Job</h2></div>
            <${Field} id="cp-name" label="Job name" error=${show("name")} hint="Shown in My Jobs and on your invoice.">
              <input id="cp-name" class="dh-input" type="text" value=${name} maxlength="80" placeholder="For example: Embed document archive" aria-invalid=${show("name") ? "true" : null} aria-describedby=${show("name") ? "cp-name-err" : null} onInput=${(e) => patch({ name: e.target.value })} /><//>
            <div class="row wrap" style="margin-top:12px;gap:6px"><span class="t-12 faint">Start from a template:</span>
              ${Object.entries(TEMPLATES).map(([k, t]) => html`<button type="button" key=${k} class="dh-filterchip" onClick=${() => setForm(fromTemplate(t))}>${t.label}</button>`)}</div>
          </section>

          <section class="dh-card" aria-labelledby="cp-s2">
            <div class="cp-step"><span class="cp-step__n">2</span><h2 class="dh-card__title" id="cp-s2">Priority tier and deadline</h2>
              <${InfoPop} label="What a server-hour is"><p class="w-600" style="margin-bottom:6px">How the price works</p><p class="muted">A server-hour is one hour on a 1 kW reference server. Cost = runtime × power × the price of the tier. You pay for work done, not for waiting time.</p><//></div>
            <fieldset class="cp-tiers"><legend class="sr-only">Priority tier</legend>
              ${TIERS.map((p) => html`<label key=${p} class=${cx("cp-tier", priority === p && "is-on")}>
                <input type="radio" class="sr-only" name="cp-tier" value=${p} checked=${priority === p} onChange=${() => patch({ priority: p })} />
                <span class="cp-tier__head"><span class="row"><${Icon} name=${vocab.priority[p].icon} size=${14} />${tiers[p].label}</span><span class="cp-tier__radio" aria-hidden="true"></span></span>
                <span class="cp-tier__blurb">${tiers[p].blurb}</span>
                <span class="cp-tier__price">${tiers[p].price} · <b>${fmt.num(prices[p], 2)}</b> CHF per server-hour${serverHours > 0 ? html`<br />This job: about <b>${fmt.chf(costOf(p), 2)}</b> CHF` : null}</span>
              </label>`)}</fieldset>
            <div class="row wrap" style="margin-top:16px;align-items:flex-start;gap:12px 16px">
              <${Field} id="cp-deadline" label="Deadline (Swiss time)" error=${show("deadline")} hint=${`Simulated now: ${fmt.clock(now)}`} style="width:240px;max-width:100%">
                <input id="cp-deadline" class="dh-input dh-input--num" type="datetime-local" value=${deadline} min=${toLocal(nowMs)} step="900" aria-invalid=${show("deadline") ? "true" : null} aria-describedby=${show("deadline") ? "cp-deadline-err" : null} onInput=${(e) => setDeadline(e.target.value)} /><//>
              <div class="dh-field"><span class="dh-field__label">Quick choice</span><div class="cp-presets">${[[6, "In 6 h"], [24, "In 24 h"], [72, "In 3 days"], [168, "In 7 days"]].map(([hh, l]) => html`<button type="button" key=${hh} class="dh-filterchip" aria-pressed=${deadline === toLocal(nowMs + hh * 3600000)} onClick=${() => setDeadline(toLocal(nowMs + hh * 3600000))}>${l}</button>`)}</div></div>
            </div>
          </section>

          <section class="dh-card" aria-labelledby="cp-s3">
            <div class="cp-step"><span class="cp-step__n">3</span><h2 class="dh-card__title grow" id="cp-s3">Tasks</h2><span class="t-12 faint">${tasks.length} task${tasks.length === 1 ? "" : "s"}</span></div>
            ${tasks.length === 0 && html`<${EmptyState} compact icon="tasks" tone=${tried ? "critical" : null} title="No tasks yet" body="A job is one or more tasks. Tasks can wait for each other: for example two batches, then a merge." action=${html`<div class="row wrap" style="justify-content:center"><button type="button" class="dh-btn dh-btn--primary" onClick=${addTask}><${Icon} name="plus" size=${14} />Add a task</button><button type="button" class="dh-btn" onClick=${() => setForm(fromTemplate(TEMPLATES.embed))}>Use the embed template</button></div>`} />`}
            ${tasks.map((t, i) => html`<div class="cp-task" key=${t.key} role="group" aria-label=${`Task ${t.key}`}>
              <span class="cp-task__key" aria-hidden="true">${t.key}</span>
              <${Field} id=${"cp-tn" + t.key} label="Task name"><input id=${"cp-tn" + t.key} class="dh-input" type="text" value=${t.name} maxlength="60" placeholder=${`task ${t.key}`} onInput=${(e) => patchTask(t.key, { name: e.target.value })} /><//>
              <${Field} id=${"cp-rt" + t.key} label="Runtime, min" error=${show("rt" + t.key)}><input id=${"cp-rt" + t.key} class="dh-input dh-input--num" type="number" min="1" step="15" inputmode="numeric" value=${t.runtimeMin} aria-invalid=${show("rt" + t.key) ? "true" : null} onInput=${(e) => patchTask(t.key, { runtimeMin: e.target.value })} /><//>
              <${Field} id=${"cp-pw" + t.key} label="Power, kW" error=${show("pw" + t.key)}><input id=${"cp-pw" + t.key} class="dh-input dh-input--num" type="number" min="0.1" max=${MAX_TASK_KW} step="0.1" inputmode="decimal" value=${t.powerKw} aria-invalid=${show("pw" + t.key) ? "true" : null} onInput=${(e) => patchTask(t.key, { powerKw: e.target.value })} /><//>
              <button type="button" class="dh-iconbtn cp-task__rm" aria-label=${`Remove task ${t.key}`} title="Remove task" onClick=${() => removeTask(t.key)}><${Icon} name="trash" size=${16} /></button>
              <div class="cp-task__more">
                ${i > 0 && html`<span class="dh-filtergroup" role="group" aria-label=${`Task ${t.key} starts after`}><span>Starts after</span>${tasks.slice(0, i).map((d) => html`<button type="button" key=${d.key} class="dh-filterchip" style="height:26px;padding:0 10px" aria-pressed=${t.dependsOn.includes(d.key)} title=${d.name || `task ${d.key}`} onClick=${() => toggleDep(t.key, d.key)}>${d.key}</button>`)}</span>`}
                <label class="cp-check"><input type="checkbox" checked=${t.interruptible} onChange=${(e) => patchTask(t.key, { interruptible: e.target.checked })} />Can be paused or moved</label>
                <span class="faint num">${rt(t) > 0 && pw(t) > 0 ? `${fmt.num((rt(t) / 60) * pw(t), 1)} server-hours` : ""}</span>
              </div></div>`)}
            ${tasks.length > 0 && html`<div style="margin-top:8px;padding-top:12px;border-top:1px solid var(--line)"><button type="button" class="dh-btn" onClick=${addTask}><${Icon} name="plus" size=${14} />Add a task</button></div>`}
            ${show("tasks") && html`<p class="dh-field__error" style="margin-top:8px" role="alert"><${Icon} name="alert-octagon" size=${12} />${errs.tasks}</p>`}
          </section>
        </div>

        <aside class="dh-card cp-estimate" aria-label="Estimate">
          <div class="row-between" style="margin-bottom:14px"><h2 class="dh-card__title">Estimate</h2><span class="t-12 faint">updates as you type</span></div>
          <div class="cp-est__row"><div><div class="t-12 muted">Estimated cost</div><div class="t-12 faint num" style="margin-top:2px">${fmt.num(serverHours, 1)} server-hours × ${fmt.num(prices[priority], 2)} CHF</div></div>
            <div class="cp-est__big"><${Num} value=${costOf(priority)} d=${2} /><span class="unit">CHF</span></div></div>
          <div class="cp-est__row"><div><div class="t-12 muted">Estimated finish</div><div class="t-12 faint" style="margin-top:2px">${tasks.length ? html`Longest chain ${fmt.dur(chainMin)}${TYPICAL_WAIT_MIN[priority] ? `, typical ${tiers[priority].label} wait ${fmt.dur(TYPICAL_WAIT_MIN[priority])}` : ", starts in the next 15-minute slot"}` : "Add a task to see an estimate"}</div></div>
            <div style="text-align:right"><div class="t-16 w-600 num" style="white-space:nowrap">${tasks.length ? fmt.dayTime(fmt.iso(estMs)) : "–"}</div><div class="t-12 faint">${tasks.length ? fmt.rel(fmt.iso(estMs), now) : ""}</div></div></div>
          <div style="margin:4px 0 14px">${!tasks.length ? null
            : errs.deadline ? html`<div class="cp-note tone-critical" role="status"><${Icon} name="alert-octagon" size=${14} /><span>The deadline cannot be met. ${errs.deadline}</span></div>`
            : tight ? html`<div class="cp-note tone-dump" role="status"><${Icon} name="alert-triangle" size=${14} /><span>Tight for the ${tiers[priority].label} tier: the estimate is ${fmt.dur(-spareMin)} after your deadline. ${priority !== "critical" ? "Choose a higher tier or a later deadline." : "Choose a later deadline."}</span></div>`
            : html`<div class="cp-note tone-ok" role="status"><${Icon} name="check-circle" size=${14} /><span>Fits your deadline with about ${fmt.dur(spareMin)} to spare.</span></div>`}</div>
          <div class="t-12 muted" style="margin-bottom:8px">Task order</div>
          ${tasks.length ? html`<${TaskGraph} tasks=${preview} />` : html`<p class="t-13 faint">No tasks yet.</p>`}
          <p class="t-12 faint" style="margin-top:12px">Estimates, not a guarantee. The final cost is the work actually done. Flexible jobs can pause while a host's tank is full.</p>
          <hr class="dh-divider" />
          <${TrustLine} />
          ${tried && nErr > 0 && html`<p class="dh-field__error" role="alert" style="margin-top:12px"><${Icon} name="alert-octagon" size=${12} />${nErr} field${nErr > 1 ? "s need" : " needs"} attention before you can submit.</p>`}
          <button type="submit" class="dh-btn dh-btn--primary dh-btn--lg" style="width:100%;margin-top:14px"><${Icon} name="upload" size=${16} />Submit job</button>
        </aside>
      </form><//>`;
  }

  /* ---------- My Jobs ---------------------------------------------------------------------- */
  function JobDetail({ st, row, onCancel }) {
    const now = st.scheduler.currentTime, j = row.job;
    if (!j) { // finished earlier: summary only (GET /customer/jobs/{id}/results)
      return html`<div class="cp-detail" style="grid-template-columns:minmax(0,1fr)">
        <dl class="cp-facts" style="grid-template-columns:repeat(4,minmax(0,1fr))">
          <div><dt>Submitted</dt><dd>${fmt.dayTime(row.submittedAt)}</dd></div><div><dt>Deadline</dt><dd>${fmt.dayTime(row.deadline)}</dd></div>
          <div><dt>${row.status === "missed" ? "Stopped at" : "Finished"}</dt><dd>${row.finished ? fmt.dayTime(row.finished) : `${Math.round(row.progressPct)} % when the deadline passed`}</dd></div>
          <div><dt>Tasks</dt><dd class="num">${row.tasks}</dd></div></dl>
        <div class="row wrap"><button type="button" class="dh-btn dh-btn--sm" onClick=${() => download(`${row.id}-results.csv`, `job,name,tier,status,submitted,deadline,finished,tasks,cost_chf\n${row.id},"${row.name}",${vocab.priority[row.priority].buyer},${row.status},${row.submittedAt},${row.deadline},${row.finished || ""},${row.tasks},${row.costChf}\n`)}><${Icon} name="download" size=${12} />Download result summary</button>
          <span class="dh-illustrative">Prototype: task graph and activity are shown for jobs of the live run</span></div></div>`;
    }
    const tasks = DH.sel.tasksOfJob(st, j.id), items = activityOf(tasks, now);
    return html`<div class="cp-detail">
      <div class="col" style="gap:16px;min-width:0">
        <div><h4>Task graph</h4><${TaskGraph} tasks=${tasks} /></div>
        <dl class="cp-facts">
          <div><dt>Submitted</dt><dd>${fmt.dayTime(j.submittedAt)}</dd></div>
          <div><dt>Deadline</dt><dd>${fmt.dayTime(j.deadline)}</dd></div>
          <div><dt>Estimated finish</dt><dd>${j.estimatedFinish ? fmt.dayTime(j.estimatedFinish) : j.finished ? `Finished ${fmt.time(j.finished)}` : "–"}</dd></div>
          <div><dt>Deadline risk</dt><dd><${Risk} job=${j} /></dd></div>
          <div><dt>Cost so far</dt><dd class="num">${fmt.chf(j.costChf, 2)} CHF</dd></div>
          <div><dt>Heat enabled so far</dt><dd class="num">${fmt.kwh(j.heatDeliveredKwh)} kWh</dd></div></dl>
        <div class="row wrap">
          <button type="button" class="dh-btn dh-btn--sm" onClick=${() => go("/submit", { from: j.id })}><${Icon} name="copy" size=${12} />Run again</button>
          ${isOpen(j) && html`<button type="button" class="dh-btn dh-btn--sm dh-btn--danger" onClick=${() => onCancel(j)}><${Icon} name="x" size=${12} />Cancel job</button>`}</div>
      </div>
      <div style="min-width:0"><h4>Activity</h4><div class="cp-detail__activity"><${Timeline} items=${items} empty="Nothing has happened yet. The job starts in the next 15-minute slot." /></div></div>
    </div>`;
  }
  function JobsSkeleton() {
    return html`<div class="cp-stack" aria-busy="true"><span class="sr-only">Loading jobs</span><div class="row"><${Skeleton} w=${80} h=${30} /><${Skeleton} w=${80} h=${30} /><${Skeleton} w=${80} h=${30} /></div>
      <div class="dh-card" style="padding:0">${Array.from({ length: 7 }, (_, i) => html`<div key=${i} class="row" style="padding:14px 16px;border-bottom:1px solid var(--line);gap:24px"><${Skeleton} w="26%" /><${Skeleton} w=${70} /><${Skeleton} w=${90} /><${Skeleton} w="14%" /><${Skeleton} w="12%" /><${Skeleton} w=${60} /></div>`)}</div></div>`;
  }
  function MyJobs({ st, jobs, q }) {
    const now = st.scheduler.currentTime, tiers = st.compute.tiers;
    const [fStatus, setFStatus] = useState(null), [fTier, setFTier] = useState(null), [confirm, setConfirm] = useState(null);
    const live = jobs.map((j) => ({ id: j.id, name: j.name, priority: j.priority, status: j.status, progressPct: j.progressPct, submittedAt: j.submittedAt, deadline: j.deadline, estimatedFinish: j.estimatedFinish, finished: j.finished, costChf: j.costChf, job: j }));
    const hist = st.compute.jobHistory.map((j) => Object.assign({}, j, { job: null, estimatedFinish: null }));
    const all = [...live, ...hist];
    const group = (r) => (r.status === "running" || r.status === "queued" ? "active" : r.status === "missed" ? "missed" : r.status === "cancelled" ? "cancelled" : "done");
    const rows = all.filter((r) => (!fStatus || group(r) === fStatus) && (!fTier || r.priority === fTier));
    const count = (g) => all.filter((r) => group(r) === g).length;
    const columns = [
      { key: "name", label: "Job", render: (r) => html`<span class=${cx("cp-jobname", q.job === r.id && "is-open")}><${Icon} name="chevron-right" size=${14} /><span class="col" style="gap:0;min-width:0"><span class="w-600 truncate" style="max-width:260px">${r.name}</span><span class="t-12 faint num">${r.id}</span></span></span>` },
      { key: "priority", label: "Tier", sortValue: (r) => TIERS.indexOf(r.priority), render: (r) => html`<${TierChip} priority=${r.priority} tiers=${tiers} />` },
      { key: "status", label: "Status", render: (r) => html`<${StatusChip} kind="job" value=${r.status} size="sm" />` },
      { key: "progressPct", label: "Progress", render: (r) => html`<span class="cp-prog"><${ProgressBar} value=${r.progressPct} tone=${r.status === "done" ? "ok" : r.status === "missed" ? "critical" : r.status === "cancelled" ? "idle" : "heat"} running=${!!r.job && r.status === "running" && r.job.tasksRunning > 0} label=${`Progress of ${r.id}`} /><span class="num t-12">${Math.round(r.progressPct)} %</span></span>` },
      { key: "deadline", label: "Deadline", render: (r) => html`<span>${fmt.dayTime(r.deadline)}${r.job && isOpen(r.job) && r.job.atRisk ? html` <span class="cp-inline tone-dump" title=${riskOf(r.job).label}><${Icon} name="alert-triangle" size=${12} title="At risk" /></span>` : null}</span>` },
      { key: "estimatedFinish", label: "Estimated finish", sortValue: (r) => r.estimatedFinish || r.finished || "", render: (r) => (r.estimatedFinish ? html`${fmt.dayTime(r.estimatedFinish)}` : r.finished ? html`<span class="muted">Finished ${fmt.dayTime(r.finished)}</span>` : html`<span class="faint">–</span>`) },
      { key: "costChf", label: "Cost", num: true, render: (r) => html`${fmt.chf(r.costChf, 2)} <span class="faint">CHF</span>` },
    ];
    const emptyAll = html`<div class="dh-card"><${EmptyState} icon="tasks" title="No jobs yet" body="Jobs you submit appear here with status, progress, deadline and cost." action=${html`<${SubmitButton} label="Submit your first job" />`} /></div>`;
    return html`<${ViewState} state=${st.ui.dataState} skeleton=${html`<${JobsSkeleton} />`} empty=${emptyAll}>
      <div class="cp-stack">
        ${q.submitted && q.job && html`<div class="cp-note tone-ok" role="status" style="font-size:13px"><${Icon} name="check-circle" size=${16} /><span><b>Job ${q.job} submitted.</b> It is queued and starts in the next 15-minute slot. Progress updates live below.</span></div>`}
        <div class="cp-toolbar"><${FilterChips} groups=${[
          { label: "Status", value: fStatus, onChange: setFStatus, options: [{ value: "active", label: "Active", count: count("active") }, { value: "done", label: "Done", count: count("done") }, { value: "missed", label: "Missed", count: count("missed") }] },
          { label: "Tier", value: fTier, onChange: setFTier, options: TIERS.map((p) => ({ value: p, label: tiers[p].label })) }]} />
          <span class="t-12 faint">${rows.length} of ${all.length} jobs · select a row for the task graph and activity</span></div>
        <${DataTable} caption="My jobs" columns=${columns} rows=${rows} onRow=${(r) => DH.router.set({ job: q.job === r.id ? null : r.id, submitted: null })} selectedKey=${q.job} expanded=${q.job}
          renderExpanded=${(r) => html`<${JobDetail} st=${st} row=${r} onCancel=${setConfirm} />`}
          empty=${html`<${EmptyState} compact icon="filter" title="No jobs match these filters" body="Clear the filters to see all your jobs." action=${html`<button type="button" class="dh-btn" onClick=${() => { setFStatus(null); setFTier(null); }}>Clear filters</button>`} />`} />
      </div>
      ${confirm && html`<${ConfirmDialog} danger title=${`Cancel job ${confirm.id}?`} body=${`“${confirm.name}” stops now. Work already done is billed (${fmt.chf(confirm.costChf, 2)} CHF so far). This cannot be undone.`} confirmLabel="Cancel job" cancelLabel="Keep running"
        onCancel=${() => setConfirm(null)} onConfirm=${() => { DH.api.cancelJob(confirm.id); setConfirm(null); }} />`}<//>`;
  }

  /* ---------- API keys (also summarised on Usage and Invoices) -------------------------------- */
  function ApiKeys({ st }) {
    const keys = st.compute.apiKeys, now = st.scheduler.currentTime;
    const [name, setName] = useState(""), [fresh, setFresh] = useState(null), [revoke, setRevoke] = useState(null), [copied, setCopied] = useState(false), [err, setErr] = useState(null);
    const create = (e) => {
      e.preventDefault();
      if (!name.trim()) { setErr("Name the key after where it will be used."); return; }
      const rnd = Array.from({ length: 28 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)]).join("");
      const prefix = "dh_live_" + rnd.slice(0, 4), id = "key_" + Date.now();
      DH.store.update((s) => s.compute.apiKeys.unshift({ id, name: name.trim(), prefix, createdAt: now, lastUsedAt: null })); // POST /customer/api-keys
      setFresh({ id, secret: prefix + rnd.slice(4) }); setName(""); setErr(null); setCopied(false);
    };
    const copy = () => { try { navigator.clipboard.writeText(fresh.secret); } catch (_) {} setCopied(true); };
    const columns = [
      { key: "name", label: "Name", render: (k) => html`<span class="w-600">${k.name}</span>` },
      { key: "prefix", label: "Key", sortable: false, render: (k) => html`<span class="num">${k.prefix}••••••••••••</span>` },
      { key: "createdAt", label: "Created", render: (k) => fmt.date(k.createdAt) },
      { key: "lastUsedAt", label: "Last used", render: (k) => (k.lastUsedAt ? fmt.dayTime(k.lastUsedAt) : html`<span class="faint">Never</span>`) },
      { key: "x", label: "Actions", sortable: false, render: (k) => html`<button type="button" class="dh-btn dh-btn--sm dh-btn--danger" onClick=${() => setRevoke(k)}><${Icon} name="trash" size=${12} />Revoke</button>` },
    ];
    return html`<div class="cp-stack">
      <section class="dh-card"><div class="dh-card__title">Create an API key</div><p class="dh-card__sub">Keys submit and follow jobs for ${st.compute.user.name}. A key is shown once, when you create it.</p>
        <form class="row wrap" style="margin-top:14px;align-items:flex-start" onSubmit=${create}>
          <${Field} id="cp-keyname" label="Key name" error=${err} style="flex:1 1 260px;max-width:420px"><input id="cp-keyname" class="dh-input" type="text" value=${name} maxlength="60" placeholder="For example: Research cluster CI" aria-invalid=${err ? "true" : null} onInput=${(e) => { setName(e.target.value); setErr(null); }} /><//>
          <button type="submit" class="dh-btn dh-btn--primary" style="margin-top:22px"><${Icon} name="key" size=${14} />Create key</button></form>
        ${fresh && html`<div class="cp-newkey" role="status" style="margin-top:16px"><span class="cp-inline tone-ok"><${Icon} name="check-circle" size=${18} /></span>
          <div class="grow col" style="gap:6px;min-width:200px"><span class="w-600">Copy your new key now. It will not be shown again.</span><code>${fresh.secret}</code></div>
          <button type="button" class="dh-btn" onClick=${copy}><${Icon} name=${copied ? "check" : "copy"} size=${14} />${copied ? "Copied" : "Copy key"}</button>
          <button type="button" class="dh-btn dh-btn--ghost" onClick=${() => setFresh(null)}>Done</button></div>`}
      </section>
      <${DataTable} caption="API keys" columns=${columns} rows=${keys}
        empty=${html`<${EmptyState} compact icon="key" title="No API keys" body="Create a key to submit jobs from your own pipelines." />`} />
      ${revoke && html`<${ConfirmDialog} danger title=${`Revoke “${revoke.name}”?`} body=${`Anything using ${revoke.prefix}… stops working immediately. This cannot be undone.`} confirmLabel="Revoke key" cancelLabel="Keep key"
        onCancel=${() => setRevoke(null)} onConfirm=${() => { DH.store.update((s) => { s.compute.apiKeys = s.compute.apiKeys.filter((k) => k.id !== revoke.id); }); if (fresh && fresh.id === revoke.id) setFresh(null); setRevoke(null); }} />`}
    </div>`;
  }
  function KeysPage({ st }) {
    const skeleton = html`<div class="cp-stack" aria-busy="true"><span class="sr-only">Loading API keys</span><div class="dh-card"><${Skeleton} variant="title" /><${Skeleton} h=${38} w="50%" style="margin-top:16px" /></div><div class="dh-card">${[0, 1, 2].map((i) => html`<${Skeleton} key=${i} w=${`${90 - i * 12}%`} style="margin:12px 0" />`)}</div></div>`;
    const empty = html`<div class="dh-card"><${EmptyState} icon="key" title="No API keys yet" body="Create a key to submit and follow jobs from your own pipelines instead of this console." action=${html`<button type="button" class="dh-btn dh-btn--primary" onClick=${() => DH.router.set({ state: null })}><${Icon} name="key" size=${14} />Create your first key</button>`} /></div>`;
    return html`<${ViewState} state=${st.ui.dataState} skeleton=${skeleton} empty=${empty}><${ApiKeys} st=${st} /><//>`;
  }

  /* ---------- Usage and Invoices ------------------------------------------------------------------ */
  function UsageSkeleton() {
    return html`<div class="cp-stack" aria-busy="true"><span class="sr-only">Loading usage</span>
      <div class="cp-kpis cp-kpis--3">${[0, 1, 2].map((i) => html`<div class="dh-kpi dh-kpi--card" key=${i}><${Skeleton} w=${110} /><${Skeleton} variant="num" style="margin:6px 0" /><${Skeleton} w=${80} /></div>`)}</div>
      <div class="dh-card"><${Skeleton} variant="title" /><${Skeleton} h=${220} variant="card" style="margin-top:16px" /></div>
      <div class="dh-card">${[0, 1, 2, 3].map((i) => html`<${Skeleton} key=${i} w=${`${94 - i * 9}%`} style="margin:14px 0" />`)}</div></div>`;
  }
  function Usage({ st, ov }) {
    const { usage, invoices, tiers, apiKeys } = st.compute, now = st.scheduler.currentTime;
    const [metric, setMetric] = useState("serverHours");
    const months = [...new Set(usage.map((u) => u.month))];
    const unit = metric === "serverHours" ? "server-hours" : "CHF";
    const buckets = months.map((m) => ({ label: fmt.monthShort(m), tip: fmt.month(m) + (m === months[months.length - 1] ? ", so far" : ""),
      segments: TIERS.map((p) => { const u = usage.find((x) => x.month === m && x.priority === p) || {}; return { key: p, label: tiers[p].label, value: u[metric] || 0, color: CAT[p] }; }) }));
    const cur = usage.filter((u) => u.month === months[months.length - 1]);
    const curH = cur.reduce((a, u) => a + u.serverHours, 0), curC = cur.reduce((a, u) => a + u.costChf, 0);
    const csv = (inv) => { const rows = usage.filter((u) => u.month === inv.month); return `invoice,period,tier,server_hours,price_chf_per_server_hour,amount_chf\n` + rows.map((u) => `${inv.id},${fmt.month(inv.month)},${tiers[u.priority].label},${u.serverHours},${(u.costChf / u.serverHours).toFixed(4)},${u.costChf.toFixed(2)}`).join("\n") + `\n${inv.id},${fmt.month(inv.month)},Total,${inv.serverHours},,${inv.amountChf.toFixed(2)}\n`; };
    const invCols = [
      { key: "id", label: "Invoice", render: (i) => html`<span class="num w-600">${i.id}</span>` },
      { key: "month", label: "Period", render: (i) => fmt.month(i.month) },
      { key: "serverHours", label: "Server-h", num: true, render: (i) => fmt.num(i.serverHours, 0) },
      { key: "amountChf", label: "Amount, CHF", num: true, render: (i) => fmt.chf(i.amountChf, 2) },
      { key: "status", label: "Status", render: (i) => (i.status === "paid" ? html`<span class="dh-chip dh-chip--sm tone-ok"><${Icon} name="check" size=${12} />Paid</span>` : html`<span class="dh-chip dh-chip--sm tone-idle" title="The month is still in progress. The invoice is issued at month end."><${Icon} name="clock" size=${12} />Open</span>`) },
      { key: "dl", label: "Download", sortable: false, render: (i) => html`<button type="button" class="dh-btn dh-btn--sm" aria-label=${`Download invoice ${i.id} as CSV`} onClick=${() => download(`${i.id}.csv`, csv(i))}><${Icon} name="download" size=${12} />CSV</button>` },
    ];
    const empty = html`<div class="dh-card"><${EmptyState} icon="chart" title="No usage yet" body="Server-hours and cost appear here after your first job has run. The first invoice is issued at the end of the month." action=${html`<${SubmitButton} />`} /></div>`;
    return html`<${ViewState} state=${st.ui.dataState} skeleton=${html`<${UsageSkeleton} />`} empty=${empty}>
      <div class="cp-stack">
        <div class="cp-kpis cp-kpis--3">
          <${KpiTile} card label="Server-hours" value=${curH} d=${0} unit="server-hours" period=${`${fmt.month(now)}, invoiced so far`} icon="server" />
          <${KpiTile} card label="Spend this month" value=${ov.spendMonthChf} d=${2} unit="CHF" period=${`${fmt.month(now)}, incl. running jobs`} icon="coins" />
          <${KpiTile} card label="Average price" value=${curH ? curC / curH : 0} d=${2} unit="CHF / server-hour" period=${`${fmt.month(now)}, all tiers`} icon="chart" />
        </div>
        <section class="dh-card" aria-label="Usage by priority tier">
          <div class="row-between wrap" style="margin-bottom:12px"><div><div class="dh-card__title">Usage by priority tier</div><div class="dh-card__sub">Per month, last ${months.length} months. A server-hour is one hour on a 1 kW reference server.</div></div>
            <${Segmented} label="Chart metric" value=${metric} onChange=${setMetric} options=${[{ value: "serverHours", label: "Server-hours" }, { value: "costChf", label: "Cost, CHF" }]} /></div>
          <${StackedBars} buckets=${buckets} unit=${unit} height=${240} d=${0} maxBar=${72} yMaxFixed=${axisMax(Math.max(...buckets.map((b) => b.segments.reduce((a, s) => a + s.value, 0))))} ariaLabel=${`${unit} per month, split by priority tier`} />
        </section>
        <div class="cp-two">
          <section class="col" style="gap:12px" aria-label="Invoices"><h3 class="t-16 w-600">Invoices</h3>
            <${DataTable} caption="Invoices" columns=${invCols} rows=${invoices} empty=${html`<${EmptyState} compact icon="file" title="No invoices yet" body="The first invoice is issued at the end of the month." />`} /></section>
          <div class="col" style="gap:16px">
            <section class="dh-card" aria-label="This month by tier"><div class="dh-card__title">${fmt.month(now)} by tier</div>
              <ul class="cp-list" style="margin-top:6px">${TIERS.map((p) => { const u = cur.find((x) => x.priority === p) || { serverHours: 0, costChf: 0 }; return html`<li key=${p}><span class="dh-swatch" style=${`--tone:${CAT[p]}`}></span><span class="grow w-500">${tiers[p].label}</span><span class="num muted">${fmt.num(u.serverHours, 0)} server-h</span><span class="num" style="min-width:104px;text-align:right">${fmt.chf(u.costChf, 2)} CHF</span></li>`; })}</ul></section>
            <section class="dh-card" aria-label="API keys"><div class="row-between"><div><div class="dh-card__title row"><${Icon} name="key" size=${16} />API keys</div><div class="dh-card__sub">${apiKeys.length} active key${apiKeys.length === 1 ? "" : "s"}. Create and revoke keys for your pipelines.</div></div>
              <button type="button" class="dh-btn" onClick=${() => go("/keys")}>Manage keys<${Icon} name="chevron-right" size=${14} /></button></div></section>
          </div>
        </div>
      </div><//>`;
  }

  /* ---------- Impact ----------------------------------------------------------------------------------- */
  function Impact({ st, ov }) {
    const imp = st.compute.impact, now = st.scheduler.currentTime;
    const months = imp.monthly, last = months[months.length - 1];
    const buckets = months.map((m) => ({ label: fmt.monthShort(m.month), tip: fmt.month(m.month) + (m === last ? ", so far" : ""), segments: [{ key: "heat", label: "Heat enabled", value: m === last ? ov.heatDeliveredKwh : m.heatDeliveredKwh, tone: "heat" }] }));
    const total = months.slice(0, -1).reduce((a, m) => a + m.heatDeliveredKwh, 0) + ov.heatDeliveredKwh;
    const co2 = { name: "CO2 estimate", value: `about ${fmt.num(imp.co2.valueKg, 0)} kg CO2`, status: imp.co2.status, source: imp.co2.source };
    const recovery = { name: "Heat recovery", value: "80 %", status: "BRIEF", source: "Case brief: 80 % of server electricity is recoverable into water." }; // GAP: not exposed to customers
    const skeleton = html`<div class="cp-stack" aria-busy="true"><span class="sr-only">Loading impact</span><div class="cp-kpis cp-kpis--3">${[0, 1, 2].map((i) => html`<div class="dh-kpi dh-kpi--card" key=${i}><${Skeleton} w=${110} /><${Skeleton} variant="num" style="margin:6px 0" /><${Skeleton} w=${80} /></div>`)}</div>
      <div class="dh-card"><${Skeleton} variant="title" /><${Skeleton} h=${220} variant="card" style="margin-top:16px" /></div><div class="dh-card"><${Skeleton} variant="title" /><${Skeleton} w="90%" style="margin-top:14px" /><${Skeleton} w="70%" style="margin-top:8px" /></div></div>`;
    const empty = html`<div class="dh-card"><${EmptyState} icon="flame" tone="heat" title="No heat enabled yet" body="When your first job runs, the heat its servers produce for host businesses is counted here." action=${html`<${SubmitButton} />`} /></div>`;
    return html`<${ViewState} state=${st.ui.dataState} skeleton=${skeleton} empty=${empty}>
      <div class="cp-stack">
        <div class="cp-kpis cp-kpis--3">
          <${KpiTile} card label="Heat enabled" value=${ov.heatDeliveredKwh} d=${0} unit="kWh" period=${`${fmt.month(now)}, so far`} tone="heat" icon="flame" />
          <${KpiTile} card label=${`Heat enabled, ${months.length} months`} value=${total} d=${0} unit="kWh" period=${`${fmt.month(months[0].month)} to ${fmt.month(now)}`} tone="heat" icon="flame" />
          <${KpiTile} card label="Host businesses heated" value=${imp.sitesHeated} d=${0} unit="sites" period=${`${fmt.month(now)}, fleet reuse share ${fmt.num(imp.heatReusedSharePct, 1)} %`} icon="building" />
        </div>
        <section class="dh-card" aria-label="Heat enabled over time">
          <div style="margin-bottom:12px"><div class="dh-card__title">Heat enabled over time</div><div class="dh-card__sub">kWh per month. The share of reused fleet heat associated with your workloads.</div></div>
          <${StackedBars} buckets=${buckets} unit="kWh per month" height=${240} d=${0} maxBar=${72} yMaxFixed=${axisMax(Math.max(...buckets.map((b) => b.segments[0].value)))} ariaLabel="Heat enabled per month in kWh" />
        </section>
        <div class="cp-two cp-two--even">
          <section class="dh-card" aria-label="Methodology"><div class="dh-card__title row"><${Icon} name="info" size=${16} />How this number is made</div>
            <ol class="cp-method" style="margin-top:12px">
              <li><b>Electricity per task.</b> Each of your tasks is metered per 15-minute slot at its nominal power.</li>
              <li><b>Recovered into water.</b> A fixed share of that electricity is recovered as hot water. <${AssumptionPill} a=${recovery} inline /></li>
              <li><b>Reused by host businesses.</b> Only heat that a host business actually used counts. The reuse share is measured for the whole fleet, not per customer:
                <blockquote class="cp-quote">“${imp.note}” <span class="faint num">(${fmt.num(imp.heatReusedSharePct, 1)} %)</span></blockquote></li>
              <li><b>What it is not.</b> It is not a CO2 saving, not a cost saving and not a certificate. Host businesses are shown as a count only.</li>
            </ol></section>
          <section class="dh-card cp-co2" aria-label="CO2 estimate, assumption">
            <div class="row-between wrap"><div class="dh-card__title">CO2 effect</div><${AssumptionPill} a=${co2} align="right" /></div>
            <div class="cp-heat__value" style="margin-top:12px;font-size:28px"><span class="unit" style="margin:0 .4em 0 0;font-size:13px">about</span><span class="num">${fmt.num(imp.co2.valueKg, 0)}</span><span class="unit" style="font-size:13px">kg CO2, ${fmt.month(now)}</span></div>
            <p class="t-13 muted" style="margin-top:10px"><b style="color:var(--text)">Assumption, not verified.</b> Do not use this figure in reporting.</p>
            <p class="t-12 faint" style="margin-top:8px"><b>Source:</b> ${imp.co2.source}</p>
          </section>
        </div>
      </div><//>`;
  }

  /* ---------- Support ------------------------------------------------------------------------------------- */
  function Support({ st }) {
    return html`<${ViewState} state=${st.ui.dataState === "empty" ? "live" : st.ui.dataState}>
      <div class="cp-two cp-two--even">
        <section class="dh-card"><div class="dh-card__title row"><${Icon} name="help" size=${16} />Talk to DigitalHeat</div>
          <p class="t-13 muted" style="margin-top:8px">Questions about a job, a deadline or an invoice. Include the job id (for example J201) so we can find it quickly.</p>
          <ul class="cp-list" style="margin-top:8px"><li><${Icon} name="file" size=${16} /><span class="grow">Open a support request</span><span class="faint t-12">answer within one working day</span></li>
            <li><${Icon} name="alert-triangle" size=${16} /><span class="grow">Report a missed deadline</span><span class="faint t-12">reviewed with the scheduler log</span></li></ul>
          <p style="margin-top:14px"><span class="dh-illustrative">Prototype: contact channels are placeholders</span></p></section>
        <section class="dh-card"><div class="dh-card__title">Data protection</div><div style="margin-top:12px"><${TrustLine} /></div>
          <p class="t-13 muted" style="margin-top:10px">Operated by Virtual Culture GmbH, Basel. Your workloads run on sealed racks at Swiss host businesses and never leave Switzerland.</p></section>
      </div><//>`;
  }

  /* ---------- App ---------------------------------------------------------------------------------------------- */
  const TITLES = { "/": "Overview", "/submit": "Submit Job", "/jobs": "My Jobs", "/usage": "Usage and Invoices", "/impact": "Impact", "/keys": "API Keys", "/support": "Support" };
  function App() {
    const st = DH.useStore(), r = DH.useRoute();
    const user = st.compute.user, path = TITLES[r.path] ? r.path : "/";
    const jobs = st.jobs.filter((j) => j.customerId === user.id);
    const ov = DH.sel.customerOverview(st, user.id);
    const active = jobs.filter(isOpen).length;
    const nav = [
      { path: "/", label: "Overview", icon: "grid" },
      { path: "/submit", label: "Submit Job", icon: "upload" },
      { path: "/jobs", label: "My Jobs", icon: "tasks", badge: st.ui.dataState === "live" || st.ui.dataState === "reconnecting" ? active || null : null },
      { path: "/usage", label: "Usage and Invoices", icon: "chart" },
      { path: "/impact", label: "Impact", icon: "flame" },
      { path: "/keys", label: "API Keys", icon: "key" },
    ];
    const support = html`<a class="dh-navitem" href=${DH.router.href("/support")} aria-current=${path === "/support" ? "page" : null}><${Icon} name="help" size=${18} /><span>Support</span></a>`;
    const page = path === "/submit" ? html`<${SubmitJob} st=${st} q=${r.q} />`
      : path === "/jobs" ? html`<${MyJobs} st=${st} jobs=${jobs} q=${r.q} />`
      : path === "/usage" ? html`<${Usage} st=${st} ov=${ov} />`
      : path === "/impact" ? html`<${Impact} st=${st} ov=${ov} />`
      : path === "/keys" ? html`<${KeysPage} st=${st} />`
      : path === "/support" ? html`<${Support} st=${st} />`
      : html`<${Overview} st=${st} jobs=${jobs} ov=${ov} />`;
    return html`<${PortalShell} here="compute" product="Compute Portal" nav=${nav} current=${path} user=${user} title=${TITLES[path]} support=${support}
      actions=${path !== "/submit" ? html`<${SubmitButton} />` : null}>${page}<//>`;
  }

  DH.boot();
  DH.mount(App);
})();
