/* ==========================================================================
   DigitalHeat Host Portal (/host): calm, practical, phone first.
   Role site_owner. Demo login: Hallenbad Gundeli (POOL1).

   Routes (hash):  /  Today · /energy · /installation · /savings · /alerts
   URL switches:   ?state=loading|empty|error|reconnecting   every screen
                   ?demo=offline                              Today, site unreachable
                   ?verified=1                                Savings, verified tariff variant
                   ?period=day|week|month|year                Energy
   Data: only /site/... endpoints. A host never sees customer names, job ids,
   task names or task data: the work is described in plain words only.
   ========================================================================== */
(function () {
  const DH = window.DH, P = window.htmPreact;
  const { html, useState, useEffect } = P;
  const { Icon, Num, StatusChip, OriginBadge, DonutGauge, HeatPulse, StackedBars, Segmented, InfoPop, ViewState, EmptyState, Skeleton, PortalShell, AssumptionPill, KpiTile, fmt, cx } = DH;

  DH.boot();
  const SITE = DH.store.state.host.user.siteId;

  /* ---------- today's hourly buckets: sample history + live slots (WS site-owner:{id} overview.update) ---------- */
  const HOUR = 3600000;
  const liveHours = {};
  DH.bus.on("slot.tick", (m) => {
    if (m.data.siteId !== SITE) return;
    const key = Math.floor(new Date(m.data.time).getTime() / HOUR) * HOUR;
    const b = liveHours[key] || (liveHours[key] = { demandKwh: 0, serverHeatKwh: 0, backupHeatKwh: 0 });
    b.demandKwh += m.data.demandKwh; b.serverHeatKwh += m.data.deliveredKwh; b.backupHeatKwh += m.data.unmetKwh;
  });
  function dayBuckets(st) {
    const today = fmt.date(st.scheduler.currentTime), map = {};
    st.host.energy.day.forEach((b) => { map[new Date(b.bucket).getTime()] = Object.assign({}, b); });
    Object.keys(liveHours).forEach((k) => {
      const cur = map[k] || (map[k] = { bucket: fmt.iso(Number(k)), demandKwh: 0, serverHeatKwh: 0, backupHeatKwh: 0 });
      cur.demandKwh += liveHours[k].demandKwh; cur.serverHeatKwh += liveHours[k].serverHeatKwh; cur.backupHeatKwh += liveHours[k].backupHeatKwh;
    });
    return Object.keys(map).map(Number).sort((a, b) => a - b).map((k) => map[k]).filter((b) => fmt.date(b.bucket) === today);
  }

  /* ---------- small helpers ---------------------------------------------------------------- */
  function useMedia(qs) {
    const [m, setM] = useState(() => window.matchMedia(qs).matches);
    useEffect(() => { const mq = window.matchMedia(qs), cb = () => setM(mq.matches); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); }, [qs]);
    return m;
  }
  const dayNum = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", day: "numeric" });
  const monthLong = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", month: "long" });
  const big = (kwh) => (Math.abs(kwh) >= 10000 ? { value: kwh / 1000, unit: "MWh", d: 1 } : { value: kwh, unit: "kWh", d: kwh >= 100 ? 0 : 1 });
  const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
  const go = (path, q) => DH.router.href(path, q);

  // what a status means for a host business (a full tank is good news here, so "dumping" reads as covered)
  const HOST_STATUS = {
    covered: { chip: "covered", label: "Covered by recovered heat", tone: "ok", icon: "check-circle" },
    dumping: { chip: "covered", label: "Covered, tank is full", tone: "ok", icon: "check-circle" },
    tank_low: { chip: "tank_low", label: "Tank is low", tone: "tank", icon: "droplet" },
    unmet: { chip: "unmet", label: "Backup heater is helping", tone: "critical", icon: "alert-octagon" },
    offline: { chip: "offline", label: "Installation not reachable", tone: "idle", icon: "wifi-off" },
  };
  const SERVER_TONE = { working: "heat", idle: "idle", offline: "critical" };

  /* ---------- Fact: one idea, one number, one sentence ----------------------------------------- */
  function Fact({ icon, tone = "idle", label, info, value, d, unit, prefix, valueNode, period, why, children, sm, stale, cls }) {
    return html`<section class=${cx("dh-card host-fact", "tone-" + tone, sm && "host-fact--sm", cls)}>
      <div class="host-fact__label"><span class="host-fact__icon"><${Icon} name=${icon} size=${18} /></span><span class="grow">${label}</span>${info}</div>
      <div class=${cx("host-fact__value", stale && "is-stale")}>${prefix && html`<span class="unit" style="margin:0 .35em 0 0">${prefix}</span>`}${valueNode || html`<${Num} value=${value} d=${d} />`}${unit && html`<span class="unit">${unit}</span>`}</div>
      <div class="host-fact__period">${period}</div>
      ${why && html`<p class="host-fact__why">${why}</p>`}${children}
    </section>`;
  }
  const skCard = (h, cls) => html`<div class=${cx("dh-card", cls)} aria-busy="true"><span class="sr-only">Loading</span><${Skeleton} variant="title" /><${Skeleton} variant="card" h=${h} style="margin-top:16px" /></div>`;
  const skFact = (cls) => html`<div class=${cx("dh-card host-fact", cls)} aria-busy="true"><${Skeleton} w="60%" /><${Skeleton} variant="num" style="margin-top:10px" /><${Skeleton} w="45%" style="margin-top:8px" /></div>`;
  const Support = () => html`<a class="dh-btn" href="mailto:hosts@digitalheat.example"><${Icon} name="help" size=${16} />Contact DigitalHeat support</a>`;

  function energyBuckets(rows, labelOf, tipOf) {
    return rows.map((b) => ({
      label: labelOf(b), tip: tipOf(b),
      segments: [{ key: "server", label: "Recovered server heat", value: b.serverHeatKwh, tone: "heat" }, { key: "backup", label: "Backup heat", value: b.backupHeatKwh, tone: "critical" }],
      marker: { label: "Heat demand", value: b.demandKwh },
    }));
  }

  /* =========================== Today ============================================================ */
  function Today({ st, q, state }) {
    const site = DH.sel.site(st, SITE), servers = DH.sel.hostServers(st, SITE);
    let ov = DH.sel.hostOverview(st, SITE);
    if (q.demo === "offline") ov = Object.assign({}, ov, { status: "offline", serversWorking: 0, statusMessage: "We cannot reach your installation right now. Your backup heater keeps the hot water running." });
    const offline = ov.status === "offline";
    const hs = HOST_STATUS[ov.status] || HOST_STATUS.covered;
    const wide = useMedia("(min-width: 1100px)"), narrow = useMedia("(max-width: 379px)");
    const pct = (100 * ov.tankKwh) / ov.tankCapacityKwh;
    const liveN = servers.filter((s) => s.live).length;
    const backup = ov.backupHeatTodayKwh > 0.05;
    const day = dayBuckets(st);
    const news = st.host.notifications.filter((n) => !n.read).sort((a, b) => (a.time < b.time ? 1 : -1))[0];
    const lastSeen = "13:45";

    const skeleton = html`<div class="host-grid" aria-busy="true"><span class="sr-only">Loading today</span>
      <div class="dh-card"><${Skeleton} w="80%" h=${22} /><${Skeleton} w="40%" style="margin-top:12px" /></div>
      <div class="dh-card host-hero lg-5"><${Skeleton} variant="circle" w=${narrow ? 200 : 224} h=${narrow ? 200 : 224} /><${Skeleton} w="70%" /><${Skeleton} w="50%" /></div>
      <div class="host-stack lg-7"><div class="host-grid">${skFact()}${skFact("sm-6")}${skFact("sm-6")}${skFact()}</div></div></div>`;
    const empty = html`<div class="dh-card"><${EmptyState} tone="tank" icon="tank" title="Your installation is not sending data yet" body="Once your servers are connected, your tank level and recovered heat appear here. This usually takes less than a day after installation." action=${html`<a class="dh-btn dh-btn--primary" href=${go("/installation")}>See my installation</a>`} /></div>`;

    const ring = html`<${DonutGauge} variant="tank" tone=${offline ? "idle" : "tank"} value=${ov.tankKwh} max=${ov.tankCapacityKwh} size=${wide ? 248 : narrow ? 200 : 224} stroke=${14}
      label=${`Hot water tank ${Math.round(pct)} percent full, ${fmt.num(ov.tankKwh, 1)} of ${fmt.num(ov.tankCapacityKwh, 0)} kilowatt hours${offline ? ", last known value" : ""}`}
      center=${html`<div class="host-ring__pct"><${Num} value=${pct} d=${0} /><span class="unit">%</span></div>
        <div class="host-ring__kwh num">${fmt.num(ov.tankKwh, 1)} / ${fmt.num(ov.tankCapacityKwh, 0)} kWh</div><div class="host-ring__cap">${offline ? `last known, ${lastSeen}` : "tank level now"}</div>`} />`;

    return html`<${ViewState} state=${state} skeleton=${skeleton} empty=${empty}>
      <div class="host-grid">
        <section class=${cx("dh-card host-status", "tone-" + hs.tone)} aria-live="polite" aria-label="Status of your site">
          <span class="host-status__icon"><${Icon} name=${hs.icon} size=${24} /></span>
          <div class="col" style="gap:10px"><p class="host-status__text">${ov.statusMessage}</p>
            <div class="row wrap" style="gap:6px 12px"><${StatusChip} kind="site" value=${hs.chip} label=${hs.label} />
              <span class="t-12 faint">${st.host.user.name} · ${offline ? `last contact ${lastSeen}` : `updated ${fmt.time(ov.time)}`}, simulated time</span></div></div>
        </section>

        ${offline && html`<section class="dh-card lg-12" aria-labelledby="h-off"><h2 id="h-off" class="host-h2">What this means for you</h2>
          <ul class="host-explain" style="margin-top:14px">
            <li class="tone-ok"><span class="host-explain__n"><${Icon} name="check" size=${16} /></span><span><b>Your hot water is safe.</b>The backup heater takes over automatically while we cannot reach the servers.</span></li>
            <li class="tone-idle"><span class="host-explain__n"><${Icon} name="wrench" size=${16} /></span><span><b>We have been alerted.</b>Our operations team sees the same message and is already working on the connection. There is nothing you need to switch on or off.</span></li>
            <li class="tone-idle"><span class="host-explain__n"><${Icon} name="clock" size=${16} /></span><span><b>The values below are the last ones we received.</b>They are shown dimmed until the connection is back.</span></li></ul>
          <div style="margin-top:16px"><${Support} /></div></section>`}

        <section class="dh-card host-hero lg-5" aria-labelledby="h-tank">
          <div class=${cx(offline && "is-stale")}>${ring}</div>
          <div class="host-hero__text">
            <h2 id="h-tank" class="host-h2">Your hot water tank</h2>
            <p class="host-lead">The tank stores heat recovered from the servers in your plant room. ${fmt.num(ov.tankCapacityKwh, 0)} kWh is a full tank.</p>
            <dl class=${cx("host-mini", offline && "is-stale")}><div><dt>Stored now</dt><dd class="num">${fmt.num(ov.tankKwh, 1)}<span class="unit">kWh</span></dd></div><div><dt>Room left</dt><dd class="num">${fmt.num(ov.tankCapacityKwh - ov.tankKwh, 1)}<span class="unit">kWh</span></dd></div></dl>
          </div>
        </section>

        <div class="host-stack lg-7"><div class="host-grid">
          <${Fact} icon="flame" tone="heat" label="Heat from DigitalHeat today" value=${ov.serverHeatTodayKwh} d=${0} unit="kWh" stale=${offline} period="today so far, since 00:00"
            why=${html`That is <b><span class="num">${fmt.pct(ov.serverHeatSharePctToday)}</span> %</b> of the heat your site needed today. It was recovered from the servers and delivered through your tank.`} />
          <${Fact} sm cls="sm-6" icon="server" tone=${ov.serversWorking > 0 ? "heat" : "idle"} label="Servers working" stale=${offline} period=${offline ? "not reachable" : "right now"}
            valueNode=${html`${offline ? html`<span class="num">–</span>` : html`<${Num} value=${ov.serversWorking} d=${0} />`}<span class="host-fact__of">/ ${ov.serversTotal}</span>`}>
            <${HeatPulse} on=${!offline && ov.serversWorking > 0} load=${site.capacityKw ? site.loadKw / site.capacityKw : 0} />
            <p class="host-fact__why">${offline ? "We will show this again once the connection is back." : ov.serversWorking > 0 ? "Working servers send their heat into your tank." : "Idle servers make no heat. Your tank and backup heater cover the demand."}</p>
          <//>
          <${Fact} sm cls="sm-6" icon=${backup ? "alert-octagon" : "check-circle"} tone=${backup ? "critical" : "ok"} label="Backup heat required" value=${ov.backupHeatTodayKwh} d=${1} unit="kWh" stale=${offline} period="today so far"
            why=${backup ? "Your backup heater supplied this part. Everything else came from recovered heat." : "None needed. Recovered heat covered everything."} />
          <${Fact} icon="wallet" tone="idle" label="Recovered heat value this month" prefix="CHF" value=${ov.savingsMonthChf} d=${0} period=${`${monthLong.format(new Date(ov.time))} so far`}
            info=${html`<${InfoPop} label="How the recovered heat value is calculated" align="right"><div class="w-600" style="margin-bottom:6px">Pricing assumption</div><p>${st.host.savings.explanation}</p><p class="muted t-12" style="margin-top:8px">This is a pricing assumption, not a calculation against your own tariff.</p><//>`}
            why=${html`The value of the heat we delivered, at an assumed price per kWh. <a href=${go("/savings")}>See how it is calculated</a>`} />
        </div></div>

        <section class="dh-card lg-8" aria-labelledby="h-day">
          <div class="host-cardhead"><div><h2 id="h-day" class="host-h2">Today, hour by hour</h2><p class="dh-card__sub">Heat your site needed, and where it came from.</p></div>
            <a class="host-linkrow" href=${go("/energy")}>Open Energy<${Icon} name="chevron-right" size=${14} /></a></div>
          <div class=${cx(offline && "is-stale")}><${StackedBars} buckets=${energyBuckets(day, (b) => fmt.time(b.bucket), (b) => `${fmt.time(b.bucket)} to ${fmt.time(fmt.iso(new Date(b.bucket).getTime() + HOUR))}`)} unit="kWh per hour" height=${wide ? 220 : 190} ariaLabel="Heat demand, recovered server heat and backup heat per hour today, in kilowatt hours" empty="No heat data for today yet" /></div>
        </section>

        <section class="dh-card lg-4" aria-labelledby="h-news"><div class="host-preview">
          <h2 id="h-news" class="host-h2">Latest notification</h2>
          ${news ? html`<div class="host-preview__item tone-${noteTone(news)}"><span class="host-fact__icon"><${Icon} name=${noteIcon(news)} size=${16} /></span><div><div class="t-14 w-600">${news.title}</div><p class="t-13 muted" style="margin-top:2px">${news.recommendedAction}</p></div></div>`
            : html`<p class="host-lead">You are all caught up. Nothing needs your attention.</p>`}
          <span class="grow"></span>
          <a class="host-linkrow" href=${go("/alerts")}>All notifications<${Icon} name="chevron-right" size=${14} /></a>
          <div class="host-origin" title="LIVE: a real process on a laptop. SIMULATED: computed by the scheduler model.">Data origin of your servers
            ${liveN > 0 && html`<span class="row" style="gap:6px"><${OriginBadge} live=${true} /><span>${liveN}</span></span>`}<span class="row" style="gap:6px"><${OriginBadge} live=${false} /><span>${servers.length - liveN}</span></span></div>
        </div></section>
      </div>
    <//>`;
  }

  /* =========================== Energy ============================================================ */
  const PERIODS = {
    day: { label: "Day", unit: "kWh per hour", per: "hour", span: () => "today so far", lab: (b) => fmt.time(b.bucket), tip: (b) => `${fmt.day(b.bucket)}, ${fmt.time(b.bucket)} to ${fmt.time(fmt.iso(new Date(b.bucket).getTime() + HOUR))}` },
    week: { label: "Week", unit: "kWh per day", per: "day", span: () => "last 7 days", lab: (b) => fmt.day(b.bucket).slice(0, 3), tip: (b) => fmt.day(b.bucket) },
    month: { label: "Month", unit: "kWh per day", per: "day", span: (now) => `${monthLong.format(new Date(now))} so far`, lab: (b) => dayNum.format(new Date(b.bucket)), tip: (b) => fmt.day(b.bucket) },
    year: { label: "Year", unit: "kWh per month", per: "month", span: () => "2025 so far", lab: (b) => fmt.monthShort(b.bucket), tip: (b) => fmt.month(b.bucket) },
  };
  function Energy({ st, q, state }) {
    const period = PERIODS[q.period] ? q.period : "day", cfg = PERIODS[period];
    const rows = period === "day" ? dayBuckets(st) : st.host.energy[period];
    const demand = sum(rows, "demandKwh"), server = sum(rows, "serverHeatKwh"), backup = sum(rows, "backupHeatKwh");
    const share = demand ? (100 * server) / demand : 0;
    const worst = rows.reduce((a, b) => (b.backupHeatKwh > (a ? a.backupHeatKwh : 0) ? b : a), null);
    const span = cfg.span(st.scheduler.currentTime);
    const B = big(demand), S = big(server), K = big(backup);
    const set = (p) => DH.router.set({ period: p === "day" ? null : p });
    const seg = html`<div class="host-seg"><${Segmented} label="Period" value=${period} onChange=${set} options=${Object.keys(PERIODS).map((k) => ({ value: k, label: PERIODS[k].label }))} /></div>`;

    const skeleton = html`<div class="host-stack" aria-busy="true"><span class="sr-only">Loading energy</span><${Skeleton} variant="card" h=${44} w=${260} />
      <div class="host-kpis">${[0, 1, 2, 3].map((i) => html`<div class="dh-kpi dh-kpi--card" key=${i}><${Skeleton} w="70%" /><${Skeleton} variant="num" style="margin-top:8px" /><${Skeleton} w="50%" style="margin-top:8px" /></div>`)}</div>
      ${skCard(240)}</div>`;
    const empty = html`<div class="host-stack">${seg}<div class="dh-card"><${EmptyState} tone="tank" icon="chart" title="No heat data for this period" body="We have not received heat readings for the selected period. Try a longer period, or check back after the next 15 minutes."
      action=${html`<button type="button" class="dh-btn dh-btn--primary" onClick=${() => DH.router.set({ state: null, period: "week" })}>Show the last 7 days</button>`} /></div></div>`;

    return html`<${ViewState} state=${state} skeleton=${skeleton} empty=${empty}>
      <div class="host-stack">
        ${seg}
        <div class="host-kpis" role="group" aria-label=${`Totals, ${span}`}>
          <${KpiTile} card label="Heat demand" icon="tank" tone="tank" value=${B.value} d=${B.d} unit=${B.unit} period=${span} />
          <${KpiTile} card label="Recovered heat" icon="flame" tone="heat" value=${S.value} d=${S.d} unit=${S.unit} period="from your servers" />
          <${KpiTile} card label="Backup heat" icon=${backup > 0.05 ? "alert-octagon" : "check-circle"} tone=${backup > 0.05 ? "critical" : "ok"} value=${K.value} d=${K.d} unit=${K.unit} period="from your backup heater" />
          <${KpiTile} card label="Covered" icon="check-circle" tone="ok" value=${share} d=${0} unit="%" period="of demand, by recovered heat" />
        </div>
        <section class="dh-card" aria-labelledby="h-en">
          <div class="host-cardhead"><div><h2 id="h-en" class="host-h2">Heat demand and where the heat came from</h2><p class="dh-card__sub">${cfg.unit}, ${span}. The dark tick is what your site needed.</p></div></div>
          <${StackedBars} buckets=${energyBuckets(rows, cfg.lab, cfg.tip)} unit=${cfg.unit} height=${260} ariaLabel=${`Heat demand, recovered server heat and backup heat per ${cfg.per}, ${span}, in kilowatt hours`} empty="No heat data for this period" />
          ${rows.length > 0 && html`<div class="host-reading"><${Icon} name="info" size=${16} class="faint" /><span>Recovered heat covered <b><span class="num">${fmt.pct(share)}</span> %</b> of your heat demand (${span}).
            ${backup > 0.05 && worst ? html` Your backup heater supplied <b><span class="num">${fmt.num(K.value, K.d)}</span> ${K.unit}</b>, most of it ${period === "day" ? `between ${cfg.tip(worst).split(", ").pop().replace(" to ", " and ")}` : period === "year" ? `in ${fmt.month(worst.bucket)}` : `on ${fmt.day(worst.bucket)}`}.` : " No backup heat was needed."}</span></div>`}
          <details class="host-details"><summary><${Icon} name="list" size=${14} />View the numbers as a table</summary>
            <div class="dh-table-wrap" style="margin-top:8px;max-height:320px" tabindex="0" role="region" aria-label="Energy table"><table class="dh-table">
              <thead><tr><th scope="col"><span>${cfg.per === "hour" ? "Hour" : cfg.per === "day" ? "Day" : "Month"}</span></th><th scope="col" class="is-num"><span>Demand kWh</span></th><th scope="col" class="is-num"><span>Recovered kWh</span></th><th scope="col" class="is-num"><span>Backup kWh</span></th></tr></thead>
              <tbody>${rows.map((b) => html`<tr key=${b.bucket}><td>${cfg.tip(b)}</td><td class="is-num">${fmt.num(b.demandKwh, 1)}</td><td class="is-num">${fmt.num(b.serverHeatKwh, 1)}</td><td class="is-num">${fmt.num(b.backupHeatKwh, 1)}</td></tr>`)}</tbody></table></div></details>
        </section>
      </div>
    <//>`;
  }

  /* =========================== My installation ===================================================== */
  function Installation({ st, state }) {
    const site = DH.sel.site(st, SITE), servers = DH.sel.hostServers(st, SITE);
    const pct = (100 * site.tankKwh) / site.tankCapacityKwh;
    const working = servers.filter((s) => s.status === "working").length;

    const skeleton = html`<div class="host-grid" aria-busy="true"><span class="sr-only">Loading installation</span>${skCard(96, "lg-5")}${skCard(96, "lg-7")}${[0, 1, 2].map((i) => html`<div class="dh-card md-6 lg-4" key=${i}><${Skeleton} variant="title" /><${Skeleton} variant="card" h=${64} style="margin-top:14px" /><${Skeleton} w="85%" style="margin-top:14px" /></div>`)}</div>`;
    const empty = html`<div class="dh-card"><${EmptyState} icon="server" title="No servers installed at this site yet" body="After the one-day installation by a certified installer, each server appears here with its status and the kind of work it does." action=${html`<${Support} />`} /></div>`;

    return html`<${ViewState} state=${state} skeleton=${skeleton} empty=${empty}>
      <div class="host-grid">
        <section class="dh-card lg-5" aria-labelledby="h-itank">
          <h2 id="h-itank" class="host-h2">Tank</h2>
          <div class="host-tankrow" style="margin-top:14px">
            <${DonutGauge} variant="tank" tone="tank" value=${site.tankKwh} max=${site.tankCapacityKwh} size=${116} stroke=${9} label=${`Tank ${Math.round(pct)} percent full`}
              center=${html`<div class="dh-donut__value t-28"><${Num} value=${pct} d=${0} /><span class="unit">%</span></div>`} />
            <dl class="host-facts grow" style="min-width:180px"><div><dt>Current level</dt><dd class="num">${fmt.num(site.tankKwh, 1)}<span class="unit">kWh</span></dd></div><div><dt>Capacity</dt><dd class="num">${fmt.num(site.tankCapacityKwh, 0)}<span class="unit">kWh</span></dd></div>
              <div><dt>Servers</dt><dd class="num">${working}<span class="unit">of ${servers.length} working</span></dd></div><div><dt>Server capacity</dt><dd class="num">${fmt.num(site.capacityKw, 0)}<span class="unit">kW</span></dd></div></dl>
          </div>
          <p class="host-fact__why" style="margin-top:14px">${site.name}, ${site.hostType.toLowerCase()}. Water leaves the servers at 55 to 65 °C and fills this tank.</p>
        </section>

        <section class="dh-card lg-7" aria-labelledby="h-what">
          <h2 id="h-what" class="host-h2">What is running in my plant room?</h2>
          <ul class="host-explain" style="margin-top:14px">
            <li class="tone-heat"><span class="host-explain__n"><${Icon} name="server" size=${16} /></span><span><b>Sealed, liquid-cooled servers.</b>They do computing work for Swiss organisations, such as indexing documents or training AI models.</span></li>
            <li class="tone-tank"><span class="host-explain__n"><${Icon} name="tank" size=${16} /></span><span><b>The electricity comes back as hot water.</b>Most of the electricity the servers use is recovered as heat and stored in your tank.</span></li>
            <li class="tone-idle"><span class="host-explain__n"><${Icon} name="lock" size=${16} /></span><span><b>You never handle any data.</b>The racks are sealed. DigitalHeat operates and maintains them. There is nothing for you to switch on or off.</span></li></ul>
        </section>

        ${servers.map((s, i) => html`<section key=${s.name} class=${cx("dh-card host-server md-6 lg-4", "tone-" + SERVER_TONE[s.status], s.status === "offline" && "is-offline")} aria-label=${`${s.name}, ${s.status}`}>
          <div class="host-server__head"><span class="host-server__name"><span class="host-server__glyph"><${Icon} name="server" size=${20} /></span>${s.name}</span><${StatusChip} kind="server" value=${s.status} /></div>
          <dl class="host-facts"><div><dt>Capacity</dt><dd class="num">${fmt.num(s.capacityKw, 0)}<span class="unit">kW</span></dd></div>
            <div><dt>Heat output now</dt><dd class="num">${s.status === "offline" ? "–" : fmt.num(s.loadKw * 0.8, 1)}<span class="unit">kW</span></dd></div></dl>
          <${HeatPulse} on=${s.status === "working"} load=${s.capacityKw ? s.loadKw / s.capacityKw : 0} label=${s.status === "working" ? "Heat flowing to your tank" : s.status === "idle" ? "No heat, waiting for work" : "Not reachable"} />
          <p class="host-work"><span>Current work</span>${s.status === "offline" ? "This server is not reachable. We have been alerted." : s.workKind || "No work at the moment. The server starts again when your site needs heat."}</p>
          <div class="row" style="margin-top:auto"><${OriginBadge} live=${s.live} /><span class="t-12 faint">${s.live ? "real process on a demo laptop" : "simulated for this demo"}</span></div>
        </section>`)}

        <section class="dh-card lg-12" aria-labelledby="h-help"><div class="row-between wrap"><div><h2 id="h-help" class="host-h2">Something looks wrong in the plant room?</h2><p class="host-lead" style="margin-top:4px">Do not open the racks. Call us, we are reachable around the clock for host businesses.</p></div><${Support} /></div></section>
      </div>
    <//>`;
  }

  /* =========================== Savings and reports =================================================== */
  function download(name, text) {
    const a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function Savings({ st, q, state }) {
    const sv = st.host.savings, ov = DH.sel.hostOverview(st, SITE);
    const verified = sv.tariffVerified || q.verified === "1";
    const [asked, setAsked] = useState(false);
    const months = sv.months, cur = months[months.length - 1];
    const total = sv.totalChf - cur.valueChf + ov.savingsMonthChf;
    const price = st.pricing.heatValueChfPerKwh;
    const report = (m) => {
      const en = st.host.energy.year.find((b) => b.bucket === m.month) || {};
      download(`digitalheat-report-${m.month.slice(0, 7)}.csv`, [
        "DigitalHeat monthly report (illustrative sample data)", `Site,${st.host.user.name}`, `Month,${fmt.month(m.month)}`,
        `Heat demand (kWh),${fmt.num(en.demandKwh || 0, 1).replace(/,/g, "")}`, `Recovered server heat (kWh),${m.serverHeatKwh.toFixed(1)}`, `Backup heat (kWh),${(en.backupHeatKwh || 0).toFixed(1)}`,
        `Recovered heat value (CHF),${m.valueChf.toFixed(2)}`, `Pricing assumption,"${sv.explanation}"`, `Tariff verification,${verified ? "Verified against your tariff" : "Not a verified tariff calculation"}`,
      ].join("\r\n"));
    };
    const bars = months.map((m, i) => ({ label: fmt.monthShort(m.month), tip: fmt.month(m.month), note: `${fmt.num(m.serverHeatKwh, 0)} kWh recovered${i === months.length - 1 ? ", month in progress" : ""}`,
      segments: [{ key: "v", label: "Recovered heat value", value: i === months.length - 1 ? ov.savingsMonthChf : m.valueChf, tone: "heat" }] }));

    const skeleton = html`<div class="host-grid" aria-busy="true"><span class="sr-only">Loading savings and reports</span>${skFact("md-6")}${skFact("md-6")}${skCard(220, "lg-7")}${skCard(220, "lg-5")}</div>`;
    const empty = html`<div class="dh-card"><${EmptyState} icon="file" title="No reports yet" body="Your first monthly report appears here after the first full month of operation. Until then you can follow recovered heat day by day." action=${html`<a class="dh-btn dh-btn--primary" href=${go("/energy")}>See today's energy</a>`} /></div>`;

    return html`<${ViewState} state=${state} skeleton=${skeleton} empty=${empty}>
      <div class="host-grid">
        <div class=${cx("host-verify", verified ? "tone-ok" : "tone-dump")} role="note">
          <${Icon} name=${verified ? "shield" : "info"} size=${20} class="host-verify__icon" />
          <div><div class="host-verify__title">${verified ? "Verified against your tariff" : "Not a verified tariff calculation"}</div>
            <p>${verified ? "Checked on 1 Oct 2025 against the heat tariff in your supply contract. The values below use your verified price per kWh."
              : "The values below use a standard pricing assumption, not your own tariff. They show what the recovered heat is worth at that assumed price."}</p>
            ${!verified && html`<div style="margin-top:10px">${asked ? html`<span class="t-13 row"><${Icon} name="check" size=${14} />Request sent. We will contact you about your tariff.</span>` : html`<button type="button" class="dh-btn" onClick=${() => setAsked(true)}>Ask us to verify with your tariff</button>`}</div>`}</div>
        </div>

        <${Fact} cls="md-6" icon="wallet" tone="idle" label="Recovered heat value this month" prefix="CHF" value=${ov.savingsMonthChf} d=${0} period=${`${monthLong.format(new Date(ov.time))} so far`}
          info=${html`<${InfoPop} label="How the recovered heat value is calculated" align="right"><div class="w-600" style="margin-bottom:6px">Pricing assumption</div><p>${sv.explanation}</p><//>`}
          why=${html`<span class="num">${fmt.num(cur.serverHeatKwh + (ov.savingsMonthChf - cur.valueChf) / price, 0)}</span> kWh of recovered heat at an assumed <span class="num">${fmt.num(price, 3)}</span> CHF per kWh.`} />
        <${Fact} cls="md-6" icon="calendar" tone="idle" label="Recovered heat value this year" prefix="CHF" value=${total} d=${0} period="January to today, 2025" why="The sum of all monthly values below." />

        <section class="dh-card lg-7" aria-labelledby="h-val">
          <div class="host-cardhead"><div><h2 id="h-val" class="host-h2">Recovered heat value per month</h2><p class="dh-card__sub">CHF per month, 2025. The current month is still growing.</p></div></div>
          <${StackedBars} buckets=${bars} unit="CHF per month" d=${0} height=${230} ariaLabel="Recovered heat value per month in Swiss francs" empty="No monthly values yet" />
        </section>

        <section class="dh-card lg-5" aria-labelledby="h-how">
          <h2 id="h-how" class="host-h2">How the value is calculated</h2>
          <blockquote class="host-quote" style="margin-top:14px">${sv.explanation}</blockquote>
          <div style="margin-top:12px"><${AssumptionPill} a=${{ name: "Value of heat", value: `${fmt.num(price, 3)} CHF/kWh`, status: verified ? "SOURCE" : "ASSUMPTION", source: verified ? "Heat tariff from your supply contract, verified 1 Oct 2025." : sv.explanation }} /></div>
          <p class="host-fact__why" style="margin-top:12px">${verified ? "The price per kWh was confirmed against your contract." : "This is a pricing assumption. It is not a comparison with your energy invoices, so we show it as the value of the recovered heat and nothing more."}</p>
        </section>

        <section class="dh-card lg-12" aria-labelledby="h-rep">
          <div class="host-cardhead"><div><h2 id="h-rep" class="host-h2">Monthly reports</h2><p class="dh-card__sub">Heat demand, recovered heat, backup heat and the recovered heat value, as a CSV file.</p></div></div>
          <ul class="host-reports">${months.slice().reverse().map((m, i) => html`<li class="host-report" key=${m.month}>
            <div><div class="host-report__month">${fmt.month(m.month)}${i === 0 ? html` <span class="dh-chip dh-chip--sm tone-idle" style="margin-left:6px;padding-left:8px">In progress</span>` : null}</div><div class="host-report__sub"><span class="num">${fmt.num(m.serverHeatKwh, 0)}</span> kWh recovered</div></div>
            <div class="host-report__chf num"><span class="unit">CHF</span>${fmt.num(i === 0 ? ov.savingsMonthChf : m.valueChf, 0)}</div>
            ${i === 0 ? html`<span class="t-12 faint" style="text-align:right;max-width:96px">Ready on 1 Nov</span>` : html`<button type="button" class="dh-btn" onClick=${() => report(m)} aria-label=${`Download the report for ${fmt.month(m.month)}`}><${Icon} name="download" size=${16} /><span>Download</span></button>`}
          </li>`)}</ul>
        </section>
      </div>
    <//>`;
  }

  /* =========================== Notifications =========================================================== */
  // red only while backup heat or a failure is current; amber for caution; resolved items go quiet
  const noteTone = (n) => (n.resolvedAt ? "idle" : n.severity === "critical" || n.kind === "unmet_demand" || n.kind === "server_offline" ? "critical" : n.severity === "warning" ? "dump" : "idle");
  const noteIcon = (n) => ({ unmet_demand: "flame", server_offline: "wifi-off", maintenance: "wrench", report: "file" }[n.kind] || "info");
  const noteWord = (n) => (n.resolvedAt && n.kind !== "report" ? "Resolved" : { critical: "Needs attention", dump: "Heads-up", idle: "For your information" }[noteTone(n)]);
  function Alerts({ st, q, state }) {
    const now = st.scheduler.currentTime, all = st.host.notifications;
    const filter = q.filter === "unread" ? "unread" : "all";
    const unread = all.filter((n) => !n.read).length;
    const list = all.filter((n) => filter === "all" || !n.read).sort((a, b) => (a.read === b.read ? (a.time < b.time ? 1 : -1) : a.read ? 1 : -1));
    const seg = html`<div class="row-between wrap"><${Segmented} label="Show" value=${filter} onChange=${(v) => DH.router.set({ filter: v === "all" ? null : v })} options=${[{ value: "all", label: `All ${all.length}` }, { value: "unread", label: `Unread ${unread}` }]} />
      ${unread > 0 && html`<button type="button" class="dh-btn dh-btn--ghost" onClick=${() => all.forEach((n) => !n.read && DH.api.readNotification(n.id))}><${Icon} name="check" size=${14} />Mark all as read</button>`}</div>`;
    const calm = html`<div class="dh-card"><${EmptyState} tone="ok" icon="check-circle" title="You are all caught up" body="Nothing needs your attention. We will tell you here when backup heat is needed, a server is offline or a visit is planned." action=${html`<a class="dh-btn" href=${go("/")}>Back to Today</a>`} /></div>`;

    const skeleton = html`<div class="host-notes" aria-busy="true"><span class="sr-only">Loading notifications</span>${[0, 1, 2].map((i) => html`<div class="host-note" key=${i}><${Skeleton} variant="card" w=${40} h=${40} /><div><${Skeleton} w="35%" /><${Skeleton} variant="title" w="75%" style="margin-top:10px" /><${Skeleton} w="95%" style="margin-top:10px" /><${Skeleton} variant="card" h=${44} style="margin-top:12px" /></div></div>`)}</div>`;

    return html`<${ViewState} state=${state} skeleton=${skeleton} empty=${calm}>
      <div class="host-notes">
        ${seg}
        ${list.length === 0 ? calm : list.map((n) => { const tone = noteTone(n);
          return html`<article key=${n.id} class=${cx("host-note", "tone-" + tone, n.read ? "is-read" : "is-unread", n.resolvedAt && "is-resolved")} aria-label=${`${noteWord(n)}: ${n.title}${n.read ? "" : ", unread"}`}>
            <span class="host-note__icon"><${Icon} name=${noteIcon(n)} size=${20} /></span>
            <div>
              <div class="host-note__meta"><span class="host-note__sev"><${Icon} name=${n.resolvedAt && n.kind !== "report" ? "check" : tone === "critical" ? "alert-octagon" : tone === "dump" ? "alert-triangle" : "info"} size=${12} />${noteWord(n)}</span>
                <time datetime=${n.time}>${fmt.dayTime(n.time)}</time><span>${fmt.rel(n.time, now)}</span>${!n.read && html`<span class="sr-only">Unread</span>`}</div>
              <h2 class="host-note__title">${n.title}</h2>
              <p class="host-note__msg">${n.message}</p>
              <div class="host-note__action"><${Icon} name="arrow-right" size=${16} class="faint" /><span><b>Recommended next action</b>${n.recommendedAction}</span></div>
              <div class="host-note__foot">
                ${n.resolvedAt && n.kind !== "report" ? html`<span class="host-note__resolved"><${Icon} name="check-circle" size=${14} />Resolved ${fmt.dayTime(n.resolvedAt)}</span>` : html`<span></span>`}
                <span class="row">${n.kind === "report" && html`<a class="dh-btn" href=${go("/savings")}>Open reports</a>`}
                  <button type="button" class="dh-btn dh-btn--ghost" onClick=${() => DH.api.readNotification(n.id, !n.read)}>${n.read ? "Mark as unread" : "Mark as read"}</button></span>
              </div>
            </div></article>`; })}
      </div>
    <//>`;
  }

  /* =========================== App ======================================================================== */
  const ROUTES = {
    "/": { title: "Today", view: Today },
    "/energy": { title: "Energy", view: Energy },
    "/installation": { title: "My installation", view: Installation },
    "/savings": { title: "Savings and reports", view: Savings },
    "/alerts": { title: "Notifications", view: Alerts },
  };
  function App() {
    const st = DH.useStore(), r = DH.useRoute();
    const path = ROUTES[r.path] ? r.path : "/", route = ROUTES[path];
    const unread = st.host.notifications.filter((n) => !n.read);
    const urgent = unread.some((n) => noteTone(n) === "critical");
    const nav = [
      { path: "/", label: "Today", short: "Today", icon: "sun" },
      { path: "/energy", label: "Energy", short: "Energy", icon: "chart" },
      { path: "/installation", label: "My installation", short: "Installation", icon: "server" },
      { path: "/savings", label: "Savings and reports", short: "Savings", icon: "wallet" },
      { path: "/alerts", label: "Notifications", short: "Alerts", icon: "bell", badge: unread.length || null, alert: urgent },
    ];
    useEffect(() => { document.title = `${route.title} · DigitalHeat Host Portal`; }, [path]);
    const View = route.view;
    return html`<${PortalShell} here="host" product="Host Portal" tabs nav=${nav} current=${path} user=${st.host.user} title=${route.title}
      support=${html`<a class="dh-navitem" href="mailto:hosts@digitalheat.example"><${Icon} name="help" size=${18} /><span>Help and contact</span></a>`}>
      <${View} st=${st} q=${r.q} state=${st.ui.dataState} />
    <//>`;
  }

  DH.mount(App);
})();
