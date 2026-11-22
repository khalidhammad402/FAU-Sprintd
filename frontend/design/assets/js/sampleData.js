/* ==========================================================================
   DigitalHeat sampleData: the ONE place where prototype data lives.

   ILLUSTRATIVE: every value in this file is invented for the design prototype.
   Shapes and field names follow the real backend (docs/BACKEND_HANDOFF.md,
   docs/openapi.json): camelCase, kWh per 15-min slot, kW, CHF, ISO 8601 with
   Europe/Zurich offset. To go live, replace each block with the endpoint named
   in its comment. Fields the backend does not have yet are marked  // GAP.
   ========================================================================== */
(function () {
  const DH = (window.DH = window.DH || {});

  const T0 = "2025-10-22T14:30:00+02:00"; // "now" of the simulated scheduler clock

  /* GET /meta ------------------------------------------------------------- */
  const meta = {
    name: "DigitalHeat",
    version: "1.1",
    slotMinutes: 15,
    periodStart: "2025-01-01T00:00:00+01:00",
    periodEnd: "2026-01-01T00:00:00+01:00",
    slotsTotal: 35040,
    mapCenter: { lat: 47.5596, lon: 7.6005, pitch: 55, zoom: 13 },
    illustrative: true,
  };

  /* GET /admin/sites  (+ /admin/map/sites as GeoJSON) --------------------------
     type: backend has household|farm|hotel|spa|business.
     GAP: the design needs hotel|pool|plant|laundry|block|farm (glyph per host type)
     GAP: status "offline" (all servers of the site unreachable) is not a backend value */
  const sites = [
    { id: "HOTEL1", name: "Hotel Merian", type: "hotel", hostType: "Hotel", lat: 47.5614, lon: 7.5912, buildingHeightM: 22, tankCapacityKwh: 35, owner: "hotel1owner",
      status: "covered", demandKwh: 1.4, producedKwh: 1.5, deliveredKwh: 1.4, dumpedKwh: 0, unmetKwh: 0, tankKwh: 27.3, loadKw: 7.5, capacityKw: 10, serversRunning: 2, serversTotal: 2 },
    { id: "POOL1", name: "Hallenbad Gundeli", type: "pool", hostType: "Indoor pool", lat: 47.5412, lon: 7.5935, buildingHeightM: 14, tankCapacityKwh: 70, owner: "pool1owner",
      status: "covered", demandKwh: 4.5, producedKwh: 4.2, deliveredKwh: 4.5, dumpedKwh: 0, unmetKwh: 0, tankKwh: 57.4, loadKw: 21, capacityKw: 30, serversRunning: 3, serversTotal: 3 },
    { id: "PHARMA1", name: "Pharma Park Kleinhüningen", type: "plant", hostType: "Pharma plant", lat: 47.5846, lon: 7.5945, buildingHeightM: 28, tankCapacityKwh: 35, owner: "pharma1owner",
      status: "dumping", demandKwh: 2.4, producedKwh: 4.6, deliveredKwh: 2.4, dumpedKwh: 2.2, unmetKwh: 0, tankKwh: 35, loadKw: 23, capacityKw: 30, serversRunning: 3, serversTotal: 3 },
    { id: "BREW1", name: "Brauerei Basel Nord", type: "plant", hostType: "Food plant", lat: 47.5742, lon: 7.6062, buildingHeightM: 18, tankCapacityKwh: 35, owner: "brew1owner",
      status: "covered", demandKwh: 1.8, producedKwh: 1.7, deliveredKwh: 1.8, dumpedKwh: 0, unmetKwh: 0, tankKwh: 21.0, loadKw: 8.5, capacityKw: 20, serversRunning: 2, serversTotal: 2 },
    { id: "LAUNDRY1", name: "Wäscherei Rhein", type: "laundry", hostType: "Laundry", lat: 47.5598, lon: 7.6168, buildingHeightM: 10, tankCapacityKwh: 35, owner: "laundry1owner",
      status: "tank_low", demandKwh: 0.9, producedKwh: 0.6, deliveredKwh: 0.9, dumpedKwh: 0, unmetKwh: 0, tankKwh: 5.6, loadKw: 3, capacityKw: 10, serversRunning: 1, serversTotal: 2 },
    { id: "BLOCK1", name: "Wohnblock Matthäus", type: "block", hostType: "Apartment block, 64 units", lat: 47.5688, lon: 7.5918, buildingHeightM: 26, tankCapacityKwh: 35, owner: "block1owner",
      status: "unmet", demandKwh: 1.5, producedKwh: 0.9, deliveredKwh: 0.9, dumpedKwh: 0, unmetKwh: 0.6, tankKwh: 0, loadKw: 4.5, capacityKw: 5, serversRunning: 1, serversTotal: 1 },
    { id: "FARM1", name: "Schönbühl Farm", type: "farm", hostType: "Farm, dairy", lat: 47.5368, lon: 7.6292, buildingHeightM: 9, tankCapacityKwh: 35, owner: "farm1owner",
      status: "offline", demandKwh: 0.7, producedKwh: 0, deliveredKwh: 0, dumpedKwh: 0, unmetKwh: 0.7, tankKwh: 9.8, loadKw: 0, capacityKw: 5, serversRunning: 0, serversTotal: 1,
      lastSeen: "2025-10-22T13:45:00+02:00" },
  ];

  /* GET /admin/servers ----------------------------------------------------------
     live: true = a real process on a laptop (LIVE). Everything else is SIMULATED. */
  const servers = [
    { id: "HOTEL1-S1", siteId: "HOTEL1", capacityKw: 5, status: "online", live: true, cpuPct: 71, lastHeartbeat: T0, host: "demo-laptop-01" },
    { id: "HOTEL1-S2", siteId: "HOTEL1", capacityKw: 5, status: "online", live: false, cpuPct: 0, lastHeartbeat: null },
    { id: "POOL1-S1", siteId: "POOL1", capacityKw: 10, status: "online", live: false, cpuPct: 0, lastHeartbeat: null },
    { id: "POOL1-S2", siteId: "POOL1", capacityKw: 10, status: "online", live: true, cpuPct: 64, lastHeartbeat: T0, host: "demo-laptop-02" },
    { id: "POOL1-S3", siteId: "POOL1", capacityKw: 10, status: "online", live: false, cpuPct: 0, lastHeartbeat: null },
    { id: "PHARMA1-S1", siteId: "PHARMA1", capacityKw: 10, status: "online", live: false, cpuPct: 0, lastHeartbeat: null },
    { id: "PHARMA1-S2", siteId: "PHARMA1", capacityKw: 10, status: "online", live: false, cpuPct: 0, lastHeartbeat: null },
    { id: "PHARMA1-S3", siteId: "PHARMA1", capacityKw: 10, status: "online", live: false, cpuPct: 0, lastHeartbeat: null },
    { id: "BREW1-S1", siteId: "BREW1", capacityKw: 10, status: "online", live: false, cpuPct: 0, lastHeartbeat: null },
    { id: "BREW1-S2", siteId: "BREW1", capacityKw: 10, status: "online", live: false, cpuPct: 0, lastHeartbeat: null },
    { id: "LAUNDRY1-S1", siteId: "LAUNDRY1", capacityKw: 5, status: "online", live: false, cpuPct: 0, lastHeartbeat: null },
    { id: "LAUNDRY1-S2", siteId: "LAUNDRY1", capacityKw: 5, status: "online", live: false, cpuPct: 0, lastHeartbeat: null },
    { id: "BLOCK1-S1", siteId: "BLOCK1", capacityKw: 5, status: "online", live: false, cpuPct: 0, lastHeartbeat: null },
    { id: "FARM1-S1", siteId: "FARM1", capacityKw: 5, status: "offline", live: false, cpuPct: 0, lastHeartbeat: "2025-10-22T13:45:00+02:00" },
  ];

  /* GET /admin/customers ---------------------------------------------------------
     GAP: sector, jobsRunning, jobsAtRisk, heatSharePct are not returned today */
  const customers = [
    { id: "rheinpharm", name: "Rheinpharm AG", sector: "Pharma", sectorPhrase: "a Swiss pharma company", jobs: 42, revenueChf: 4861.4, heatSharePct: 34.2 },
    { id: "dreiland", name: "Bank Dreiland", sector: "Bank", sectorPhrase: "a Swiss bank", jobs: 118, revenueChf: 3975.2, heatSharePct: 21.6 },
    { id: "uninw", name: "Universität Nordwest, ML Lab", sector: "University", sectorPhrase: "a Swiss university", jobs: 67, revenueChf: 1204.9, heatSharePct: 17.9 },
    { id: "alpstack", name: "Alpstack AI", sector: "AI start-up", sectorPhrase: "a Swiss AI start-up", jobs: 31, revenueChf: 2118.6, heatSharePct: 15.1 },
    { id: "kantondigital", name: "Kanton Digital Services", sector: "Public body", sectorPhrase: "a Swiss public body", jobs: 24, revenueChf: 1642.3, heatSharePct: 11.2 },
  ];

  /* GET /admin/jobs + /admin/tasks  (customer view: /customer/jobs) ----------------
     Compact rows -> expanded to the full backend Task shape below.
     workCategory is the plain-words label shown to hosts (never the customer name). */
  const H = (h, m) => `2025-10-22T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+02:00`;
  const D = (d, h, m) => `2025-10-${d}T${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}:00+02:00`;

  const jobs = [
    { id: "J201", customerId: "rheinpharm", name: "Embed document archive", workCategory: "Document indexing", priority: "flexible", submittedAt: H(11, 0), deadline: D(23, 11) },
    { id: "J202", customerId: "rheinpharm", name: "Fine-tune language model", workCategory: "AI model training", priority: "flexible", submittedAt: H(8, 30), deadline: D(25, 8, 30) },
    { id: "J210", customerId: "rheinpharm", name: "Protein-binding screening batch", workCategory: "Scientific simulation", priority: "normal", submittedAt: H(13, 0), deadline: D(23, 1) },
    { id: "J203", customerId: "dreiland", name: "Transcribe call recordings", workCategory: "AI transcription", priority: "critical", submittedAt: H(14, 0), deadline: H(17, 0) },
    { id: "J204", customerId: "dreiland", name: "Transcribe call recordings", workCategory: "AI transcription", priority: "critical", submittedAt: H(13, 45), deadline: H(16, 45) },
    { id: "J205", customerId: "uninw", name: "Hyper-parameter sweep", workCategory: "AI research experiments", priority: "flexible", submittedAt: H(12, 30), deadline: D(24, 12, 30) },
    { id: "J206", customerId: "alpstack", name: "Retrain recommendation model", workCategory: "AI model training", priority: "normal", submittedAt: H(13, 45), deadline: D(23, 1, 45) },
    { id: "J207", customerId: "alpstack", name: "Embed document archive", workCategory: "Document indexing", priority: "flexible", submittedAt: H(13, 30), deadline: D(23, 13, 30) },
    { id: "J208", customerId: "kantondigital", name: "Transcribe council recordings", workCategory: "AI transcription", priority: "critical", submittedAt: H(14, 15), deadline: H(17, 15) },
    { id: "J209", customerId: "kantondigital", name: "Retrain demand-forecast model", workCategory: "AI model training", priority: "normal", submittedAt: H(1, 30), deadline: H(13, 30) },
  ];

  // [id, name, state, runtimeMin, powerKw, progressPct, serverId, dependsOn, interruptible]
  const taskRows = [
    ["J201-T1", "embed batch 1", "running", 90, 4.0, 70, "POOL1-S1", [], true],
    ["J201-T2", "embed batch 2", "running", 90, 4.0, 66, "POOL1-S1", [], true],
    ["J201-T3", "embed batch 3", "done", 90, 4.0, 100, "POOL1-S3", [], true],
    ["J201-T4", "embed batch 4", "done", 90, 4.0, 100, "BREW1-S2", [], true],
    ["J201-T5", "merge index", "waiting", 30, 3.0, 0, null, ["J201-T1", "J201-T2", "J201-T3", "J201-T4"], true],
    ["J202-T1", "fine-tune worker 1", "running", 480, 4.0, 62, "PHARMA1-S1", [], true],
    ["J202-T2", "fine-tune worker 2", "running", 480, 4.0, 61, "PHARMA1-S1", [], true],
    ["J202-T3", "fine-tune worker 3", "running", 480, 4.0, 58, "PHARMA1-S2", [], true],
    ["J202-T4", "fine-tune worker 4", "paused", 480, 4.0, 44, "PHARMA1-S3", [], true],
    ["J202-T5", "evaluate", "waiting", 30, 4.0, 0, null, ["J202-T1", "J202-T2", "J202-T3", "J202-T4"], true],
    ["J210-T1", "screening batch 1", "running", 240, 5.0, 35, "PHARMA1-S2", [], true],
    ["J210-T2", "screening batch 2", "running", 240, 5.0, 33, "BREW1-S1", [], true],
    ["J203-T1", "transcribe", "running", 90, 6.0, 17, "PHARMA1-S3", [], false],
    ["J204-T1", "transcribe", "running", 90, 4.0, 33, "HOTEL1-S1", [], false],
    ["J205-T1", "sweep trial 1", "running", 120, 3.0, 40, "POOL1-S2", [], true],
    ["J205-T2", "sweep trial 2", "running", 120, 3.0, 20, "POOL1-S2", [], true],
    ["J205-T3", "sweep trial 3", "running", 120, 3.0, 50, "LAUNDRY1-S1", [], true],
    ["J205-T4", "sweep trial 4", "ready", 120, 3.0, 12, null, [], true],
    ["J206-T1", "retrain", "running", 120, 7.0, 25, "POOL1-S3", [], true],
    ["J207-T1", "embed batch 1", "running", 60, 3.5, 50, "HOTEL1-S2", [], true],
    ["J207-T2", "embed batch 2", "running", 60, 3.5, 25, "BREW1-S2", [], true],
    ["J207-T3", "merge index", "waiting", 15, 3.5, 0, null, ["J207-T1", "J207-T2"], true],
    ["J208-T1", "transcribe", "running", 90, 4.5, 17, "BLOCK1-S1", [], false],
    ["J209-T1", "retrain", "missed", 120, 6.0, 62, null, [], true],
  ];

  // lifecycle events that already happened before T0 (GET /admin/tasks/{id} -> events[])
  const taskEvents = {
    "J201-T3": [[H(11, 0), "ready"], [H(11, 0), "started", null, "POOL1-S3"], [H(12, 30), "completed", "POOL1-S3", null]],
    "J201-T4": [[H(11, 0), "ready"], [H(11, 15), "started", null, "BREW1-S2"], [H(12, 45), "completed", "BREW1-S2", null]],
    "J202-T4": [[H(8, 30), "ready"], [H(8, 30), "started", null, "PHARMA1-S3"], [H(12, 0), "paused", "PHARMA1-S3", null], [H(12, 45), "resumed", null, "PHARMA1-S3"], [H(14, 15), "paused", "PHARMA1-S3", null]],
    "J205-T3": [[H(12, 30), "ready"], [H(13, 30), "started", null, "PHARMA1-S3"], [H(14, 15), "migrated", "PHARMA1-S3", "LAUNDRY1-S1"]],
    "J205-T4": [[H(12, 30), "ready"], [H(13, 30), "started", null, "FARM1-S1"], [H(13, 45), "server_lost", "FARM1-S1", null]],
    "J209-T1": [[H(1, 30), "ready"], [H(9, 0), "started", null, "FARM1-S1"], [H(10, 15), "paused", "FARM1-S1", null], [H(13, 30), "missed", null, null]],
    "J210-T2": [[H(13, 0), "ready"], [H(13, 0), "started", null, "PHARMA1-S1"], [H(13, 45), "migrated", "PHARMA1-S1", "BREW1-S1"]],
  };

  const jobById = Object.fromEntries(jobs.map((j) => [j.id, j]));
  const serverById = Object.fromEntries(servers.map((s) => [s.id, s]));
  const tasks = taskRows.map(([id, name, state, runtimeMin, powerKw, progressPct, serverId, dependsOn, interruptible]) => {
    const jobId = id.split("-T")[0];
    const job = jobById[jobId];
    const energyKwh = +((runtimeMin / 60) * powerKw * (progressPct / 100)).toFixed(3);
    const ev = taskEvents[id] || (state === "waiting"
      ? []
      : [[job.submittedAt, "ready"], ...(serverId ? [[job.submittedAt, "started", null, serverId]] : [])]);
    return {
      id, jobId, name, state, priority: job.priority, runtimeMin, powerKw, threads: 1, interruptible, dependsOn,
      arrival: job.submittedAt, deadline: job.deadline,
      siteId: serverId ? serverById[serverId].siteId : null, serverId,
      progressPct, energyKwh, heatDeliveredKwh: +(energyKwh * 0.8).toFixed(3),
      filler: false, hold: false,
      finished: state === "done" ? ev[ev.length - 1][0] : null,
      events: ev.map(([time, kind, fromServerId, toServerId]) => ({ time, kind, fromServerId: fromServerId || null, toServerId: toServerId || null })),
    };
  });
  jobs.forEach((j) => { j.taskIds = tasks.filter((t) => t.jobId === j.id).map((t) => t.id); });

  /* GET /admin/events  (alerts) ---------------------------------------------------
     kind: unmet_demand | heat_dumped | deadline_missed | server_offline
     NOTE: the backend raises unmet_demand as "warning"; the design treats backup heat as critical. */
  const alerts = [
    { id: 106, slot: 28281, time: H(14, 15), severity: "critical", kind: "unmet_demand", siteId: "BLOCK1", serverId: null, jobId: null, message: "Wohnblock Matthäus: backup heater needed", acknowledged: false },
    { id: 105, slot: 28281, time: H(14, 15), severity: "warning", kind: "heat_dumped", siteId: "PHARMA1", serverId: null, jobId: null, message: "Pharma Park Kleinhüningen: tank full, heat is being dumped", acknowledged: false },
    { id: 104, slot: 28279, time: H(13, 45), severity: "critical", kind: "server_offline", siteId: "FARM1", serverId: "FARM1-S1", jobId: null, message: "Server FARM1-S1 at Schönbühl Farm is offline", acknowledged: false },
    { id: 103, slot: 28278, time: H(13, 30), severity: "warning", kind: "deadline_missed", siteId: null, serverId: null, jobId: "J209", message: "Task J209-T1 of job J209 missed its deadline", acknowledged: false },
    { id: 102, slot: 28274, time: H(12, 30), severity: "warning", kind: "heat_dumped", siteId: "PHARMA1", serverId: null, jobId: null, message: "Pharma Park Kleinhüningen: tank full, heat is being dumped", acknowledged: true },
    { id: 101, slot: 28261, time: H(9, 15), severity: "critical", kind: "unmet_demand", siteId: "LAUNDRY1", serverId: null, jobId: null, message: "Wäscherei Rhein: backup heater needed", acknowledged: true },
  ];

  /* GET /admin/scheduler ------------------------------------------------------------ */
  const scheduler = {
    algorithm: "mpc", slotMinutes: 15, slotSeconds: 5, mode: "live", paused: false,
    slot: 28282, slotsTotal: 35040, currentTime: T0,
    periodStart: meta.periodStart, periodEnd: meta.periodEnd, progressPct: 80.7,
    jumpTarget: null, fillerEnabled: false, mqtt: "connected, 2 agents",
    liveServers: ["HOTEL1-S1", "POOL1-S2"],
  };

  /* GET /admin/kpis  (scope fleet, today 00:00 -> now) --------------------------------
     prior* = the same window yesterday. GAP: the backend has no prior-period values,
     so SparkTrend and trend arrows stay hidden until it does. */
  const kpis = {
    coveragePct: 96.1, demandKwh: 772.4, deliveredKwh: 742.3, dumpedKwh: 31.4, unmetKwh: 30.1,
    utilisationPct: 78.2, loadFactorPct: 58.6, serverRunningH: 158.7, tasksRunning: 16,
    electricityKwh: 968.2, electricityCostChf: 319.5, heatValueChf: 98.0, computeIncomeChf: 1284.6,
    marginChf: 1063.1, serverHoursSold: 527.4, breakEvenChfPerServerHour: 0.42,
    avgComputePriceChfPerServerHour: 2.44, marginChfPerServerHour: 2.02, paysOffBeforeHardware: 1,
    jobsTotal: 282, jobsDone: 248, jobsMissed: 3, jobsCancelled: 1, missedDeadlinesPct: 1.2,
    prior: { coveragePct: 94.8, deliveredKwh: 718.0, dumpedKwh: 44.9, utilisationPct: 75.5, missedDeadlinesPct: 1.6, computeIncomeChf: 1190.2, breakEvenChfPerServerHour: 0.44 },
  };

  /* GET /admin/results?algorithm=...  (yearly balance of the last offline run) --------
     payOffStatement is produced by the backend (core/metrics.py) and is shown verbatim. */
  const results = {
    mpc: {
      algorithm: "mpc", generatedAt: "2025-10-21T22:14:00+02:00", periodLabel: "Simulated year 2025",
      fleet: {
        coveragePct: 96.1, demandKwh: 268410, deliveredKwh: 257940, unmetKwh: 10470, dumpedKwh: 3180,
        utilisationPct: 78.2, missedDeadlinesPct: 1.2, migrations: 3326, pauses: 412,
        electricityKwh: 10339, electricityCostChf: 3412, heatValueChf: 1098, computeIncomeChf: 17742,
        marginChf: 15428, serverHoursSold: 5510, breakEvenChfPerServerHour: 0.42,
        avgComputePriceChfPerServerHour: 3.22, maxElectricityPriceChfPerKwh: 2.53, marginChfPerServerHour: 2.8,
        paysOffBeforeHardware: 1,
        payOffStatement: "Electricity costs 3,412 CHF, the heat used is worth 1,098 CHF. The model does NOT pay off if computing sells for less than 0.42 CHF per server-hour (achieved here: 3.22 CHF), or if electricity costs more than 2.53 CHF/kWh at these computing prices (used: 0.33). Hardware, installation, maintenance and network costs are NOT included: the margin per server-hour (2.80 CHF) must also pay for those.",
      },
    },
    greedy: {
      algorithm: "greedy", generatedAt: "2025-10-21T21:52:00+02:00", periodLabel: "Simulated year 2025",
      fleet: {
        coveragePct: 94.8, demandKwh: 268410, deliveredKwh: 254450, unmetKwh: 13960, dumpedKwh: 7240,
        utilisationPct: 75.9, missedDeadlinesPct: 1.6, migrations: 4031, pauses: 588,
        electricityKwh: 10339, electricityCostChf: 3412, heatValueChf: 1083, computeIncomeChf: 17742,
        marginChf: 15413, serverHoursSold: 5510, breakEvenChfPerServerHour: 0.44,
        avgComputePriceChfPerServerHour: 3.22, maxElectricityPriceChfPerKwh: 2.52, marginChfPerServerHour: 2.78,
        paysOffBeforeHardware: 1,
        payOffStatement: "Electricity costs 3,412 CHF, the heat used is worth 1,083 CHF. The model does NOT pay off if computing sells for less than 0.44 CHF per server-hour (achieved here: 3.22 CHF), or if electricity costs more than 2.52 CHF/kWh at these computing prices (used: 0.33). Hardware, installation, maintenance and network costs are NOT included: the margin per server-hour (2.78 CHF) must also pay for those.",
      },
    },
  };

  /* GET /admin/simulations  (historical offline runs) ----------------------------------- */
  const simulations = [
    { id: "run-0007", algorithm: "mpc", datasetId: "demand - latest.xlsx", status: "done", startedAt: "2025-10-21T22:12:00+02:00", durationS: 104, coveragePct: 96.1, dumpedKwh: 3180, missedDeadlinesPct: 1.2 },
    { id: "run-0006", algorithm: "greedy", datasetId: "demand - latest.xlsx", status: "done", startedAt: "2025-10-21T21:50:00+02:00", durationS: 88, coveragePct: 94.8, dumpedKwh: 7240, missedDeadlinesPct: 1.6 },
    { id: "run-0005", algorithm: "greedy", datasetId: "demand.xlsx", status: "done", startedAt: "2025-10-20T17:31:00+02:00", durationS: 91, coveragePct: 93.9, dumpedKwh: 8115, missedDeadlinesPct: 2.1 },
  ];

  /* GET /admin/assumptions  (status: BRIEF | SOURCE | ASSUMPTION | MOCK | LIMIT) ---------
     These rows are the real register of the backend (ASSUMPTIONS.md), shortened. */
  const assumptions = [
    { area: "physics", name: "Heat recovery", value: "80 %", status: "BRIEF", source: "Case brief: 80 % of server electricity is recoverable into water." },
    { area: "site", name: "Tank capacity", value: "35 kWh", status: "BRIEF", source: "Case brief: 35 kWh usable (1,000 l, 30 K spread), no losses. Per-site values in sites.csv." },
    { area: "economics", name: "Electricity price", value: "0.33 CHF/kWh", status: "ASSUMPTION", source: "ElCom 2026, IWB Basel, H4, total price incl. all fees. To be confirmed." },
    { area: "economics", name: "Value of heat", value: "0.132 CHF/kWh", status: "BRIEF", source: "Case brief: heat replaces a heat pump with efficiency 2.5, so electricity price / 2.5." },
    { area: "economics", name: "Compute price, critical", value: "6.62 CHF/server-h", status: "SOURCE", source: "AWS g6.xlarge (1x L4) Frankfurt on-demand 1.01 USD/h, retrieved 2026-11-21. Mapping of tiers to prices is an assumption." },
    { area: "economics", name: "Compute price, flexible", value: "2.36 CHF/server-h", status: "SOURCE", source: "AWS g6.xlarge (1x L4) Frankfurt spot 0.36 USD/h, retrieved 2026-11-21." },
    { area: "economics", name: "Hardware, installation, maintenance", value: "not included", status: "LIMIT", source: "The margin per server-hour must pay for these. See the pay-off statement." },
    { area: "demand", name: "Demand file", value: "demand - latest.xlsx", status: "MOCK", source: "Household electricity meter data placed side by side as sites. Not measured heat demand. Must be replaced." },
    { area: "site", name: "Site coordinates, types, owners", value: "generated", status: "MOCK", source: "make_mock_data.py" },
    { area: "scheduler", name: "MPC forecast", value: "perfect", status: "ASSUMPTION", source: "'perfect' reads ahead in the demand file (upper bound); 'persistence' = same slot yesterday." },
    { area: "scheduler", name: "Greedy tank target", value: "50 % full", status: "ASSUMPTION", source: "Tuning value." },
    { area: "live", name: "Live demo heat", value: "nominal task power", status: "LIMIT", source: "A laptop represents a server; heat is computed from the task's nominal power, not measured." },
  ];

  /* GET /admin/settings/pricing ----------------------------------------------------------- */
  const pricing = {
    electricityChfPerKwh: 0.33, heatPumpCop: 2.5, heatValueChfPerKwh: 0.132,
    computeChfPerServerHour: { critical: 6.623, normal: 4.4918, flexible: 2.3607 },
    source: "config.py (electricity: ElCom 2026 IWB H4 to confirm; compute: AWS L4 on-demand/spot)",
  };

  /* Platform economics: business-plan target mix. NOT backend data. Label as "plan". */
  const platform = {
    planMixPct: { compute: 60, heat: 20, grid: 10, certificates: 10 },
    planSource: "Business plan target mix (Virtual Culture GmbH). Scenario, not measured.",
    sides: {
      grid: { title: "Grid flexibility", who: "Swissgrid, IWB, BKW", planSharePct: 10,
        explanation: "Pausing or shifting flexible compute lets the fleet act as a controllable load for balancing services.",
        preconditions: ["Aggregate 100 to 300 sites to reach a 1 to 5 MW pool", "Prequalification with the grid operator", "Metering at 15-minute resolution per site"] },
      certificates: { title: "Heat-reuse certificates and software licensing", who: "Sustainability teams, utilities", planSharePct: 10,
        explanation: "Measured recovered heat can back heat-reuse certificates. The scheduler can be licensed to other operators.",
        preconditions: ["Verified heat metering at every site", "One party claims each saving: the host or the certificate buyer, never both", "An accepted certification scheme"] },
    },
    partners: [
      { name: "Certified installers", role: "1-day install of rack, heat exchanger and fibre", status: "Roadmap" },
      { name: "Hardware and leasing partners", role: "Sealed liquid-cooled racks, financed per site", status: "Roadmap" },
    ],
  };

  /* ---------- Compute Portal (role customer). Demo login: Rheinpharm AG -------------------- */
  const computeUser = { id: "rheinpharm", role: "customer", name: "Rheinpharm AG", contact: "Research IT" };

  // older jobs of this customer, already finished (GET /customer/jobs, status done|missed)
  const jobHistory = [
    { id: "J188", customerId: "rheinpharm", name: "Embed document archive", priority: "flexible", status: "done", submittedAt: D(21, 9), deadline: D(22, 9), finished: D(21, 15, 30), progressPct: 100, costChf: 49.6, tasks: 5 },
    { id: "J176", customerId: "rheinpharm", name: "Protein-binding screening batch", priority: "normal", status: "done", submittedAt: D(20, 22), deadline: D(21, 10), finished: D(21, 6, 15), progressPct: 100, costChf: 179.7, tasks: 2 },
    { id: "J163", customerId: "rheinpharm", name: "Fine-tune language model", priority: "flexible", status: "done", submittedAt: D(18, 8), deadline: D(21, 8), finished: D(19, 23, 45), progressPct: 100, costChf: 311.2, tasks: 5 },
    { id: "J151", customerId: "rheinpharm", name: "Transcribe lab meeting recordings", priority: "critical", status: "done", submittedAt: D(17, 13), deadline: D(17, 16), finished: D(17, 14, 15), progressPct: 100, costChf: 26.5, tasks: 1 },
    { id: "J140", customerId: "rheinpharm", name: "Hyper-parameter sweep", priority: "flexible", status: "missed", submittedAt: D(15, 7), deadline: D(15, 19), finished: null, progressPct: 88, costChf: 37.4, tasks: 8 },
    { id: "J129", customerId: "rheinpharm", name: "Embed document archive", priority: "flexible", status: "done", submittedAt: D(14, 10), deadline: D(15, 10), finished: D(14, 17), progressPct: 100, costChf: 48.9, tasks: 5 },
  ];

  /* GET /customer/usage  (server-hours and cost per month and priority) */
  const usage = [];
  [["2025-05", 61, 118, 240], ["2025-06", 74, 131, 262], ["2025-07", 58, 122, 301], ["2025-08", 66, 140, 288], ["2025-09", 81, 152, 334], ["2025-10", 57, 109, 251]].forEach(([m, c, n, f]) => {
    usage.push({ month: `${m}-01T00:00:00+02:00`, priority: "critical", serverHours: c, costChf: +(c * 6.623).toFixed(2) });
    usage.push({ month: `${m}-01T00:00:00+02:00`, priority: "normal", serverHours: n, costChf: +(n * 4.4918).toFixed(2) });
    usage.push({ month: `${m}-01T00:00:00+02:00`, priority: "flexible", serverHours: f, costChf: +(f * 2.3607).toFixed(2) });
  });

  /* GET /customer/invoices */
  const invoices = ["2025-10", "2025-09", "2025-08", "2025-07", "2025-06", "2025-05"].map((m, i) => {
    const rows = usage.filter((u) => u.month.startsWith(m));
    return { id: `INV-${m.replace("-", "")}`, month: `${m}-01T00:00:00+02:00`, serverHours: rows.reduce((a, r) => a + r.serverHours, 0), amountChf: +rows.reduce((a, r) => a + r.costChf, 0).toFixed(2), status: i === 0 ? "open" : "paid" };
  });

  /* GET /customer/impact  (+ GAP: a monthly series; today only the totals exist) */
  const impact = {
    heatDeliveredKwh: 3214.6, heatReusedSharePct: 94.2, sitesHeated: 5,
    note: "reused share is the fleet-wide share of server heat used by buildings in this period",
    monthly: [["2025-05", 2610], ["2025-06", 2890], ["2025-07", 2540], ["2025-08", 2975], ["2025-09", 3480], ["2025-10", 3214.6]].map(([m, v]) => ({ month: `${m}-01T00:00:00+02:00`, heatDeliveredKwh: v })),
    co2: { valueKg: 610, status: "ASSUMPTION", source: "If the reused heat replaced a heat pump (COP 2.5) on the Swiss consumer electricity mix, about 0.19 kg CO2 per kWh of heat pump electricity. Not verified. Do not publish." },
  };

  /* GET /customer/api-keys */
  const apiKeys = [
    { id: "key_1", name: "Research cluster CI", prefix: "dh_live_7f3a", createdAt: "2025-06-03T09:12:00+02:00", lastUsedAt: H(14, 2) },
    { id: "key_2", name: "Notebook, data science team", prefix: "dh_live_c91e", createdAt: "2025-09-18T15:40:00+02:00", lastUsedAt: D(20, 11, 30) },
  ];

  const tiers = {
    critical: { label: "Priority", blurb: "Finishes first. Never paused or moved.", price: "Highest price" },
    normal: { label: "Standard", blurb: "Runs soon. May move between sites.", price: "Mid price" },
    flexible: { label: "Flexible", blurb: "Runs when a host needs heat. Can pause.", price: "Lowest price" },
  };

  /* ---------- Host Portal (role site_owner). Demo login: Hallenbad Gundeli ------------------- */
  const hostUser = { id: "pool1owner", role: "site_owner", name: "Hallenbad Gundeli", contact: "Facility management", siteId: "POOL1" };

  // deterministic pseudo-random so the prototype looks the same on every load
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* GET /site/sites/{id}/energy?period=day|week|month|year
     -> [{bucket, demandKwh, serverHeatKwh, backupHeatKwh}] */
  function hostEnergy() {
    const r = rng(7);
    const dayShape = [0.55, 0.5, 0.48, 0.5, 0.62, 0.9, 1.35, 1.5, 1.3, 1.1, 1.0, 1.05, 1.1, 1.0, 0.95, 1.0, 1.15, 1.35, 1.45, 1.3, 1.1, 0.9, 0.7, 0.6];
    const mk = (bucket, demand, backupShare) => {
      const demandKwh = +demand.toFixed(1);
      const backupHeatKwh = +(demandKwh * backupShare).toFixed(1);
      return { bucket, demandKwh, serverHeatKwh: +(demandKwh - backupHeatKwh).toFixed(1), backupHeatKwh };
    };
    const day = dayShape.slice(0, 15).map((s, h) => mk(H(h, 0), 16.4 * s * (0.94 + r() * 0.12), h === 6 || h === 7 ? 0.11 + r() * 0.05 : h === 17 ? 0.04 : 0));
    const wd = ["16", "17", "18", "19", "20", "21", "22"];
    const week = wd.map((d, i) => mk(D(d, 0), (i === 6 ? 236 : 380) * (0.92 + r() * 0.16), i === 2 ? 0.09 : i === 6 ? 0.03 : 0.02 + r() * 0.03));
    const month = Array.from({ length: 22 }, (_, i) => mk(D(String(i + 1).padStart(2, "0"), 0), (i === 21 ? 236 : 372) * (0.88 + r() * 0.24), i % 7 === 3 ? 0.1 : 0.015 + r() * 0.04));
    const season = [1.42, 1.36, 1.22, 1.02, 0.86, 0.74, 0.7, 0.72, 0.84, 1.0];
    const year = season.map((s, i) => mk(`2025-${String(i + 1).padStart(2, "0")}-01T00:00:00+0${i < 3 ? 1 : 2}:00`, (i === 9 ? 7900 : 11200) * s * (0.96 + r() * 0.08), i < 3 ? 0.08 + r() * 0.05 : 0.02 + r() * 0.025));
    return { day, week, month, year };
  }

  /* GET /site/sites/{id}/savings -> {months:[{month, serverHeatKwh, valueChf}], totalChf, explanation} */
  const energy = hostEnergy();
  const savings = {
    months: energy.year.map((b) => ({ month: b.bucket, serverHeatKwh: b.serverHeatKwh, valueChf: +(b.serverHeatKwh * 0.132).toFixed(2) })),
    explanation: "Each kWh of server heat replaces heat-pump heat worth 0.33 CHF / 2.5 = 0.132 CHF.",
    tariffVerified: false, // GAP: no verified tariff calculation exists, so never call this "bill savings"
  };
  savings.totalChf = +savings.months.reduce((a, m) => a + m.valueChf, 0).toFixed(2);

  /* GET /site/notifications  (+ GAP: recommendedAction, resolvedAt, severity) */
  const notifications = [
    { id: 14, time: H(7, 15), kind: "unmet_demand", siteId: "POOL1", read: false, severity: "warning",
      title: "Backup heat was needed this morning", message: "Between 06:00 and 07:45 the pool needed more heat than the servers and tank could supply. Your backup heater covered 5.8 kWh.",
      recommendedAction: "No action needed. If this repeats on most mornings, ask us to review the tank schedule.", resolvedAt: H(7, 45) },
    { id: 13, time: D(21, 16, 30), kind: "maintenance", siteId: "POOL1", read: false, severity: "info",
      title: "Planned service visit on 28 October", message: "A certified installer will check the heat exchanger between 09:00 and 11:00. Heat supply continues during the visit.",
      recommendedAction: "Please make sure the plant room is accessible.", resolvedAt: null },
    { id: 12, time: D(19, 3, 10), kind: "server_offline", siteId: "POOL1", read: true, severity: "warning",
      title: "One server was offline for 40 minutes", message: "Server 3 lost its network connection. The other servers and your tank kept the hot water covered.",
      recommendedAction: "Resolved. Nothing to do.", resolvedAt: D(19, 3, 50) },
    { id: 11, time: D(15, 10, 0), kind: "report", siteId: "POOL1", read: true, severity: "info",
      title: "Your September report is ready", message: "Recovered heat, backup heat and the recovered heat value for September are available under Savings and reports.",
      recommendedAction: "Open the report.", resolvedAt: D(15, 10, 0) },
  ];

  DH.sampleData = {
    T0, meta, sites, servers, customers, jobs, tasks, alerts, scheduler, kpis, results, simulations,
    assumptions, pricing, platform,
    compute: { user: computeUser, jobHistory, usage, invoices, impact, apiKeys, tiers },
    host: { user: hostUser, energy, savings, notifications },
    rng,
  };
})();
