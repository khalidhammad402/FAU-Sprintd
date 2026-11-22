/* ==========================================================================
   DigitalHeat prototype runtime: store, message bus, fake live engine, selectors.

   The engine stands in for the backend WebSocket. Every 15-minute slot it emits
   the same messages the real API pushes ({type, channel, time, data}):
     clock.tick · slot.tick · kpi.update · agents.update · alert.raised
     task.ready / started / paused / resumed / migrated / completed / missed / cancelled
   and exposes the same controls as PUT /admin/scheduler, POST /admin/scheduler/jump
   and POST /admin/tasks/{id}/{action}.
   To go live: delete the engine, feed real messages into DH.receive(msg).
   ========================================================================== */
(function () {
  const DH = (window.DH = window.DH || {});
  const P = window.htmPreact;
  const { useState, useEffect, useRef } = P;
  const SD = DH.sampleData;
  const SLOT_MS = 15 * 60 * 1000;
  const SLOT_H = 0.25;
  const RECOVERY = 0.8;

  /* ---------- reduced motion ------------------------------------------------ */
  const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  DH.reducedMotion = mq.matches || /[?&]rm=1/.test(location.href);
  DH.setReducedMotion = (on) => {
    DH.reducedMotion = on;
    document.documentElement.classList.toggle("reduced-motion", on);
    store.notify();
  };

  /* ---------- formatting ------------------------------------------------------ */
  const TZ = "Europe/Zurich";
  const dtf = (o) => new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone: TZ, hour12: false }, o));
  const fHM = dtf({ hour: "2-digit", minute: "2-digit" });
  const fDay = dtf({ weekday: "short", day: "numeric", month: "short" });
  const fDate = dtf({ day: "numeric", month: "short", year: "numeric" });
  const fMonth = dtf({ month: "short", year: "numeric" });
  const fMonthShort = dtf({ month: "short" });
  const fParts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const num = (v, d = 0) => (v == null || !isFinite(v) ? "–" : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const autoD = (v) => { const a = Math.abs(v); return a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 1 : 2; };
  const fmt = {
    num,
    auto: (v) => num(v, autoD(v)),
    autoD,
    kwh: (v) => num(v, autoD(v)),
    chf: (v, d) => num(v, d == null ? (Math.abs(v) >= 100 ? 0 : 2) : d),
    pct: (v, d = 0) => num(v, d),
    time: (iso) => (iso ? fHM.format(new Date(iso)) : "–"),
    day: (iso) => fDay.format(new Date(iso)),
    date: (iso) => fDate.format(new Date(iso)),
    month: (iso) => fMonth.format(new Date(iso)),
    monthShort: (iso) => fMonthShort.format(new Date(iso)),
    dayTime: (iso) => `${fDay.format(new Date(iso))}, ${fHM.format(new Date(iso))}`,
    // "Wed, Oct 22, 14:30" - the simulated scheduler clock
    clock: (iso) => { const p = Object.fromEntries(fParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${p.weekday}, ${p.month} ${p.day}, ${p.hour === "24" ? "00" : p.hour}:${p.minute}`; },
    hour: (iso) => Number(dtf({ hour: "2-digit" }).format(new Date(iso))) + Number(dtf({ minute: "2-digit" }).format(new Date(iso))) / 60,
    dur: (min) => { min = Math.max(0, Math.round(min)); const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60; return d ? `${d} d ${h} h` : h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`; },
    rel: (iso, nowIso) => { const diff = (new Date(iso) - new Date(nowIso)) / 60000; return diff >= 0 ? `in ${fmt.dur(diff)}` : `${fmt.dur(-diff)} ago`; },
    ago: (iso, nowMs) => { if (!iso) return "no heartbeat"; const s = Math.max(0, Math.round(((nowMs || Date.now()) - new Date(iso).getTime()) / 1000)); return s < 90 ? `${s} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; },
    iso: (ms) => { // ISO 8601 with the Europe/Zurich offset, like the backend
      const d = new Date(ms); const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "longOffset" }).formatToParts(d).map((x) => [x.type, x.value]));
      const off = (p.timeZoneName || "GMT+01:00").replace("GMT", "") || "+00:00";
      return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}${off}`;
    },
  };
  DH.fmt = fmt;

  /* ---------- vocabulary: one place for labels, tones and icons ----------------- */
  DH.vocab = {
    site: {
      covered: { label: "Covered", tone: "ok", icon: "check-circle", text: "Heat demand is covered by server heat and the tank." },
      tank_low: { label: "Tank low", tone: "tank", icon: "droplet", text: "Tank below 20 %. More compute is being placed here." },
      dumping: { label: "Dumping heat", tone: "dump", icon: "wind", text: "Tank full. Surplus heat is being thrown away." },
      unmet: { label: "Backup heat needed", tone: "critical", icon: "alert-octagon", text: "The backup heater is covering part of the demand." },
      offline: { label: "Offline", tone: "idle", icon: "wifi-off", text: "No data from this site. Last values shown." },
    },
    task: {
      waiting: { label: "Queued", tone: "idle", icon: "clock" },
      ready: { label: "Ready", tone: "idle", icon: "clock" },
      running: { label: "Running", tone: "heat", icon: "play" },
      paused: { label: "Paused", tone: "dump", icon: "pause" },
      done: { label: "Complete", tone: "ok", icon: "check" },
      missed: { label: "Missed deadline", tone: "critical", icon: "alert-octagon" },
      cancelled: { label: "Cancelled", tone: "idle", icon: "x" },
    },
    job: {
      queued: { label: "Queued", tone: "idle", icon: "clock" },
      running: { label: "Running", tone: "heat", icon: "play" },
      done: { label: "Complete", tone: "ok", icon: "check" },
      missed: { label: "Missed deadline", tone: "critical", icon: "alert-octagon" },
      cancelled: { label: "Cancelled", tone: "idle", icon: "x" },
    },
    server: {
      online: { label: "Online", tone: "ok", icon: "check-circle" },
      working: { label: "Working", tone: "heat", icon: "play" },
      idle: { label: "Idle", tone: "idle", icon: "moon" },
      offline: { label: "Offline", tone: "critical", icon: "wifi-off" },
    },
    priority: {
      critical: { label: "Critical", buyer: "Priority", tone: "idle", icon: "chevrons-up" },
      normal: { label: "Normal", buyer: "Standard", tone: "idle", icon: "chevron-up" },
      flexible: { label: "Flexible", buyer: "Flexible", tone: "idle", icon: "shuffle" },
    },
    event: {
      ready: { label: "Ready", tone: "idle", icon: "clock" },
      started: { label: "Started", tone: "heat", icon: "play" },
      paused: { label: "Paused", tone: "dump", icon: "pause" },
      resumed: { label: "Resumed", tone: "heat", icon: "play" },
      migrated: { label: "Migrated", tone: "tank", icon: "shuffle" },
      server_lost: { label: "Server lost", tone: "critical", icon: "wifi-off" },
      completed: { label: "Completed", tone: "ok", icon: "check" },
      missed: { label: "Missed deadline", tone: "critical", icon: "alert-octagon" },
      cancelled: { label: "Cancelled", tone: "idle", icon: "x" },
    },
    severity: {
      critical: { label: "Critical", tone: "critical", icon: "alert-octagon" },
      warning: { label: "Warning", tone: "dump", icon: "alert-triangle" },
      info: { label: "Info", tone: "idle", icon: "info" },
    },
    alertKind: { unmet_demand: "Backup heat", heat_dumped: "Heat dumped", deadline_missed: "Missed deadline", server_offline: "Server offline" },
    hostType: { hotel: "bed", pool: "waves", plant: "factory", laundry: "washer", block: "building", farm: "wheat", spa: "waves", business: "factory" },
    assumption: { BRIEF: "tank", SOURCE: "ok", ASSUMPTION: "dump", MOCK: "critical", LIMIT: "idle", OK: "ok" },
  };

  /* ---------- store ---------------------------------------------------------------- */
  const store = {
    state: null,
    subs: new Set(),
    version: 0,
    notify() { this.version++; this.subs.forEach((f) => f()); },
    update(fn) { fn(this.state); this.notify(); },
  };
  DH.store = store;
  DH.useStore = function () {
    const [, force] = useState(0);
    useEffect(() => { const cb = () => force((x) => x + 1); store.subs.add(cb); return () => store.subs.delete(cb); }, []);
    return store.state;
  };

  /* ---------- bus: WebSocket-shaped pub/sub ------------------------------------------ */
  const handlers = new Map();
  DH.bus = {
    on(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type).delete(fn); },
    dispatch(msg) { (handlers.get(msg.type) || []).forEach((f) => f(msg)); (handlers.get("*") || []).forEach((f) => f(msg)); },
  };
  DH.useBus = function (type, fn) {
    const ref = useRef(fn); ref.current = fn;
    useEffect(() => DH.bus.on(type, (m) => ref.current(m)), [type]);
  };

  /* ---------- router: hash routes, drawer and prototype state live in the URL --------- */
  function parseHash() {
    const raw = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = raw.split("?");
    const q = {}; (qs || "").split("&").filter(Boolean).forEach((kv) => { const [k, v] = kv.split("="); q[decodeURIComponent(k)] = decodeURIComponent(v || ""); });
    return { path: path || "/", q };
  }
  function buildHash(path, q) {
    const qs = Object.entries(q || {}).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    return `#${path}${qs ? "?" + qs : ""}`;
  }
  DH.router = {
    get: parseHash,
    go(path, q) { const cur = parseHash(); const keep = cur.q.state ? { state: cur.q.state } : {}; location.hash = buildHash(path, Object.assign(keep, q || {})); },
    set(patch) { const cur = parseHash(); location.hash = buildHash(cur.path, Object.assign({}, cur.q, patch)); },
    href(path, q) { return buildHash(path, q); },
  };
  DH.useRoute = function () {
    const [r, setR] = useState(parseHash());
    useEffect(() => { const cb = () => setR(parseHash()); window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); }, []);
    return r;
  };
  // wall-clock ticker for "heartbeat 3 s ago" style labels
  DH.useNow = function (ms = 1000) {
    const [n, setN] = useState(Date.now());
    useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
    return n;
  };

  /* ---------- demand model (prototype only) ---------------------------------------------- */
  const g = (h, mu, sd) => Math.exp(-0.5 * Math.pow((((h - mu + 36) % 24) - 12) / sd, 2));
  const profiles = {
    hotel: (h) => 0.7 + 0.55 * g(h, 7, 1.8) + 0.65 * g(h, 19.5, 2.4),
    block: (h) => 0.65 + 0.6 * g(h, 6.8, 1.6) + 0.75 * g(h, 19.5, 2.6),
    pool: (h) => 0.6 + 0.7 * g(h, 9, 2.8) + 0.5 * g(h, 17, 2.8),
    plant: (h) => 0.55 + 0.75 * g(h, 11, 4.5),
    laundry: (h) => 0.35 + 1.05 * g(h, 10.5, 3.6),
    farm: (h) => 0.6 + 0.7 * g(h, 6, 1.5) + 0.6 * g(h, 17.5, 1.6),
  };
  const profile = (type, h) => (profiles[type] || profiles.plant)(h);

  /* ---------- derived views ----------------------------------------------------------------- */
  function derive(st) {
    const tasksByServer = {}, pausedByServer = {};
    st.tasks.forEach((t) => {
      if (!t.serverId) return;
      if (t.state === "running") (tasksByServer[t.serverId] = tasksByServer[t.serverId] || []).push(t);
      if (t.state === "paused") (pausedByServer[t.serverId] = pausedByServer[t.serverId] || []).push(t);
    });
    st.servers.forEach((s) => {
      const run = s.status === "offline" ? [] : tasksByServer[s.id] || [];
      const brief = (t) => ({ id: t.id, name: t.name, jobId: t.jobId, powerKw: t.powerKw, priority: t.priority, filler: t.filler, progressPct: t.progressPct });
      s.tasks = run.map(brief);
      s.pausedTasks = (pausedByServer[s.id] || []).map(brief); // GAP: backend lists running tasks only
      s.loadKw = +run.reduce((a, t) => a + t.powerKw, 0).toFixed(3);
    });
    st.sites.forEach((site) => {
      const srv = st.servers.filter((s) => s.siteId === site.id);
      site.serversTotal = srv.length;
      site.serversRunning = srv.filter((s) => s.loadKw > 0).length;
      site.capacityKw = srv.reduce((a, s) => a + s.capacityKw, 0);
      site.loadKw = +srv.reduce((a, s) => a + s.loadKw, 0).toFixed(3);
      site.live = srv.some((s) => s.live);
    });
    const now = new Date(st.scheduler.currentTime).getTime();
    const byId = Object.fromEntries(st.tasks.map((t) => [t.id, t]));
    const finishMemo = {};
    const finishAt = (t) => {
      if (finishMemo[t.id] != null) return finishMemo[t.id];
      if (t.state === "done") return (finishMemo[t.id] = new Date(t.finished).getTime());
      const deps = Math.max(now, ...t.dependsOn.map((d) => (byId[d] ? finishAt(byId[d]) : now)));
      return (finishMemo[t.id] = deps + t.runtimeMin * 60000 * (1 - t.progressPct / 100));
    };
    st.tasks.forEach((t) => {
      const open = !["done", "missed", "cancelled"].includes(t.state);
      t.estimatedFinish = open ? fmt.iso(finishAt(t)) : null;
      t.slackMin = open ? Math.round((new Date(t.deadline).getTime() - finishAt(t)) / 60000) : null; // derived client-side
    });
    st.jobs.forEach((j) => {
      const ts = j.taskIds.map((id) => byId[id]).filter(Boolean);
      const total = ts.reduce((a, t) => a + t.runtimeMin * t.powerKw, 0) || 1;
      j.progressPct = +(ts.reduce((a, t) => a + t.runtimeMin * t.powerKw * t.progressPct, 0) / total).toFixed(1);
      const states = ts.map((t) => t.state);
      j.status = states.every((s) => s === "done") ? "done" : states.includes("missed") ? "missed" : states.includes("cancelled") && states.every((s) => s === "cancelled" || s === "done") ? "cancelled" : states.some((s) => s === "running" || s === "paused" || s === "done") ? "running" : "queued";
      j.costChf = +ts.reduce((a, t) => a + t.energyKwh * st.pricing.computeChfPerServerHour[j.priority], 0).toFixed(2);
      j.heatDeliveredKwh = +ts.reduce((a, t) => a + t.heatDeliveredKwh, 0).toFixed(2);
      const open = j.status === "running" || j.status === "queued";
      const fin = open ? Math.max(...ts.map(finishAt)) : null;
      j.estimatedFinish = fin ? fmt.iso(fin) : null;
      j.slackMin = fin ? Math.round((new Date(j.deadline).getTime() - fin) / 60000) : null;
      j.atRisk = open && j.slackMin != null && j.slackMin < 60;
      j.tasksRunning = states.filter((s) => s === "running").length;
      j.tasksPaused = states.filter((s) => s === "paused").length;
    });
    st.customers.forEach((c) => {
      const js = st.jobs.filter((j) => j.customerId === c.id);
      c.jobsRunning = js.filter((j) => j.status === "running").length;
      c.jobsAtRisk = js.filter((j) => j.atRisk).length;
      c.jobsMissed = js.filter((j) => j.status === "missed").length;
      c.tasksRunning = js.reduce((a, j) => a + j.tasksRunning, 0);
    });
    st.kpis.tasksRunning = st.tasks.filter((t) => t.state === "running").length;
  }

  /* ---------- initial state ------------------------------------------------------------------- */
  function buildHistory(st) {
    const r = SD.rng(42);
    const t0 = new Date(st.scheduler.currentTime).getTime();
    st.timeline = {}; st.daily = {}; st.demandScale = {};
    st.sites.forEach((site) => {
      const h0 = fmt.hour(fmt.iso(t0 - SLOT_MS));
      st.demandScale[site.id] = site.demandKwh / profile(site.type, h0);
      const cap = site.tankCapacityKwh, rows = [];
      let tank = site.tankKwh;
      const cur = { siteId: site.id, time: fmt.iso(t0 - SLOT_MS), demandKwh: site.demandKwh, producedKwh: site.producedKwh, deliveredKwh: site.deliveredKwh, dumpedKwh: site.dumpedKwh, unmetKwh: site.unmetKwh, tankKwh: site.tankKwh, loadKw: site.loadKw, capacityKw: site.capacityKw };
      if (site.status !== "offline") rows.push(cur);
      for (let k = 1; k < 96; k++) {
        const ms = t0 - SLOT_MS * (k + 1);
        const demand = +(st.demandScale[site.id] * profile(site.type, fmt.hour(fmt.iso(ms))) * (0.95 + r() * 0.1)).toFixed(3);
        let produced, dumped = 0, unmet = 0, prev;
        if (site.status === "unmet") {
          produced = Math.min(demand * (0.55 + r() * 0.2), site.capacityKw * SLOT_H * RECOVERY * (0.7 + r() * 0.3)); unmet = demand - produced; prev = 0;
        } else if (site.status === "dumping") {
          if (k <= 9) { dumped = 1.5 + r() * 0.9; produced = demand + dumped; prev = cap; }
          else { const d = Math.min(tank - cap * 0.3, 0.7 + r() * 1.1); prev = tank - Math.max(0, d); produced = demand + (tank - prev); }
        } else if (site.status === "tank_low") {
          produced = demand * (0.5 + r() * 0.25); prev = Math.min(cap * 0.82, tank + (demand - produced)); produced = demand - (prev - tank);
        } else {
          const lo = cap * 0.35, hi = cap * 0.93; prev = Math.max(lo, Math.min(hi, tank - (r() - 0.5) * cap * 0.035));
          produced = demand + (tank - prev); if (produced < 0) { produced = 0; prev = tank + demand; }
          if (site.status === "offline" && k < 3) { tank = prev; continue; }
        }
        const row = { siteId: site.id, time: fmt.iso(ms), demandKwh: demand, producedKwh: +produced.toFixed(3), deliveredKwh: +(demand - unmet).toFixed(3), dumpedKwh: +dumped.toFixed(3), unmetKwh: +unmet.toFixed(3), tankKwh: +tank.toFixed(2), loadKw: +(produced / SLOT_H / RECOVERY).toFixed(2), capacityKw: site.capacityKw };
        // row k describes the slot BEFORE the one that ended at level "tank"; shift levels by one
        row.tankKwh = +prev.toFixed(2);
        rows.push(row);
        tank = prev;
      }
      st.timeline[site.id] = rows.reverse();
      // day-level history for the History tab (GET /admin/sites/{id}/timeline?resolution=1d)
      const base = { covered: 97, tank_low: 91, dumping: 99, unmet: 68, offline: 88 }[site.status];
      st.daily[site.id] = Array.from({ length: 14 }, (_, i) => {
        const day = fmt.iso(t0 - (13 - i) * 86400000);
        const cov = Math.max(40, Math.min(100, base + (r() - 0.6) * (site.status === "unmet" ? 22 : 9)));
        const dem = site.demandKwh * 96 * (0.85 + r() * 0.3);
        return { time: day, demandKwh: +dem.toFixed(1), deliveredKwh: +((dem * cov) / 100).toFixed(1), coveragePct: +cov.toFixed(1), dumpedKwh: +(site.status === "dumping" ? 18 + r() * 40 : r() < 0.35 ? r() * 9 : 0).toFixed(1) };
      });
    });
  }

  function initState() {
    const c = (x) => JSON.parse(JSON.stringify(x));
    const st = {
      meta: c(SD.meta), sites: c(SD.sites), servers: c(SD.servers), customers: c(SD.customers), jobs: c(SD.jobs), tasks: c(SD.tasks),
      alerts: c(SD.alerts), scheduler: c(SD.scheduler), kpis: c(SD.kpis), results: c(SD.results), simulations: c(SD.simulations),
      assumptions: c(SD.assumptions), pricing: c(SD.pricing), platform: c(SD.platform),
      compute: c(SD.compute), host: c(SD.host),
      stream: [], hostToday: {}, slotsToday: 58, lastSlot: null, seq: 1000, cooldown: {}, jobSeq: 210, tplIdx: 0,
    };
    // order templates for the fake arrivals (prototype only): every sample job can be ordered again
    st.templates = ["J203", "J207", "J205", "J210", "J208", "J201", "J206", "J204", "J202", "J209"].map((id) => { const j = SD.jobs.find((x) => x.id === id); return { job: c(j), spanMs: new Date(j.deadline) - new Date(j.submittedAt), tasks: c(SD.tasks.filter((t) => t.jobId === id)) }; });
    // fleet-wide lifecycle stream, newest first (GAP: no REST endpoint for this today; the build collects it from the WebSocket)
    st.tasks.forEach((t) => t.events.forEach((e) => {
      if (e.kind === "ready") return;
      const sid = (id) => (id ? (st.servers.find((s) => s.id === id) || {}).siteId : null);
      st.stream.push({ id: ++st.seq, time: e.time, kind: e.kind, taskId: t.id, jobId: t.jobId, taskName: t.name, fromServerId: e.fromServerId, toServerId: e.toServerId, fromSite: sid(e.fromServerId), toSite: sid(e.toServerId) });
    }));
    st.stream.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : b.id - a.id));
    const today = SD.host.energy.day;
    st.hostToday[SD.host.user.siteId] = { demandKwh: today.reduce((a, b) => a + b.demandKwh, 0), serverHeatKwh: today.reduce((a, b) => a + b.serverHeatKwh, 0), backupHeatKwh: today.reduce((a, b) => a + b.backupHeatKwh, 0) };
    derive(st);
    buildHistory(st);
    return st;
  }

  /* ---------- reducer: apply one backend-shaped message to the store -------------------------- */
  function receive(msg) {
    const st = store.state, d = msg.data;
    switch (msg.type) {
      case "clock.tick": Object.assign(st.scheduler, d); break;
      case "slot.tick": {
        const site = st.sites.find((s) => s.id === d.siteId); if (!site) break;
        Object.assign(site, { status: d.status, demandKwh: d.demandKwh, producedKwh: d.producedKwh, deliveredKwh: d.deliveredKwh, dumpedKwh: d.dumpedKwh, unmetKwh: d.unmetKwh, tankKwh: d.tankKwh });
        const tl = st.timeline[d.siteId]; tl.push({ siteId: d.siteId, time: d.time, demandKwh: d.demandKwh, producedKwh: d.producedKwh, deliveredKwh: d.deliveredKwh, dumpedKwh: d.dumpedKwh, unmetKwh: d.unmetKwh, tankKwh: d.tankKwh, loadKw: d.loadKw, capacityKw: d.capacityKw });
        if (tl.length > 192) tl.shift();
        const ht = st.hostToday[d.siteId];
        if (ht) { ht.demandKwh += d.demandKwh; ht.serverHeatKwh += d.deliveredKwh; ht.backupHeatKwh += d.unmetKwh; }
        break;
      }
      case "kpi.update": { // backend sends the KPIs of this slot; "today" is accumulated here
        const k = st.kpis, n = st.slotsToday;
        ["demandKwh", "deliveredKwh", "dumpedKwh", "unmetKwh", "electricityKwh", "electricityCostChf", "heatValueChf", "computeIncomeChf", "serverHoursSold", "serverRunningH"].forEach((f) => { k[f] += d[f] || 0; });
        k.coveragePct = (100 * k.deliveredKwh) / k.demandKwh;
        k.utilisationPct = (k.utilisationPct * n + d.utilisationPct) / (n + 1);
        k.breakEvenChfPerServerHour = (k.electricityCostChf - k.heatValueChf) / k.serverHoursSold;
        k.marginChf = k.computeIncomeChf + k.heatValueChf - k.electricityCostChf;
        st.slotsToday = n + 1; st.lastSlot = d;
        break;
      }
      case "agents.update": d.items.forEach((a) => { const s = st.servers.find((x) => x.id === a.serverId); if (s) { s.cpuPct = a.cpuPct; s.lastHeartbeat = a.lastSeen; } }); break;
      case "alert.raised": st.alerts.unshift(Object.assign({ isNew: true }, d)); if (st.alerts.length > 60) st.alerts.pop(); break;
      default:
        if (msg.type.startsWith("task.")) {
          const t = st.tasks.find((x) => x.id === d.taskId); if (!t) break;
          const kind = d.kind, srv = (id) => st.servers.find((s) => s.id === id);
          if (kind === "ready") t.state = "ready";
          if (kind === "started" || kind === "migrated" || kind === "resumed") { t.state = "running"; if (d.toServerId) { t.serverId = d.toServerId; t.siteId = srv(d.toServerId).siteId; } }
          if (kind === "paused") t.state = "paused";
          if (kind === "completed") { t.state = "done"; t.progressPct = 100; t.finished = msg.time; }
          if (kind === "missed") t.state = "missed";
          if (kind === "cancelled") t.state = "cancelled";
          if (kind === "server_lost") { t.state = "ready"; t.serverId = null; t.siteId = null; }
          if (d.hold != null) t.hold = d.hold;
          t.events.push({ time: msg.time, kind, fromServerId: d.fromServerId || null, toServerId: d.toServerId || null });
          if (kind !== "ready") { st.stream.unshift({ id: ++st.seq, time: msg.time, kind, taskId: t.id, jobId: t.jobId, taskName: t.name, fromServerId: d.fromServerId || null, toServerId: d.toServerId || null, fromSite: d.fromSite || null, toSite: d.toSite || null, isNew: true, by: d.by }); if (st.stream.length > 240) st.stream.pop(); }
        }
    }
  }
  DH.receive = function (msg) { receive(msg); derive(store.state); store.notify(); DH.bus.dispatch(msg); };

  /* ---------- engine: a small greedy scheduler + tank physics ---------------------------------- */
  const engine = { timer: null, hb: null, rnd: SD.rng(2025) };
  let out = [];
  const push = (type, channel, time, data) => { const m = { type, channel, time, data }; receive(m); out.push(m); };

  function taskEvent(kind, t, time, extra) {
    const st = store.state;
    const srvSite = (id) => (id ? (st.servers.find((s) => s.id === id) || {}).siteId : null);
    const data = Object.assign({ taskId: t.id, jobId: t.jobId, kind, fromServerId: null, toServerId: null }, extra || {});
    data.fromSite = srvSite(data.fromServerId); data.toSite = srvSite(data.toServerId);
    push("task." + kind, "fleet", time, data);
  }

  function tick(silent) {
    const st = store.state, sch = st.scheduler, r = engine.rnd;
    const nowMs = new Date(sch.currentTime).getTime(), time = sch.currentTime;
    out = [];
    const site = (id) => st.sites.find((s) => s.id === id);
    const pct = (s) => s.tankKwh / s.tankCapacityKwh;
    const running = (srvId) => st.tasks.filter((t) => t.serverId === srvId && t.state === "running");
    const free = (srv) => srv.capacityKw - running(srv.id).reduce((a, t) => a + t.powerKw, 0);
    // heat a site would produce in one slot with the work placed there right now
    const prod = (s) => st.servers.filter((x) => x.siteId === s.id && x.status === "online").reduce((a, x) => a + running(x.id).reduce((b, t) => b + t.powerKw, 0), 0) * SLOT_H * RECOVERY;
    // how much a site wants more compute: the share of demand not met by production, plus the room left in its tank
    const need = (s) => (s.demandKwh - prod(s)) / Math.max(0.4, s.demandKwh) + (0.55 - pct(s)) * 1.5;
    const findServer = (power, minNeed, excludeSite) => st.servers
      .filter((s) => s.status === "online" && s.siteId !== excludeSite && free(s) >= power - 1e-9 && need(site(s.siteId)) > minNeed)
      .sort((a, b) => need(site(b.siteId)) - need(site(a.siteId)) || free(b) - free(a))[0];
    const cool = (id) => (st.cooldown[id] || 0) > sch.slot;
    const setCool = (id, n) => { st.cooldown[id] = sch.slot + n; };
    const openStates = ["waiting", "ready", "running", "paused"];

    // new orders arrive so the demo never runs dry: open work stays a little above what the hosts can use as heat
    const wantKw = (1.3 * st.sites.filter((s) => s.status !== "offline").reduce((a, s) => a + s.demandKwh, 0)) / (SLOT_H * RECOVERY);
    for (let add = 0; add < 2 && st.tasks.filter((t) => openStates.includes(t.state)).reduce((a, t) => a + t.powerKw, 0) < wantKw; add++) {
      const tpl = st.templates[st.tplIdx++ % st.templates.length], id = "J" + ++st.jobSeq, map = {};
      tpl.tasks.forEach((t) => { map[t.id] = t.id.replace(tpl.job.id, id); });
      tpl.tasks.forEach((t) => st.tasks.push(Object.assign({}, t, { id: map[t.id], jobId: id, state: "waiting", progressPct: 0, energyKwh: 0, heatDeliveredKwh: 0, serverId: null, siteId: null, finished: null, hold: false, arrival: time, deadline: fmt.iso(nowMs + tpl.spanMs), dependsOn: t.dependsOn.map((d) => map[d]), events: [] })));
      st.jobs.unshift(Object.assign({}, tpl.job, { id, submittedAt: time, deadline: fmt.iso(nowMs + tpl.spanMs), taskIds: tpl.tasks.map((t) => map[t.id]) }));
      // keep the lists bounded: drop the oldest closed job
      const closed = st.jobs.filter((j) => ["done", "missed", "cancelled"].includes(j.status));
      if (closed.length > 6) { const old = closed[closed.length - 1]; st.jobs = st.jobs.filter((j) => j.id !== old.id); st.tasks = st.tasks.filter((t) => t.jobId !== old.id); }
    }

    // a. dependencies satisfied -> ready
    st.tasks.forEach((t) => { if (t.state === "waiting" && t.dependsOn.every((d) => { const x = st.tasks.find((y) => y.id === d); return !x || x.state === "done"; })) taskEvent("ready", t, time); });
    // b. paused by the scheduler: move to a site that needs heat, or resume when this site needs heat again
    st.tasks.filter((t) => t.state === "paused" && !t.hold).forEach((t) => {
      const here = site(t.siteId), srv = st.servers.find((s) => s.id === t.serverId);
      const target = findServer(t.powerKw, 0.2, t.siteId);
      if (target && !cool(here.id)) { taskEvent("migrated", t, time, { fromServerId: t.serverId, toServerId: target.id }); setCool(here.id, 2); }
      else if (need(here) > 0 && srv && srv.status === "online" && free(srv) >= t.powerKw) taskEvent("resumed", t, time, { toServerId: t.serverId });
    });
    // c. tank full and still producing more than the host uses: move flexible work to a site that needs heat, otherwise pause it
    const thr = sch.algorithm === "mpc" ? 0.985 : 0.9999;
    st.sites.filter((s) => s.status !== "offline" && pct(s) >= thr && prod(s) > s.demandKwh && !cool(s.id)).forEach((s) => {
      const cand = st.tasks.filter((t) => t.siteId === s.id && t.state === "running" && t.priority === "flexible" && t.interruptible).sort((a, b) => a.progressPct - b.progressPct)[0];
      if (!cand) return;
      const target = findServer(cand.powerKw, 0.2, s.id);
      if (target) taskEvent("migrated", cand, time, { fromServerId: cand.serverId, toServerId: target.id });
      else taskEvent("paused", cand, time, { fromServerId: cand.serverId });
      setCool(s.id, sch.algorithm === "mpc" ? 4 : 6);
    });
    // d. place ready tasks where heat is needed most. Critical or urgent work runs anywhere there is room.
    const rank = { critical: 0, normal: 1, flexible: 2 };
    st.tasks.filter((t) => t.state === "ready" && !t.hold).sort((a, b) => rank[a.priority] - rank[b.priority]).forEach((t) => {
      const urgent = t.priority === "critical" || new Date(t.deadline).getTime() - nowMs - t.runtimeMin * 60000 * (1 - t.progressPct / 100) < 45 * 60000;
      const s = findServer(t.powerKw, urgent ? -1e9 : -0.15);
      if (s) taskEvent("started", t, time, { toServerId: s.id });
    });
    derive(st);

    // e. tank physics per site, one slot
    const hour = fmt.hour(time);
    let fleet = { demandKwh: 0, deliveredKwh: 0, dumpedKwh: 0, unmetKwh: 0, electricityKwh: 0 };
    st.sites.forEach((s) => {
      if (s.status === "offline") return;
      const demand = +(st.demandScale[s.id] * profile(s.type, hour) * (0.96 + r() * 0.08)).toFixed(3);
      const produced = +(s.loadKw * SLOT_H * RECOVERY).toFixed(3);
      let tank = s.tankKwh + produced - demand, dumped = 0, unmet = 0;
      if (tank > s.tankCapacityKwh) { dumped = tank - s.tankCapacityKwh; tank = s.tankCapacityKwh; }
      if (tank < 0) { unmet = -tank; tank = 0; }
      const status = unmet > 1e-6 ? "unmet" : dumped > 1e-6 ? "dumping" : tank < 0.2 * s.tankCapacityKwh ? "tank_low" : "covered";
      const prev = s.status;
      push("slot.tick", "fleet", time, { siteId: s.id, slot: sch.slot, demandKwh: demand, producedKwh: produced, deliveredKwh: +(demand - unmet).toFixed(3), dumpedKwh: +dumped.toFixed(3), unmetKwh: +unmet.toFixed(3), tankKwh: +tank.toFixed(3), loadKw: s.loadKw, capacityKw: s.capacityKw, serversRunning: s.serversRunning, serversTotal: s.serversTotal, time, status, prevStatus: prev });
      fleet.demandKwh += demand; fleet.deliveredKwh += demand - unmet; fleet.dumpedKwh += dumped; fleet.unmetKwh += unmet; fleet.electricityKwh += s.loadKw * SLOT_H;
      if (status !== prev && status === "unmet") push("alert.raised", "fleet", time, { id: ++st.seq, slot: sch.slot, time, severity: "critical", kind: "unmet_demand", siteId: s.id, serverId: null, jobId: null, message: `${s.name}: backup heater needed`, acknowledged: false });
      if (status !== prev && status === "dumping") push("alert.raised", "fleet", time, { id: ++st.seq, slot: sch.slot, time, severity: "warning", kind: "heat_dumped", siteId: s.id, serverId: null, jobId: null, message: `${s.name}: tank full, heat is being dumped`, acknowledged: false });
    });

    // f. progress, completion, deadlines
    st.tasks.forEach((t) => {
      if (t.state === "running") {
        t.progressPct = Math.min(100, +(t.progressPct + 1500 / t.runtimeMin).toFixed(1));
        t.energyKwh = +(t.energyKwh + t.powerKw * SLOT_H).toFixed(3); t.heatDeliveredKwh = +(t.energyKwh * RECOVERY).toFixed(3);
        if (t.progressPct >= 100) taskEvent("completed", t, time, { fromServerId: t.serverId });
      } else if (["ready", "paused", "waiting"].includes(t.state) && new Date(t.deadline).getTime() < nowMs) {
        taskEvent("missed", t, time, {});
        push("alert.raised", "fleet", time, { id: ++st.seq, slot: sch.slot, time, severity: "warning", kind: "deadline_missed", siteId: null, serverId: null, jobId: t.jobId, message: `Task ${t.id} of job ${t.jobId} missed its deadline`, acknowledged: false });
      }
    });
    derive(st);
    st.jobs.forEach((j) => { if (j.status === "done" && !j.finished) j.finished = time; });

    // g. KPIs of this slot (economics here are illustrative: see README)
    const cost = fleet.electricityKwh * st.pricing.electricityChfPerKwh, heatValue = fleet.deliveredKwh * st.pricing.heatValueChfPerKwh;
    const sold = (cost - heatValue) / (0.42 * (0.97 + r() * 0.06));
    const online = st.servers.filter((s) => s.status === "online");
    push("kpi.update", "fleet", time, {
      coveragePct: (100 * fleet.deliveredKwh) / fleet.demandKwh, demandKwh: fleet.demandKwh, deliveredKwh: fleet.deliveredKwh, dumpedKwh: fleet.dumpedKwh, unmetKwh: fleet.unmetKwh,
      utilisationPct: (100 * st.servers.filter((s) => s.loadKw > 0).length) / st.servers.length, serverRunningH: online.filter((s) => s.loadKw > 0).length * SLOT_H,
      tasksRunning: st.kpis.tasksRunning, electricityKwh: fleet.electricityKwh, electricityCostChf: cost, heatValueChf: heatValue,
      computeIncomeChf: sold * 2.44 * (0.9 + r() * 0.2), serverHoursSold: sold,
    });

    // h. advance the clock
    const next = fmt.iso(nowMs + SLOT_MS);
    push("clock.tick", "fleet", time, Object.assign({}, sch, { slot: sch.slot + 1, currentTime: next, progressPct: +(((sch.slot + 1) / sch.slotsTotal) * 100).toFixed(2) }));
    if (!silent) { const msgs = out; out = []; store.notify(); msgs.forEach((m) => DH.bus.dispatch(m)); }
  }

  function restart() {
    clearInterval(engine.timer);
    const sch = store.state.scheduler;
    if (!sch.paused && sch.mode !== "jumping") engine.timer = setInterval(() => { if (["live", undefined].includes(store.state.ui.dataState)) tick(false); }, sch.slotSeconds * 1000);
  }

  /* controls: same contract as the REST endpoints */
  DH.api = {
    // PUT /admin/scheduler {slotSeconds?, paused?, algorithm?}
    putScheduler(patch) {
      const sch = store.state.scheduler;
      if (patch.slotSeconds != null) sch.slotSeconds = patch.slotSeconds;
      if (patch.algorithm) sch.algorithm = patch.algorithm;
      if (patch.paused != null) { sch.paused = patch.paused; sch.mode = patch.paused ? "paused" : "live"; }
      restart(); store.notify();
    },
    // POST /admin/scheduler/jump {to}: forward only
    jump(toIso) {
      const st = store.state, sch = st.scheduler, target = new Date(toIso).getTime();
      if (target <= new Date(sch.currentTime).getTime()) return false;
      clearInterval(engine.timer); sch.mode = "jumping"; sch.jumpTarget = toIso; store.notify();
      const step = () => {
        let n = 0;
        while (new Date(sch.currentTime).getTime() < target && n++ < 12) tick(true);
        store.notify();
        if (new Date(sch.currentTime).getTime() < target) setTimeout(step, 60);
        else { sch.mode = sch.paused ? "paused" : "live"; sch.jumpTarget = null; st.stream.forEach((e) => (e.isNew = false)); st.alerts.forEach((a) => (a.isNew = false)); out = []; restart(); store.notify(); DH.bus.dispatch({ type: "clock.tick", channel: "fleet", time: sch.currentTime, data: sch }); }
      };
      setTimeout(step, 250);
      return true;
    },
    // POST /admin/scheduler/reset
    reset() { clearInterval(engine.timer); const ui = store.state.ui; engine.rnd = SD.rng(2025); store.state = initState(); store.state.ui = ui; restart(); store.notify(); DH.bus.dispatch({ type: "clock.tick", channel: "fleet", time: store.state.scheduler.currentTime, data: store.state.scheduler }); },
    // POST /admin/tasks/{id}/{pause|resume|cancel}  and  POST /customer/jobs/{id}/cancel
    taskAction(taskId, action) {
      const st = store.state, t = st.tasks.find((x) => x.id === taskId), time = st.scheduler.currentTime; if (!t) return;
      const kind = { pause: "paused", resume: "resumed", cancel: "cancelled" }[action];
      const data = { taskId, jobId: t.jobId, kind, fromServerId: action === "resume" ? null : t.serverId, toServerId: action === "resume" ? t.serverId : null, hold: action === "pause", by: "operator" };
      if (action === "resume" && !t.serverId) { t.hold = false; t.state = "ready"; derive(st); store.notify(); return; }
      DH.receive({ type: "task." + kind, channel: "fleet", time, data });
    },
    cancelJob(jobId) { const st = store.state; st.tasks.filter((t) => t.jobId === jobId && !["done", "missed", "cancelled"].includes(t.state)).forEach((t) => DH.api.taskAction(t.id, "cancel")); },
    // PATCH /admin/events/{id} {acknowledged}
    ackAlert(id, acknowledged = true) { store.update((st) => { const a = st.alerts.find((x) => x.id === id); if (a) { a.acknowledged = acknowledged; a.isNew = false; } }); },
    // POST /customer/jobs  (body = JobSubmit in api/schemas.py)
    submitJob(body) {
      const st = store.state, now = st.scheduler.currentTime, id = "J" + ++st.jobSeq;
      const deadline = body.deadline || fmt.iso(new Date(now).getTime() + (body.deadlineInMin || 600) * 60000);
      const job = { id, customerId: body.customerId, name: body.name || "Untitled job", workCategory: "AI compute", priority: body.priority, submittedAt: now, deadline, taskIds: [] };
      body.tasks.forEach((ts, i) => {
        const tid = `${id}-${ts.taskId || "T" + (i + 1)}`;
        job.taskIds.push(tid);
        st.tasks.push({ id: tid, jobId: id, name: ts.name || ts.taskId || `task ${i + 1}`, state: "waiting", priority: body.priority, runtimeMin: ts.runtimeMin, powerKw: ts.powerKw, threads: 1, interruptible: ts.interruptible !== false, dependsOn: (ts.dependsOn || []).map((d) => `${id}-${d}`), arrival: now, deadline, siteId: null, serverId: null, progressPct: 0, energyKwh: 0, heatDeliveredKwh: 0, filler: false, hold: false, finished: null, events: [] });
      });
      st.jobs.unshift(job); derive(st); store.notify();
      return job;
    },
    // PATCH /site/notifications/{id} {read}
    readNotification(id, read = true) { store.update((st) => { const n = st.host.notifications.find((x) => x.id === id); if (n) n.read = read; }); },
  };

  /* ---------- selectors that return REST-shaped views ------------------------------------------- */
  DH.sel = {
    site: (st, id) => st.sites.find((s) => s.id === id),
    server: (st, id) => st.servers.find((s) => s.id === id),
    task: (st, id) => st.tasks.find((t) => t.id === id),
    job: (st, id) => st.jobs.find((j) => j.id === id),
    customer: (st, id) => st.customers.find((c) => c.id === id),
    serversOf: (st, siteId) => st.servers.filter((s) => s.siteId === siteId),
    tasksAt: (st, siteId) => st.tasks.filter((t) => t.siteId === siteId && (t.state === "running" || t.state === "paused")),
    tasksOfJob: (st, jobId) => st.tasks.filter((t) => t.jobId === jobId),
    unacked: (st) => st.alerts.filter((a) => !a.acknowledged),
    // GET /customer/overview
    customerOverview(st, cid) {
      const js = st.jobs.filter((j) => j.customerId === cid), hist = st.compute.jobHistory;
      const month = st.compute.usage.filter((u) => u.month.startsWith("2025-10")).reduce((a, u) => a + u.costChf, 0);
      return { jobsRunning: js.filter((j) => j.status === "running").length, jobsQueued: js.filter((j) => j.status === "queued").length, jobsDone: hist.filter((j) => j.status === "done").length + js.filter((j) => j.status === "done").length + 34, jobsMissed: hist.filter((j) => j.status === "missed").length, jobsAtRisk: js.filter((j) => j.atRisk).map((j) => j.id), spendMonthChf: month + js.reduce((a, j) => a + j.costChf, 0), heatDeliveredKwh: st.compute.impact.heatDeliveredKwh + js.reduce((a, j) => a + j.heatDeliveredKwh, 0) };
    },
    // GET /site/sites/{id}/overview
    hostOverview(st, siteId) {
      const s = DH.sel.site(st, siteId), t = st.hostToday[siteId] || { demandKwh: 0, serverHeatKwh: 0, backupHeatKwh: 0 };
      const share = t.demandKwh ? (100 * t.serverHeatKwh) / t.demandKwh : 0;
      const month = st.host.savings.months[st.host.savings.months.length - 1];
      const statusMessage = s.status === "offline" ? "We cannot reach your installation right now. Your backup heater keeps the hot water running."
        : s.status === "unmet" ? "Your backup heater is helping right now. Recovered heat covers the rest."
        : t.backupHeatKwh < 0.05 ? "Your hot water is fully covered by recovered heat today."
        : `Recovered heat covered ${fmt.pct(share)} % of your heat demand today. Your backup heater supplied the rest.`;
      return { serverHeatSharePctToday: share, serverHeatTodayKwh: t.serverHeatKwh /* GAP: derived from /energy?period=day */, tankKwh: s.tankKwh, tankCapacityKwh: s.tankCapacityKwh, serversWorking: s.serversRunning, serversTotal: s.serversTotal, savingsMonthChf: month.valueChf + (t.serverHeatKwh - st.host.energy.day.reduce((a, b) => a + b.serverHeatKwh, 0)) * st.pricing.heatValueChfPerKwh, backupHeatTodayKwh: t.backupHeatKwh, statusMessage, status: s.status, time: st.scheduler.currentTime };
    },
    // GET /site/sites/{id}/servers: plain words, never customer names or task data
    hostServers(st, siteId) {
      return DH.sel.serversOf(st, siteId).map((s, i) => {
        const kinds = [...new Set(s.tasks.map((t) => { const j = DH.sel.job(st, t.jobId), c = j && DH.sel.customer(st, j.customerId); return j ? `${j.workCategory} for ${c ? c.sectorPhrase : "a Swiss organisation"}` : "AI compute"; }))];
        return { name: `Server ${i + 1}`, capacityKw: s.capacityKw, loadKw: s.loadKw, status: s.status === "offline" ? "offline" : s.tasks.length ? "working" : "idle", workKind: kinds.join(" · ") || null, live: s.live };
      });
    },
  };

  /* ---------- boot ---------------------------------------------------------------------------------- */
  DH.boot = function (opts) {
    store.state = initState();
    const q = parseHash().q;
    store.state.ui = { dataState: q.state || "live", intro: !!(opts && opts.intro) && !DH.reducedMotion && q.intro !== "0" };
    if (DH.reducedMotion) document.documentElement.classList.add("reduced-motion");
    window.addEventListener("hashchange", () => { const s = parseHash().q.state || "live"; if (s !== store.state.ui.dataState) { store.state.ui.dataState = s; store.notify(); } });
    restart();
    // heartbeat of the LIVE laptops (WS agents.update), wall-clock, independent of the simulated clock
    engine.hb = setInterval(() => {
      const st = store.state; if (st.ui.dataState !== "live") return;
      const items = st.servers.filter((s) => s.live && s.status === "online").map((s) => ({ serverId: s.id, siteId: s.siteId, host: s.host, online: true, cpuPct: Math.max(8, Math.min(98, Math.round((s.loadKw / s.capacityKw) * 88 + (Math.random() - 0.5) * 10))), lastSeen: new Date().toISOString() }));
      DH.receive({ type: "agents.update", channel: "fleet", time: st.scheduler.currentTime, data: { mqtt: st.scheduler.mqtt, items } });
    }, 2000);
    if (q.tick) for (let i = 0; i < Number(q.tick); i++) tick(true); // deterministic fast-forward for screenshots
    return store.state;
  };
  DH.engine = { tick: () => tick(false) };
})();
