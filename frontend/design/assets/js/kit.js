/* ==========================================================================
   DigitalHeat component kit (Preact + htm, no build step).
   Component names match components.md and the design prompt exactly, so the
   build can port each one to React + TypeScript 1:1.
   ========================================================================== */
(function () {
  const DH = (window.DH = window.DH || {});
  const P = window.htmPreact;
  const { html, render, useState, useEffect, useRef, useLayoutEffect } = P;
  const { fmt, vocab } = DH;
  const cx = (...a) => a.filter(Boolean).join(" ");
  DH.cx = cx;
  DH.html = html;

  /* ---------- Icon ------------------------------------------------------------ */
  const I = {
    map: "M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4zM9 4v13.5M15 6.5V20",
    pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    server: "M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01",
    tasks: "M10 6h10M10 12h10M10 18h10M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17",
    users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M16 3.2a4 4 0 0 1 0 7.6M22 21v-1a6 6 0 0 0-4-5.6",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 21v-1a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v1",
    flask: "M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9",
    activity: "M3 12h4l3-8 4 16 3-8h4",
    coins: "M9 15A6 6 0 1 0 9 3a6 6 0 0 0 0 12zM14.6 9.3a6 6 0 1 1-5.3 5.3",
    sliders: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
    bell: "M6 9a6 6 0 1 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9zM10 20a2 2 0 0 0 4 0",
    play: { d: "M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.5-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z", fill: true },
    pause: { d: "M7 4.5h3.2v15H7zM13.8 4.5H17v15h-3.2z", fill: true },
    "chevron-right": "M9 5l7 7-7 7", "chevron-left": "M15 5l-7 7 7 7", "chevron-down": "M5 9l7 7 7-7", "chevron-up": "M5 15l7-7 7 7",
    "chevrons-up": "M6 12l6-6 6 6M6 19l6-6 6 6",
    x: "M6 6l12 12M18 6 6 18",
    check: "M5 12.5l4.5 4.5L19 7.5",
    "check-circle": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l3 3 5-6",
    "alert-triangle": "M12 4 2.8 20h18.4L12 4zM12 10v4.5M12 17.5h.01",
    "alert-octagon": "M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3L8.3 3zM12 8v5M12 16h.01",
    info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.8h.01",
    flame: "M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-1.6.6-2.8 1.5-3.8.3 1.5 1.2 2.3 2 2.3C10.5 9 10.5 5.5 12 3z",
    droplet: "M12 3.5s6 6 6 10.5a6 6 0 0 1-12 0c0-4.5 6-10.5 6-10.5z",
    wind: "M3 9h10.5A2.5 2.5 0 1 0 11 6.5M3 14h14.5a2.5 2.5 0 1 1-2.5 2.5M3 19h6",
    zap: "M13 3 5 13.5h6l-1 7.5 8-10.5h-6l1-7.5z",
    "wifi-off": "M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4.5-2.6M19 13a10 10 0 0 0-5-2.7M2 9.5a15 15 0 0 1 4.2-2.7M22 9.5A15 15 0 0 0 10.5 5.6M12 20h.01",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
    plus: "M12 5v14M5 12h14", minus: "M5 12h14",
    download: "M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14",
    key: "M8 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 11h9M18 11v4M21 11v3",
    search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
    filter: "M4 5h16l-6 7.5V19l-4-2v-4.5L4 5z",
    list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
    layers: "M12 3 3 8l9 5 9-5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5",
    compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5 5-2z",
    locate: "M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM12 2v4M12 18v4M2 12h4M18 12h4",
    external: "M14 4h6v6M20 4l-9 9M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5",
    bed: "M3 19V6M3 15h18v4M21 15v-2.5a3 3 0 0 0-3-3h-7V15M7 12a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 7 12z",
    waves: "M3 8c2 0 2-1.5 4.5-1.5S10 8 12 8s2-1.5 4.5-1.5S19 8 21 8M3 13c2 0 2-1.5 4.5-1.5S10 13 12 13s2-1.5 4.5-1.5S19 13 21 13M3 18c2 0 2-1.5 4.5-1.5S10 18 12 18s2-1.5 4.5-1.5S19 18 21 18",
    factory: "M3 20V10l5 3v-3l5 3V4h4.5v16M3 20h18M7 16.5h.01M11 16.5h.01",
    washer: "M5 3h14v18H5zM12 17.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 6.2h.01M11 6.2h.01",
    building: "M6 21V4h12v17M3 21h18M9.5 8h1M13.5 8h1M9.5 12h1M13.5 12h1M9.5 16h1M13.5 16h1",
    wheat: "M12 21V9M12 9c0-2.5 1.5-4 3.5-5 .3 2.5-.8 4.3-3.5 5zM12 9c0-2.5-1.5-4-3.5-5-.3 2.5.8 4.3 3.5 5zM12 14c0-2 1.5-3.2 3.8-3.8.1 2.2-1.2 3.6-3.8 3.8zM12 14c0-2-1.5-3.2-3.8-3.8-.1 2.2 1.2 3.6 3.8 3.8zM12 19c0-2 1.5-3.2 3.8-3.8.1 2.2-1.2 3.6-3.8 3.8zM12 19c0-2-1.5-3.2-3.8-3.8-.1 2.2 1.2 3.6 3.8 3.8z",
    "arrow-up": "M12 19V5M6 11l6-6 6 6", "arrow-down": "M12 5v14M6 13l6 6 6-6", "arrow-right": "M5 12h14M13 6l6 6-6 6",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    shield: "M12 3l7.5 3v5.5c0 4.5-3 7.8-7.5 9.5-4.5-1.7-7.5-5-7.5-9.5V6L12 3zM9 12l2.2 2.2L15 10",
    lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
    moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
    shuffle: "M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4",
    calendar: "M5 6h14v14H5zM5 10h14M9 3v4M15 3v4",
    forward: "M5 6l7 6-7 6V6zM13 6l7 6-7 6V6z",
    refresh: "M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5",
    upload: "M12 20V9M7.5 13 12 8.5 16.5 13M5 4h14",
    file: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
    chart: "M4 20V10M10 20V4M16 20v-7M21 20H3",
    leaf: "M5 19c0-8 5-13 15-14-1 10-6 15-14 14zM5 19l7-7",
    grid: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
    help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 16.5h.01",
    sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8",
    wrench: "M14.5 6.5a4 4 0 0 0-5.3 5.3L3.5 17.5v3h3l5.7-5.7a4 4 0 0 0 5.3-5.3L15 12l-3-3 2.5-2.5z",
    wallet: "M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7zM4 7V6a2 2 0 0 1 2-2h10M16 13.5h.01",
    menu: "M4 6h16M4 12h16M4 18h16",
    panel: "M4 5h16v14H4zM9.5 5v14",
    cpu: "M7 7h10v10H7zM10 10h4v4h-4zM9.5 4v3M14.5 4v3M9.5 17v3M14.5 17v3M4 9.5h3M4 14.5h3M17 9.5h3M17 14.5h3",
    eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    copy: "M9 9h11v11H9zM5 15H4V4h11v1",
    trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
    target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
    tank: "M6 5.5C6 4.1 8.7 3 12 3s6 1.1 6 2.5v13c0 1.4-2.7 2.5-6 2.5s-6-1.1-6-2.5v-13zM6 5.5C6 6.9 8.7 8 12 8s6-1.1 6-2.5M6 12.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5",
    sort: "M8 5v14M4.5 15.5 8 19l3.5-3.5M16 19V5M12.5 8.5 16 5l3.5 3.5",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
    plug: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4",
  };
  function Icon({ name, size = 16, class: cls, title }) {
    const def = I[name] || I.info;
    const d = typeof def === "string" ? def : def.d;
    const fill = typeof def !== "string" && def.fill;
    return html`<svg class=${cx("dh-icon", cls)} width=${size} height=${size} viewBox="0 0 24 24" aria-hidden=${title ? null : "true"} role=${title ? "img" : null} style=${fill ? "fill:currentColor;stroke:none" : name === "more" ? "stroke-width:2.8" : null}>
      ${title && html`<title>${title}</title>`}<path d=${d} />
    </svg>`;
  }

  function Logo({ size = 28, word = true, tagline }) {
    return html`<span class="row" style="gap:10px">
      <svg width=${size} height=${size} viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="9" fill="#0F1B2E" stroke="rgba(255,255,255,.14)" />
        <path d="M9 10.5h9.5M9 16h6M9 21.5h3.5" stroke="#FF7A1A" stroke-width="2.6" stroke-linecap="round" />
        <path d="M22 13.2s3.6 3.6 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-2.8 3.6-6.4 3.6-6.4z" fill="#3B82F6" />
      </svg>
      ${word && html`<span class="col" style="gap:0"><span style="font-weight:650;font-size:15px;letter-spacing:-0.01em;line-height:1.15">Digital<span style="color:var(--heat-ink)">Heat</span></span>
        ${tagline && html`<span style="font-size:10.5px;color:var(--text-3);letter-spacing:.04em;line-height:1.2">Compute. Heat. Sustain.</span>`}</span>`}
    </span>`;
  }

  /* ---------- hooks ------------------------------------------------------------ */
  function useTween(target, dur = 400) {
    const [v, setV] = useState(target);
    const cur = useRef(target), raf = useRef(0);
    useEffect(() => {
      if (DH.reducedMotion || !isFinite(target) || !isFinite(cur.current)) { cur.current = target; setV(target); return; }
      const a = cur.current, b = target; if (a === b) return;
      const t0 = performance.now();
      const step = (t) => { const k = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - Math.pow(1 - k, 3); cur.current = a + (b - a) * e; setV(cur.current); if (k < 1) raf.current = requestAnimationFrame(step); };
      raf.current = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf.current);
    }, [target]);
    return v;
  }
  function useSize(ref) {
    const [w, setW] = useState(0);
    useLayoutEffect(() => {
      const el = ref.current; if (!el) return;
      setW(el.clientWidth);
      if (!window.ResizeObserver) return;
      const ro = new ResizeObserver((e) => { const v = Math.round(e[0].contentRect.width); requestAnimationFrame(() => setW(v)); }); ro.observe(el);
      return () => ro.disconnect();
    }, []);
    return w;
  }
  // true for `ms` after `value` changes: used for event-driven one-shot animations
  function useFlash(value, ms = 900) {
    const [on, setOn] = useState(false), first = useRef(true);
    useEffect(() => { if (first.current) { first.current = false; return; } setOn(true); const t = setTimeout(() => setOn(false), ms); return () => clearTimeout(t); }, [value]);
    return on;
  }
  function useEscape(onClose) { useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(e); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, []); }
  function useFocusTrap(ref, active = true) {
    useEffect(() => {
      if (!active || !ref.current) return;
      const el = ref.current, prev = document.activeElement;
      const sel = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
      const first = el.querySelector("[data-autofocus]") || el.querySelector(sel); if (first) first.focus({ preventScroll: true });
      const k = (e) => {
        if (e.key !== "Tab") return;
        const f = [...el.querySelectorAll(sel)].filter((x) => x.offsetParent !== null); if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      };
      el.addEventListener("keydown", k);
      return () => { el.removeEventListener("keydown", k); if (prev && prev.focus) prev.focus({ preventScroll: true }); };
    }, [active]);
  }

  /* ---------- Num: tweened number, brief highlight on the digits that changed -------- */
  function Num({ value, d, dur = 400, class: cls }) {
    const dec = d == null ? fmt.autoD(value) : d;
    const v = useTween(value, dur);
    const fin = fmt.num(value, dec);
    const prev = useRef(fin);
    const [chg, setChg] = useState(null);
    useEffect(() => {
      if (prev.current === fin) return;
      const a = prev.current, b = fin, off = b.length - a.length, idx = new Set();
      for (let i = 0; i < b.length; i++) if (a[i - off] !== b[i] && /\d/.test(b[i])) idx.add(i);
      prev.current = fin; setChg(idx);
      const t = setTimeout(() => setChg(null), 950);
      return () => clearTimeout(t);
    }, [fin]);
    const s = fmt.num(v, dec), shift = fin.length - s.length;
    return html`<span class=${cx("num", cls)}>${chg ? [...s].map((c, i) => (chg.has(i + shift) ? html`<span class="dh-num__chg">${c}</span>` : c)) : s}</span>`;
  }
  // text whose changed characters roll in (clock digits)
  function RollText({ text }) { return html`<span aria-hidden="true">${[...text].map((c, i) => html`<span class="dh-roll" key=${i + c}>${c}</span>`)}</span><span class="sr-only">${text}</span>`; }

  /* ---------- StatusChip, OriginBadge --------------------------------------------- */
  function StatusChip({ kind = "site", value, size, plain, label }) {
    const v = (vocab[kind] || {})[value] || { label: value, tone: "idle", icon: "info" };
    return html`<span class=${cx("dh-chip", "tone-" + v.tone, size === "sm" && "dh-chip--sm", plain && "dh-chip--plain")}><${Icon} name=${v.icon} size=${size === "sm" ? 12 : 14} />${label || v.label}</span>`;
  }
  function OriginBadge({ live, beat }) {
    const flash = useFlash(live ? beat : 0, 900);
    return html`<span class=${cx("dh-origin", live ? "dh-origin--live" : "dh-origin--sim", flash && "is-beat")} title=${live ? "LIVE: a real process running on a laptop" : "SIMULATED: computed by the scheduler model, no real hardware"}>
      <span class="dh-origin__dot"></span>${live ? "Live" : "Simulated"}</span>`;
  }
  function Illustrative({ text = "Illustrative data" }) { return html`<span class="dh-illustrative" title="Sample values for the design prototype. Not measured.">${text}</span>`; }

  /* ---------- KpiTile, KpiRail --------------------------------------------------------- */
  function Trend({ value, prior, d, unit, lowerIsBetter, label = "vs. same time yesterday" }) {
    if (prior == null || !isFinite(prior)) return null; // only when a comparable prior period exists
    const delta = value - prior, flat = Math.abs(delta) < Math.pow(10, -(d || 0)) / 2;
    const good = flat ? null : delta > 0 !== !!lowerIsBetter;
    return html`<span class=${cx("dh-trend", good === true && "tone-ok", good === false && "tone-dump")} title=${label}>
      <${Icon} name=${flat ? "minus" : delta > 0 ? "arrow-up" : "arrow-down"} size=${12} /><span class="num">${fmt.num(Math.abs(delta), d || 0)}</span>${unit ? " " + unit : ""}
      <span class="sr-only">${flat ? "unchanged" : good ? "better" : "worse"} ${label}</span></span>`;
  }
  function KpiTile({ label, value, unit, d, period, tone, icon, prior, lowerIsBetter, size, card, hint, children, text }) {
    return html`<div class=${cx("dh-kpi", tone && "tone-" + tone, size && "dh-kpi--" + size, card && "dh-kpi--card")}>
      <div class="dh-kpi__label">${icon && html`<${Icon} name=${icon} size=${14} />`}${label}${hint}</div>
      <div class="dh-kpi__value">${text != null ? html`<span class="num">${text}</span>` : html`<${Num} value=${value} d=${d} />`}${unit && html`<span class="unit">${unit}</span>`}</div>
      <div class="dh-kpi__foot">${period && html`<span>${period}</span>`}<${Trend} value=${value} prior=${prior} d=${d} lowerIsBetter=${lowerIsBetter} />${children}</div>
    </div>`;
  }
  function KpiRail({ items, class: cls }) { return html`<div class=${cx("dh-glass dh-rail", cls)} role="group" aria-label="Live fleet figures">${items.map((it) => html`<${KpiTile} key=${it.label} ...${it} />`)}</div>`; }

  /* ---------- RackBar, ProgressBar, HeatPulse ------------------------------------------------ */
  function RackBar({ server, onClick, showOrigin, lg, label }) {
    const off = server.status === "offline";
    const Tag = onClick ? "button" : "div";
    const segs = (server.tasks || []).map((t) => ({ t, paused: false })).concat((server.pausedTasks || []).map((t) => ({ t, paused: true })));
    return html`<${Tag} class=${cx("dh-rack", off && "is-offline", lg && "dh-rack--lg", showOrigin && "dh-rack--origin")} onClick=${onClick} type=${onClick ? "button" : null}
      aria-label=${`${server.id}, ${off ? "offline" : `${fmt.num(server.loadKw, 1)} of ${fmt.num(server.capacityKw, 0)} kilowatts in use`}, ${server.live ? "live" : "simulated"}`}>
      <span class="dh-rack__name">${label || server.id}${showOrigin && html`<span class=${cx("dh-origin", server.live ? "dh-origin--live" : "dh-origin--sim")} style="height:16px;padding:0 4px;font-size:9px"><span class="dh-origin__dot"></span>${server.live ? "Live" : "Sim"}</span>`}</span>
      <span class="dh-rack__bar">${!off && segs.map(({ t, paused }) => html`<span key=${t.id} class=${cx("dh-rack__seg", paused && "dh-rack__seg--paused")} style=${`width:${(100 * t.powerKw) / server.capacityKw}%`} title=${`${t.id} · ${t.name} · ${fmt.num(t.powerKw, 1)} kW${paused ? " · paused" : ""}`}></span>`)}</span>
      <span class="dh-rack__load num">${off ? "offline" : html`${fmt.num(server.loadKw, 1)}<span class="faint"> / ${fmt.num(server.capacityKw, 0)} kW</span>`}</span>
    <//>`;
  }
  function ProgressBar({ value, tone = "heat", running, lg, label }) {
    const max = useRef(value); // never jumps backward
    max.current = Math.max(max.current, value || 0);
    const v = Math.min(100, max.current);
    return html`<div class=${cx("dh-progress", "tone-" + tone, running && "is-running", lg && "dh-progress--lg")} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(v)} aria-label=${label || "Progress"}>
      <div class="dh-progress__fill" style=${`width:${v}%`}></div></div>`;
  }
  function CheckDraw({ size = 16 }) { return html`<svg width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true"><path class="dh-check" d="M5 12.5l4.5 4.5L19 7.5" /></svg>`; }
  function HeatPulse({ on, load = 0.6, label }) {
    const dur = Math.round(2400 - 1400 * Math.max(0, Math.min(1, load)));
    return html`<div class=${cx("dh-pulse", on && "is-on")} style=${`--pulse-dur:${dur}ms`} role="img" aria-label=${on ? "Server heat is flowing into the tank" : "No heat flowing: servers idle"}>
      <${Icon} name="server" size=${16} class="dh-pulse__src" /><span class="dh-pulse__path"><span class="dh-pulse__dot"></span></span><${Icon} name="tank" size=${16} class="dh-pulse__dst" />
      ${label && html`<span class="t-12" style="margin-left:8px">${label}</span>`}
    </div>`;
  }

  /* ---------- TaskChain, Timeline ----------------------------------------------------------------- */
  function TaskChain({ task, compact }) {
    const ev = task.events || [];
    const nMig = ev.filter((e) => e.kind === "migrated").length, nPause = ev.filter((e) => e.kind === "paused").length;
    const st = task.state, detour = nMig + nPause > 0;
    const started = !["waiting", "ready"].includes(st) || ev.some((e) => e.kind === "started");
    const terminal = ["done", "missed", "cancelled"].includes(st);
    const steps = [
      { label: st === "ready" ? "Ready" : "Queued", icon: "clock", cls: started ? "is-done" : "is-current", tone: "idle" },
      { label: "Running", icon: "play", cls: !started ? "" : st === "running" && !detour ? "is-current" : "is-done", tone: "heat" },
      st === "paused"
        ? { label: task.hold ? "Paused by operator" : "Paused", icon: "pause", cls: "is-current", tone: "dump" }
        : detour
          ? { label: [nMig && `Migrated ×${nMig}`, nPause && `Paused ×${nPause}`].filter(Boolean).join(", "), icon: "shuffle", cls: st === "running" ? "is-current" : "is-done", tone: st === "running" ? "heat" : "tank" }
          : { label: "No pause or move", icon: "shuffle", cls: terminal ? "is-skipped is-done" : "is-skipped", tone: "idle" },
      st === "missed" ? { label: "Missed deadline", icon: "alert-octagon", cls: "is-current", tone: "critical" }
        : st === "cancelled" ? { label: "Cancelled", icon: "x", cls: "is-current", tone: "idle" }
        : { label: "Complete", icon: "check", cls: st === "done" ? "is-current" : "", tone: "ok" },
    ];
    const text = `Task ${task.id}: ${(vocab.task[st] || {}).label}${nMig ? `, migrated ${nMig} time${nMig > 1 ? "s" : ""}` : ""}${nPause ? `, paused ${nPause} time${nPause > 1 ? "s" : ""}` : ""}`;
    return html`<div class=${cx("dh-chain", compact && "dh-chain--compact")} role="img" aria-label=${text}>
      ${steps.map((s, i) => html`<div key=${i} class=${cx("dh-chain__step", s.cls, "tone-" + s.tone)}><span class="dh-chain__node"><${Icon} name=${s.cls.includes("is-done") && !s.cls.includes("is-skipped") ? "check" : s.icon} size=${11} /></span><span class="dh-chain__label">${s.label}</span></div>`)}
    </div>`;
  }
  function Timeline({ items, empty = "Nothing has happened yet." }) {
    if (!items || !items.length) return html`<p class="t-13 faint">${empty}</p>`;
    return html`<ol class="dh-timeline">${items.map((it) => {
      const v = vocab.event[it.kind] || { tone: it.tone || "idle", icon: it.icon || "info", label: it.kind };
      return html`<li key=${it.id || it.time + it.kind} class=${cx("dh-timeline__item", "tone-" + (it.tone || v.tone), it.isNew && "is-new")}>
        <span class="dh-timeline__dot"><${Icon} name=${it.icon || v.icon} size=${11} /></span>
        <span><span class="w-600">${it.title || v.label}</span>${it.detail && html`<span class="muted"> ${it.detail}</span>`}</span>
        <time class="dh-timeline__time" datetime=${it.time}>${it.timeLabel || fmt.time(it.time)}</time>
      </li>`;
    })}</ol>`;
  }
  // human sentence for one lifecycle event
  DH.eventDetail = function (e) {
    if (e.kind === "migrated") return `${e.fromServerId} → ${e.toServerId}`;
    if (e.kind === "started" || e.kind === "resumed") return e.toServerId ? `on ${e.toServerId}` : "";
    if (e.kind === "paused") return e.by === "operator" ? "by operator" : e.fromServerId ? `on ${e.fromServerId}, tank full` : "";
    if (e.kind === "server_lost") return `${e.fromServerId} went offline`;
    if (e.kind === "completed") return e.fromServerId ? `on ${e.fromServerId}` : "";
    return "";
  };

  /* ---------- DataTable, FilterChips ----------------------------------------------------------------- */
  function DataTable({ columns, rows, rowKey = "id", onRow, selectedKey, initialSort, empty, maxHeight, caption, rowClass, expanded, renderExpanded }) {
    const [sort, setSort] = useState(initialSort || null);
    let data = rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const val = (r) => (col.sortValue ? col.sortValue(r) : r[col.key]);
      data = [...rows].sort((a, b) => { const x = val(a), y = val(b); return (x == null ? 1 : y == null ? -1 : x > y ? 1 : x < y ? -1 : 0) * (sort.dir === "asc" ? 1 : -1); });
    }
    const toggle = (key) => setSort((s) => (s && s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    return html`<div class="dh-table-wrap" style=${maxHeight ? `max-height:${maxHeight}` : null} tabindex="0" role="region" aria-label=${caption || "Table"}>
      <table class="dh-table">
        ${caption && html`<caption class="sr-only">${caption}</caption>`}
        <thead><tr>${columns.map((c) => html`<th key=${c.key} scope="col" class=${c.num ? "is-num" : null} style=${c.width ? `width:${c.width}` : null} aria-sort=${sort && sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : null}>
          ${c.sortable === false ? html`<span>${c.label}</span>` : html`<button type="button" onClick=${() => toggle(c.key)} title=${`Sort by ${c.label}`}>${c.label}<${Icon} name=${sort && sort.key === c.key ? (sort.dir === "asc" ? "arrow-up" : "arrow-down") : "sort"} size=${12} class=${sort && sort.key === c.key ? null : "faint"} /></button>`}
        </th>`)}</tr></thead>
        <tbody>${data.length === 0
          ? html`<tr><td colspan=${columns.length} style="padding:0;white-space:normal">${empty || html`<${EmptyState} compact icon="search" title="No rows match" body="Change or clear the filters to see more." />`}</td></tr>`
          : data.map((r) => html`<tr key=${r[rowKey]} class=${cx(onRow && "is-clickable", selectedKey === r[rowKey] && "is-selected", rowClass && rowClass(r))} onClick=${onRow ? () => onRow(r) : null} tabindex=${onRow ? 0 : null}
              onKeyDown=${onRow ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRow(r); } } : null} aria-selected=${onRow ? selectedKey === r[rowKey] : null}>
              ${columns.map((c) => html`<td key=${c.key} class=${c.num ? "is-num" : null}>${c.render ? c.render(r) : r[c.key]}</td>`)}</tr>
              ${expanded === r[rowKey] && renderExpanded && html`<tr key=${r[rowKey] + "-x"}><td colspan=${columns.length} style="white-space:normal;background:var(--surface-2);padding:0">${renderExpanded(r)}</td></tr>`}`)}
        </tbody>
      </table></div>`;
  }
  function FilterChips({ groups }) {
    return html`<div class="dh-filters" role="group" aria-label="Filters">${groups.map((g) => html`<span class="dh-filtergroup" key=${g.label}><span>${g.label}</span>
      ${g.options.map((o) => html`<button type="button" key=${o.value} class="dh-filterchip" aria-pressed=${g.value === o.value} onClick=${() => g.onChange(g.value === o.value ? null : o.value)}>${o.icon && html`<${Icon} name=${o.icon} size=${12} />`}${o.label}${o.count != null && html`<span class="num faint">${o.count}</span>`}</button>`)}</span>`)}</div>`;
  }

  /* ---------- Tabs, Segmented ---------------------------------------------------------------------------- */
  function Tabs({ tabs, value, onChange, label }) {
    const onKey = (e) => { const i = tabs.findIndex((t) => t.value === value); if (e.key === "ArrowRight") onChange(tabs[(i + 1) % tabs.length].value); if (e.key === "ArrowLeft") onChange(tabs[(i - 1 + tabs.length) % tabs.length].value); };
    return html`<div class="dh-tabs" role="tablist" aria-label=${label} onKeyDown=${onKey}>${tabs.map((t) => html`<button type="button" key=${t.value} role="tab" class="dh-tab" aria-selected=${value === t.value} tabindex=${value === t.value ? 0 : -1} onClick=${() => onChange(t.value)}>${t.label}${t.count != null && html` <span class="num faint">${t.count}</span>`}</button>`)}</div>`;
  }
  function Segmented({ options, value, onChange, label }) {
    return html`<div class="dh-seg" role="group" aria-label=${label}>${options.map((o) => html`<button type="button" key=${o.value} aria-pressed=${value === o.value} onClick=${() => onChange(o.value)} title=${o.title}>${o.icon && html`<${Icon} name=${o.icon} size=${14} />`}${o.label}</button>`)}</div>`;
  }

  /* ---------- Drawer, Pop, ConfirmDialog -------------------------------------------------------------------- */
  function Drawer({ label, onClose, head, children, width, class: cls }) {
    const ref = useRef(null);
    useFocusTrap(ref); useEscape(onClose);
    return html`<aside ref=${ref} class=${cx("dh-drawer", cls)} role="dialog" aria-label=${label} style=${width ? `width:${width}px` : null}>
      <div class="dh-drawer__head">${head}</div><div class="dh-drawer__body">${children}</div></aside>`;
  }
  function Pop({ trigger, children, align = "left", width, label }) {
    const [open, setOpen] = useState(false), ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const out = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      const esc = (e) => { if (e.key === "Escape") { setOpen(false); const b = ref.current && ref.current.querySelector("button"); if (b) b.focus(); } };
      document.addEventListener("mousedown", out); document.addEventListener("keydown", esc);
      return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
    }, [open]);
    return html`<span class="dh-popwrap" ref=${ref}>${trigger({ open, toggle: () => setOpen((o) => !o), props: { "aria-expanded": open, "aria-haspopup": "dialog", onClick: () => setOpen((o) => !o) } })}
      ${open && html`<div class="dh-pop" role="dialog" aria-label=${label} style=${`top:calc(100% + 8px);${align === "right" ? "right:0" : "left:0"};${width ? `width:${width}px;max-width:${width}px` : ""}`}>${typeof children === "function" ? children(() => setOpen(false)) : children}</div>`}</span>`;
  }
  // small "i" affordance that explains a number
  function InfoPop({ label = "How this is calculated", children, align, width = 300 }) {
    return html`<${Pop} align=${align} width=${width} label=${label} trigger=${({ props }) => html`<button type="button" class="dh-iconbtn dh-iconbtn--sm" style="width:22px;height:22px" aria-label=${label} ...${props}><${Icon} name="info" size=${14} /></button>`}>${children}<//>`;
  }
  function ConfirmDialog({ title, body, confirmLabel = "Confirm", cancelLabel = "Keep as is", danger, onConfirm, onCancel }) {
    const ref = useRef(null);
    useFocusTrap(ref); useEscape(onCancel);
    return html`<div class="dh-scrim" onMouseDown=${(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div class="dh-dialog" ref=${ref} role="alertdialog" aria-modal="true" aria-labelledby="dh-dlg-t" aria-describedby="dh-dlg-b">
        <h2 id="dh-dlg-t">${title}</h2><p id="dh-dlg-b">${body}</p>
        <div class="dh-dialog__actions"><button type="button" class="dh-btn" data-autofocus onClick=${onCancel}>${cancelLabel}</button>
          <button type="button" class=${cx("dh-btn", danger ? "dh-btn--danger" : "dh-btn--primary")} onClick=${onConfirm}>${confirmLabel}</button></div>
      </div></div>`;
  }

  /* ---------- ClockControl ------------------------------------------------------------------------------------- */
  function ClockControl({ variant = "bar" }) {
    const st = DH.useStore(), sch = st.scheduler;
    const [beat, setBeat] = useState(false);
    DH.useBus("clock.tick", () => { setBeat(false); requestAnimationFrame(() => setBeat(true)); });
    const [jump, setJump] = useState("");
    const mode = sch.mode === "jumping" ? "Jumping" : sch.paused ? "Paused" : "Live";
    const toggle = () => DH.api.putScheduler({ paused: !sch.paused });
    const bar = html`<div class=${cx("dh-clock", sch.paused && "is-paused", sch.mode === "jumping" && "is-jumping")} title="Simulated time: the scheduler clock, not your wall clock">
      <button type="button" class=${cx("dh-clock__play", beat && !sch.paused && "is-beat")} onClick=${toggle} aria-pressed=${!sch.paused} aria-label=${sch.paused ? "Resume the simulated clock" : "Pause the simulated clock"}><${Icon} name=${sch.paused ? "play" : "pause"} size=${14} /></button>
      <span class="dh-clock__mode">${mode}</span><span class="dh-clock__sep"></span>
      <span class="dh-clock__time" aria-label=${`Simulated time ${fmt.clock(sch.currentTime)}`}><${RollText} text=${fmt.clock(sch.currentTime)} /></span>
      <span class="faint t-12" style="padding-right:8px;white-space:nowrap">Simulated time</span>
    </div>`;
    if (variant === "bar") return bar;
    const jumpTo = () => { if (!jump) return; DH.api.jump(new Date(jump + "T00:00:00+02:00").toISOString()); };
    return html`<div class="col" style="gap:16px">
      <div class="row wrap" style="gap:12px">${bar}
        <${Segmented} label="Clock speed" value=${sch.slotSeconds} onChange=${(v) => DH.api.putScheduler({ slotSeconds: v })} options=${[{ value: 10, label: "10 s / slot" }, { value: 5, label: "5 s / slot" }, { value: 2, label: "2 s / slot" }]} /></div>
      <div class="row wrap" style="gap:8px;align-items:flex-end">
        <div class="dh-field" style="width:170px"><label for="dh-jump">Jump to date</label><input id="dh-jump" class="dh-input dh-input--num" type="date" min="2025-10-23" max="2025-12-31" value=${jump} onInput=${(e) => setJump(e.target.value)} /></div>
        <button type="button" class="dh-btn" onClick=${jumpTo} disabled=${!jump || sch.mode === "jumping"}><${Icon} name="forward" size=${14} />${sch.mode === "jumping" ? "Jumping…" : "Jump forward"}</button>
        <button type="button" class="dh-btn dh-btn--ghost" onClick=${() => DH.api.reset()}><${Icon} name="refresh" size=${14} />Reset run</button>
      </div>
      <p class="t-12 faint">One slot is 15 minutes of simulated time. Jumps go forward only. Reset returns to the start of the run.</p>
    </div>`;
  }

  /* ---------- AlertCard, AlertTray, AlertToasts -------------------------------------------------------------------- */
  function AlertCard({ alert, onAck, onView, now }) {
    const v = vocab.severity[alert.severity] || vocab.severity.info;
    return html`<article class=${cx("dh-alert", "tone-" + v.tone, alert.acknowledged && "is-ack", alert.isNew && "is-new")} aria-label=${`${v.label} alert: ${alert.message}`}>
      <span class="dh-alert__icon"><${Icon} name=${v.icon} size=${16} /></span>
      <div><div class="dh-alert__title">${alert.message}</div>
        <div class="dh-alert__meta"><span class="w-600" style="color:var(--tone-ink)">${v.label}</span><span>${vocab.alertKind[alert.kind] || alert.kind}</span><time class="num" datetime=${alert.time}>${fmt.time(alert.time)}${now ? ` · ${fmt.rel(alert.time, now)}` : ""}</time></div>
        ${(onAck || onView) && html`<div class="dh-alert__actions">
          ${!alert.acknowledged && onAck && html`<button type="button" class="dh-btn dh-btn--sm" onClick=${() => onAck(alert)}><${Icon} name="check" size=${12} />Acknowledge</button>`}
          ${alert.acknowledged && html`<span class="t-12 faint row"><${Icon} name="check" size=${12} />Acknowledged</span>`}
          ${onView && alert.siteId && html`<button type="button" class="dh-btn dh-btn--sm dh-btn--ghost" onClick=${() => onView(alert)}>View site<${Icon} name="chevron-right" size=${12} /></button>`}
          ${onView && !alert.siteId && alert.jobId && html`<button type="button" class="dh-btn dh-btn--sm dh-btn--ghost" onClick=${() => onView(alert)}>View job<${Icon} name="chevron-right" size=${12} /></button>`}
        </div>`}
      </div></article>`;
  }
  function AlertTray({ onView }) {
    const st = DH.useStore();
    const [tab, setTab] = useState("open");
    const open = st.alerts.filter((a) => !a.acknowledged), acked = st.alerts.filter((a) => a.acknowledged);
    const crit = open.filter((a) => a.severity === "critical").length;
    const list = tab === "open" ? open : acked;
    const ack = (a) => DH.api.ackAlert(a.id);
    return html`<${Pop} align="right" width=${392} label="Alerts" trigger=${({ props }) => html`<button type="button" class="dh-iconbtn dh-iconbtn--bordered" aria-label=${`Alerts: ${open.length} open, ${crit} critical`} ...${props}><${Icon} name="bell" size=${18} />${open.length > 0 && html`<span class=${cx("dh-bell__count", !crit && "is-quiet")}>${open.length}</span>`}</button>`}>
      ${(close) => html`<div class="dh-tray" style="position:static;width:auto;max-width:none;margin:-14px -16px;box-shadow:none;border:0;animation:none">
        <div class="dh-tray__head"><span class="w-600">Alerts</span><${Segmented} label="Alert filter" value=${tab} onChange=${setTab} options=${[{ value: "open", label: `Open ${open.length}` }, { value: "ack", label: `Acknowledged ${acked.length}` }]} /></div>
        <div class="dh-tray__list">${list.length === 0
          ? html`<${EmptyState} compact tone="ok" icon="check-circle" title=${tab === "open" ? "No open alerts" : "Nothing acknowledged yet"} body=${tab === "open" ? "Every site is covered and every deadline is on track." : "Alerts you acknowledge are kept here."} />`
          : list.map((a) => html`<${AlertCard} key=${a.id} alert=${a} now=${st.scheduler.currentTime} onAck=${ack} onView=${onView ? (x) => { close(); onView(x); } : null} />`)}</div>
      </div>`}<//>`;
  }
  // critical alerts slide in from the right, then stay in the tray
  function AlertToasts({ onView }) {
    const [items, setItems] = useState([]);
    DH.useBus("alert.raised", (m) => {
      if (m.data.severity !== "critical") return;
      setItems((x) => [...x, m.data].slice(-3));
      setTimeout(() => setItems((x) => x.filter((a) => a.id !== m.data.id)), 9000);
    });
    const drop = (a) => setItems((x) => x.filter((y) => y.id !== a.id));
    return html`<div class="dh-toasts" role="status" aria-live="assertive">${items.map((a) => html`<${AlertCard} key=${a.id} alert=${Object.assign({}, a, { isNew: true })} onAck=${(x) => { DH.api.ackAlert(x.id); drop(x); }} onView=${onView ? (x) => { drop(x); onView(x); } : null} />`)}</div>`;
  }

  /* ---------- EmptyState, ErrorState, Skeleton, ConnectionBanner ------------------------------------------------------ */
  function EmptyState({ icon = "search", title, body, action, tone, compact }) {
    return html`<div class=${cx("dh-empty", compact && "dh-empty--compact", tone && "tone-" + tone)}>
      <span class="dh-empty__icon"><${Icon} name=${icon} size=${24} /></span>
      <div class="dh-empty__title">${title}</div>${body && html`<p class="dh-empty__body">${body}</p>`}${action}</div>`;
  }
  function ErrorState({ title = "This view could not be loaded", body = "The server did not answer. Your data is safe, nothing was changed.", code = "GET /api/v1 failed, 503", onRetry, compact }) {
    return html`<div class=${cx("dh-empty tone-critical", compact && "dh-empty--compact")} role="alert">
      <span class="dh-empty__icon"><${Icon} name="alert-octagon" size=${24} /></span>
      <div class="dh-empty__title">${title}</div><p class="dh-empty__body">${body}</p><code class="num t-12 faint">${code}</code>
      <button type="button" class="dh-btn" onClick=${onRetry}><${Icon} name="refresh" size=${14} />Try again</button></div>`;
  }
  function Skeleton({ w, h, variant = "text", style }) { return html`<span class=${cx("dh-skel", "dh-skel--" + variant)} style=${`${w != null ? `width:${typeof w === "number" ? w + "px" : w};` : ""}${h != null ? `height:${typeof h === "number" ? h + "px" : h};` : ""}${style || ""}`} aria-hidden="true"></span>`; }
  function SkeletonBlock({ rows = 3, card }) {
    const body = html`<${Skeleton} variant="title" /><div class="col" style="gap:10px;margin-top:16px">${Array.from({ length: rows }, (_, i) => html`<${Skeleton} key=${i} w=${`${92 - i * 14}%`} />`)}</div>`;
    return card ? html`<div class="dh-card" aria-busy="true"><span class="sr-only">Loading</span>${body}</div>` : html`<div aria-busy="true"><span class="sr-only">Loading</span>${body}</div>`;
  }
  function ConnectionBanner({ onRetry }) {
    const [n, setN] = useState(8);
    useEffect(() => { const t = setInterval(() => setN((x) => (x <= 1 ? 8 : x - 1)), 1000); return () => clearInterval(t); }, []);
    return html`<div class="dh-banner tone-dump" role="status" aria-live="polite">
      <${Icon} name="wifi-off" size=${16} /><span><b>Connection lost.</b> Showing the last values received. Retrying in <span class="num">${n}</span> s.</span>
      <button type="button" class="dh-btn dh-btn--sm" onClick=${onRetry}><${Icon} name="refresh" size=${12} />Retry now</button></div>`;
  }
  /* Wraps a screen: picks skeleton / empty / error / content from the data state.
     state comes from the URL (?state=loading|empty|error|reconnecting) so every state is linkable. */
  function ViewState({ state, skeleton, empty, error, children }) {
    const retry = () => DH.router.set({ state: null });
    if (state === "loading") return skeleton || html`<${SkeletonBlock} card rows=${4} />`;
    if (state === "error") return error || html`<div class="dh-card"><${ErrorState} onRetry=${retry} /></div>`;
    if (state === "empty") return empty || html`<div class="dh-card"><${EmptyState} title="Nothing here yet" /></div>`;
    return html`<div class=${cx("dh-reveal", state === "reconnecting" && "is-stale")}>${children}</div>`;
  }

  /* ---------- AssumptionPill, PayOffStatement ---------------------------------------------------------------------------- */
  const ASSUME_TEXT = { BRIEF: "From the case brief", SOURCE: "Named public source", ASSUMPTION: "Our own choice, to be confirmed", MOCK: "Test input that must be replaced", LIMIT: "Known simplification of the model", OK: "Setting" };
  function AssumptionPill({ a, inline, align }) {
    const tone = vocab.assumption[a.status.split(" ")[0]] || "idle";
    return html`<${Pop} align=${align} width=${320} label=${`Assumption: ${a.name}`} trigger=${({ props }) => html`<button type="button" class=${cx("dh-assume", "tone-" + tone, inline && "dh-assume--inline")} ...${props}>
        <span class="dh-assume__status">${a.status}</span>${!inline && html`<span class="w-600" style="white-space:nowrap">${a.name}</span>`}<span class="dh-assume__value">${a.value}</span></button>`}>
      <div class="w-600" style="margin-bottom:10px">${a.name}</div>
      <dl><dt>Value</dt><dd class="num">${a.value}</dd><dt>Status</dt><dd><span class=${cx("dh-assume__status", "tone-" + tone)}>${a.status}</span> <span class="muted t-12">${ASSUME_TEXT[a.status.split(" ")[0]] || ""}</span></dd><dt>Source</dt><dd class="muted">${a.source || "Not given"}</dd></dl><//>`;
  }
  function PayOffStatement({ text, source = "payOffStatement, GET /admin/results", generatedAt, algorithm }) {
    // the sentence is shown verbatim; numbers and the word NOT are only emphasised, never rewritten
    const parts = String(text || "").split(/(\bNOT\b|\d[\d,]*(?:\.\d+)?(?:\sCHF(?:\/kWh)?)?)/g);
    return html`<figure class="dh-payoff" style="margin:0">
      <div class="eyebrow" style="margin-bottom:8px">When the model does not pay off</div>
      <blockquote class="dh-payoff__text" style="margin:0">${parts.map((p, i) => (p === "NOT" ? html`<mark key=${i}>NOT</mark>` : /^\d/.test(p) ? html`<b key=${i}>${p}</b>` : p))}</blockquote>
      <figcaption class="dh-payoff__foot"><span>Verbatim from the backend: <code class="num">${source}</code></span>${algorithm && html`<span>Algorithm: ${algorithm.toUpperCase()}</span>`}${generatedAt && html`<span>Run of ${fmt.date(generatedAt)}</span>`}</figcaption>
    </figure>`;
  }

  /* ---------- Legend ------------------------------------------------------------------------------------------------------ */
  function Legend({ items }) { return html`<div class="dh-legend">${items.map((it) => html`<span class=${cx("dh-legend__item", it.tone && "tone-" + it.tone)} key=${it.label}><span class=${cx("dh-swatch", it.line && "dh-swatch--line", it.dash && "dh-swatch--dash")} style=${it.color ? `--tone:${it.color}` : null}></span>${it.label}</span>`)}</div>`; }

  /* ---------- Prototype bar: switch data states, reduced motion, jump between the three experiences --------------------------- */
  function ProtoBar({ here }) {
    const r = DH.useRoute(); DH.useStore();
    const cur = r.q.state || "live";
    const states = [["live", "Live"], ["loading", "Loading"], ["empty", "Empty"], ["error", "Error"], ["reconnecting", "Reconnecting"]];
    const links = [["system", "System"], ["ops", "Ops"], ["compute", "Compute"], ["host", "Host"]];
    return html`<div class="dh-proto" role="group" aria-label="Prototype controls, not part of the product">
      <span>Prototype · state</span>${states.map(([v, l]) => html`<button type="button" key=${v} aria-pressed=${cur === v} onClick=${() => DH.router.set({ state: v === "live" ? null : v })}>${l}</button>`)}
      <button type="button" aria-pressed=${DH.reducedMotion} onClick=${() => DH.setReducedMotion(!DH.reducedMotion)} title="Simulate prefers-reduced-motion">Reduced motion</button>
      <span style="opacity:.5">|</span>${links.filter(([k]) => k !== here).map(([k, l]) => html`<a key=${k} href=${`../${k}/index.html`}>${l}</a>`)}
    </div>`;
  }

  /* ---------- PortalShell: shared frame of the Compute and Host portals ----------------------------------------------------
     nav: [{ path, label, short?, icon, badge?, alert? }] · tabs: true = bottom tab bar on phone (Host), false = slide-in menu (Compute) */
  function PortalShell({ here, product, nav, current, user, title, actions, tabs, support, children }) {
    const st = DH.useStore();
    const [menu, setMenu] = useState(false);
    const state = st.ui.dataState;
    const link = (n, cls) => html`<a key=${n.path} class=${cls} href=${DH.router.href(n.path, state !== "live" ? { state } : null)} aria-current=${current === n.path ? "page" : null} onClick=${() => setMenu(false)} title=${n.label}>
      <${Icon} name=${n.icon} size=${cls === "dh-navitem" ? 18 : 20} /><span>${n.short && cls !== "dh-navitem" ? n.short : n.label}</span>${n.badge ? html`<span class=${cx("dh-navitem__badge", n.alert && "is-alert")}>${n.badge}</span>` : null}</a>`;
    return html`<div class=${cx("dh-shell", tabs && "has-tabbar")} data-theme="light">
      <aside class=${cx("dh-side", menu && "is-open")} data-theme="dark" aria-label=${product}>
        <div class="dh-side__brand"><${Logo} tagline /><span class="dh-side__product">${product}</span></div>
        <nav class="dh-nav" aria-label="Main">${nav.map((n) => link(n, "dh-navitem"))}</nav>
        <div class="dh-side__foot">${support}
          <div class="dh-side__user"><span class="dh-avatar" aria-hidden="true">${user.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span><div class="col" style="gap:0;min-width:0"><span class="t-13 w-600 truncate">${user.name}</span><span class="t-12 faint truncate">${user.contact}</span></div></div></div>
      </aside>
      <div class="dh-main">
        <div class="dh-mobilebar" data-theme="dark">${!tabs && html`<button type="button" class="dh-iconbtn" aria-label="Open menu" aria-expanded=${menu} onClick=${() => setMenu((m) => !m)}><${Icon} name="menu" size=${20} /></button>`}<${Logo} size=${26} /><span class="grow"></span><span class="t-12 faint">${user.name}</span></div>
        ${state === "reconnecting" && html`<${ConnectionBanner} onRetry=${() => DH.router.set({ state: null })} />`}
        <header class="dh-topbar"><h1 class="grow">${title}</h1>${actions}
          <span class="dh-simtime" title="Simulated time: the scheduler clock of the demo, not your wall clock"><${Icon} name="clock" size=${14} />Simulated time <b>${fmt.clock(st.scheduler.currentTime)}</b></span><${Illustrative} /></header>
        <main class="dh-content dh-page" key=${current} id="main">${children}</main>
      </div>
      ${tabs && html`<nav class="dh-tabbar" aria-label="Main">${nav.map((n) => link(n, "dh-tab-link"))}</nav>`}
      <${ProtoBar} here=${here} />
    </div>`;
  }

  DH.mount = (App, el) => render(html`<${App} />`, el || document.getElementById("app"));
  Object.assign(DH, {
    Icon, Logo, Num, RollText, StatusChip, OriginBadge, Illustrative, Trend, KpiTile, KpiRail, RackBar, ProgressBar, CheckDraw, HeatPulse,
    TaskChain, Timeline, DataTable, FilterChips, Tabs, Segmented, Drawer, Pop, InfoPop, ConfirmDialog, ClockControl,
    AlertCard, AlertTray, AlertToasts, EmptyState, ErrorState, Skeleton, SkeletonBlock, ConnectionBanner, ViewState,
    AssumptionPill, PayOffStatement, Legend, ProtoBar, PortalShell, useTween, useSize, useFlash, useEscape, useFocusTrap,
  });
})();
