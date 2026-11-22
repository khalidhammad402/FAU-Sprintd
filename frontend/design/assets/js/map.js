/* ==========================================================================
   DigitalHeat FleetMap: SiteMarker3D + MigrationArc on a stylised Basel base.

   Offline-safe by construction: no tiles, no network. In the production build
   this canvas is the fallback behind MapLibre GL + deck.gl (free tiles); the
   markers, arcs, view modes and camera behaviour are specified here.

   Nothing moves unless data moved:
     slot.tick      -> column height tween 500 ms, one heat pulse per working site
     status change  -> colour crossfade 300 ms + one ripple at the base
     servers change -> ring sweep 400 ms + one ping
     task.migrated  -> arc draws 900 ms, bead travels, source dims, target pulses once
     dumping        -> slow amber shimmer on the column top (while the state lasts)
     unmet          -> red glow breathing at 2.4 s (while the state lasts)
   ========================================================================== */
(function () {
  const DH = window.DH, P = window.htmPreact;
  const { html, useState, useEffect, useRef } = P;
  const { fmt, cx, Icon, StatusChip, OriginBadge, vocab } = DH;

  /* ---------- world: local metres around the fleet ---------------------------- */
  const C0 = { lat: 47.5607, lon: 7.6065 };
  const M_LAT = 110540, M_LON = 111320 * Math.cos((C0.lat * Math.PI) / 180);
  const xy = (lat, lon) => [(lon - C0.lon) * M_LON, (lat - C0.lat) * M_LAT];
  const COL = { covered: [52, 211, 153], tank_low: [59, 130, 246], dumping: [251, 191, 36], unmet: [240, 82, 82], offline: [148, 163, 184] };
  const HEAT = [255, 122, 26];
  const HOME_BEARING = 0.78; // the fleet runs north to south: a turned camera uses the wide screen better
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const lerp = (a, b, k) => a + (b - a) * k;
  const c01 = (v) => Math.max(0, Math.min(1, v)); // frame timestamps can lag behind event timestamps

  function spline(pts, n = 14) { // Catmull-Rom through pts
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let j = 0; j < n; j++) { const t = j / n, t2 = t * t, t3 = t2 * t;
        out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); }
    }
    out.push(pts[pts.length - 1]); return out;
  }
  function ribbon(line, half) { // polygon around a polyline
    const L = [], R = [];
    line.forEach((p, i) => { const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d; L.push([p[0] - dy * half, p[1] + dx * half]); R.push([p[0] + dy * half, p[1] - dx * half]); });
    return L.concat(R.reverse());
  }
  const distTo = (line, x, y) => { let m = 1e9; for (let i = 0; i < line.length; i += 2) { const d = Math.hypot(line[i][0] - x, line[i][1] - y); if (d < m) m = d; } return m; };

  // the Rhine through Basel (the "Rheinknie"), the Wiese and the Birs: stylised, not survey data
  const RHINE = spline([[47.5568, 7.662], [47.5562, 7.648], [47.556, 7.635], [47.5546, 7.622], [47.5588, 7.6125], [47.5571, 7.5975], [47.5606, 7.589], [47.565, 7.5855], [47.5745, 7.585], [47.583, 7.5875], [47.5897, 7.589], [47.599, 7.59], [47.61, 7.592]].map((p) => xy(p[0], p[1])));
  const WIESE = spline([[47.583, 7.589], [47.5812, 7.602], [47.5798, 7.618], [47.5815, 7.634], [47.585, 7.65]].map((p) => xy(p[0], p[1])), 8);
  const BIRS = spline([[47.5546, 7.622], [47.547, 7.6195], [47.538, 7.6175], [47.528, 7.614], [47.515, 7.612]].map((p) => xy(p[0], p[1])), 8);
  const WATER = [ribbon(RHINE, 105), ribbon(WIESE, 22), ribbon(BIRS, 20)];
  const BRIDGES = [[47.5606, 7.589, 0.9], [47.5571, 7.5975, 0.35], [47.5652, 7.5855, 1.45], [47.5745, 7.585, 1.57], [47.5588, 7.6125, 0.55]].map(([la, lo, ang]) => { const [x, y] = xy(la, lo), dx = Math.cos(ang) * 160, dy = Math.sin(ang) * 160; return [[x - dx, y - dy], [x + dx, y + dy]]; });
  const RAIL = spline([[47.535, 7.57], [47.5476, 7.5896], [47.549, 7.61], [47.5585, 7.6135], [47.5673, 7.6075], [47.58, 7.604], [47.598, 7.6]].map((p) => xy(p[0], p[1])), 10);
  const ROADS = [
    spline([[47.53, 7.588], [47.5476, 7.5896], [47.5565, 7.588], [47.5606, 7.589], [47.5688, 7.5935], [47.58, 7.597], [47.595, 7.6]].map((p) => xy(p[0], p[1])), 8),
    spline([[47.566, 7.555], [47.563, 7.575], [47.5606, 7.589], [47.5612, 7.6], [47.563, 7.618], [47.566, 7.64], [47.568, 7.66]].map((p) => xy(p[0], p[1])), 8),
    spline([[47.542, 7.56], [47.5435, 7.58], [47.5412, 7.5935], [47.5425, 7.61], [47.5368, 7.6292], [47.534, 7.65]].map((p) => xy(p[0], p[1])), 8),
    spline([[47.5846, 7.5945], [47.5742, 7.6062], [47.5673, 7.6075], [47.5598, 7.6168], [47.552, 7.628]].map((p) => xy(p[0], p[1])), 8),
  ];
  const DISTRICTS = [[47.5565, 7.588, 760, 0.35, 0.95, 26], [47.564, 7.596, 820, -0.2, 0.9, 22], [47.544, 7.593, 760, 0.1, 0.85, 18], [47.569, 7.576, 640, 0.5, 0.8, 18], [47.583, 7.596, 640, 0.05, 0.75, 24],
    [47.552, 7.612, 560, -0.3, 0.7, 14], [47.563, 7.616, 760, 0.15, 0.7, 14], [47.5735, 7.606, 640, -0.1, 0.75, 20], [47.535, 7.6, 520, 0.2, 0.4, 9], [47.553, 7.634, 520, 0, 0.55, 11], [47.5372, 7.629, 420, 0.4, 0.22, 7], [47.576, 7.628, 520, 0.3, 0.4, 10], [47.548, 7.572, 560, -0.15, 0.6, 12]];

  let BUILDINGS = null;
  function buildings(sites) {
    if (BUILDINGS) return BUILDINGS;
    const r = DH.sampleData.rng(11), out = [], sp = sites.map((s) => xy(s.lat, s.lon));
    DISTRICTS.forEach(([la, lo, rad, rot, dens, hmax]) => {
      const [cx0, cy0] = xy(la, lo), cs = Math.cos(rot), sn = Math.sin(rot);
      for (let gx = -rad; gx <= rad; gx += 118) for (let gy = -rad; gy <= rad; gy += 96) {
        const d = Math.hypot(gx, gy); if (d > rad || r() > dens * Math.sqrt(1 - d / rad) + 0.08) continue;
        const x = cx0 + gx * cs - gy * sn + (r() - 0.5) * 16, y = cy0 + gx * sn + gy * cs + (r() - 0.5) * 16;
        if (distTo(RHINE, x, y) < 165 || distTo(WIESE, x, y) < 60 || distTo(BIRS, x, y) < 60) continue;
        if (sp.some((p) => Math.hypot(p[0] - x, p[1] - y) < 135)) continue;
        if (out.some((b) => Math.abs(b.x - x) < 84 && Math.abs(b.y - y) < 84 && Math.hypot(b.x - x, b.y - y) < 84)) continue;
        const w = 30 + r() * 20, dp = 22 + r() * 16, h = 6 + r() * hmax * (1 - (d / rad) * 0.6);
        out.push({ x, y, w, d: dp, h, cs, sn });
      }
    });
    return (BUILDINGS = out);
  }

  /* ---------- FleetMap component --------------------------------------------------- */
  function FleetMap({ view = "demand", selected, onSelect, intro, onIntroDone, inset, height, specimen }) {
    const st = DH.useStore();
    const wrap = useRef(null), canvas = useRef(null), badges = useRef({}), tipRef = useRef(null);
    const S = useRef(null); // imperative scene state
    const [hover, setHover] = useState(null);
    const [is3d, set3d] = useState(true);
    const propsRef = useRef({}); propsRef.current = { view, selected, inset: inset || { l: 0, r: 0, t: 0, b: 0 }, hover };

    // one-time scene
    if (!S.current) {
      S.current = {
        cam: { tx: 0, ty: 0, zoom: 0.1, bearing: HOME_BEARING, pitch: 55 }, camAnim: null, w: 0, h: 0, raf: 0, t0: performance.now(),
        cols: {}, arcs: [], pulses: [], ripples: [], dim: {}, introT: intro ? performance.now() : null, fade: intro ? 0 : 1, dirty: true, pos: {},
      };
      st.sites.forEach((s) => { S.current.cols[s.id] = { h: intro ? 0 : 1, from: 0, to: 1, t: 0, c: COL[s.status].slice(), cFrom: COL[s.status], cTo: COL[s.status], ct: 0, demand: s.demandKwh, dFrom: s.demandKwh, dTo: s.demandKwh, dt: 0, status: s.status, run: s.serversRunning }; });
      // recent migrations from the event history are shown as settled arcs
      st.stream.filter((e) => e.kind === "migrated" && e.fromSite && e.toSite && e.fromSite !== e.toSite).slice(0, 4).forEach((e) => S.current.arcs.push({ from: e.fromSite, to: e.toSite, t0: -1e9, id: e.id, settled: true, born: st.scheduler.slot - 1 }));
    }
    const sc = S.current;

    const project = (x, y, z = 0) => {
      const c = sc.cam, cs = Math.cos(c.bearing), sn = Math.sin(c.bearing), dx = x - c.tx, dy = y - c.ty;
      const rx = dx * cs - dy * sn, ry = dx * sn + dy * cs, p = (c.pitch * Math.PI) / 180;
      const ins = propsRef.current.inset;
      return [ins.l + (sc.w - ins.l - ins.r) / 2 + rx * c.zoom, ins.t + (sc.h - ins.t - ins.b) / 2 - ry * c.zoom * Math.cos(p) - z * c.zoom * Math.sin(p), ry];
    };
    // frame the whole fleet inside the free area: room above for columns and badges, room right for labels
    const fitCam = (pitch, bearing = HOME_BEARING) => {
      const pd = pitch == null ? sc.cam.pitch : pitch, p = (pd * Math.PI) / 180, cosP = Math.max(0.3, Math.cos(p)), cs = Math.cos(bearing), sn = Math.sin(bearing);
      const pts = st.sites.map((s) => xy(s.lat, s.lon)).map(([x, y]) => [x * cs - y * sn, x * sn + y * cs]), xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const ins = propsRef.current.inset, colH = 190 * Math.sin(p) / 0.819 + 50;
      const L = ins.l + 44, R = sc.w - ins.r - 190, T = ins.t + colH, B = sc.h - ins.b - 36;
      const zoom = Math.max(0.04, Math.min(Math.max(120, R - L) / (Math.max(...xs) - Math.min(...xs)), Math.max(120, B - T) / ((Math.max(...ys) - Math.min(...ys)) * cosP)));
      // rotated centre of the fleet, shifted so it lands in the middle of the free area
      const rcx = (Math.max(...xs) + Math.min(...xs)) / 2 - ((L + R) / 2 - (ins.l + (sc.w - ins.l - ins.r) / 2)) / zoom;
      const rcy = (Math.max(...ys) + Math.min(...ys)) / 2 + ((T + B) / 2 - (ins.t + (sc.h - ins.t - ins.b) / 2)) / zoom / cosP;
      return { tx: rcx * cs + rcy * sn, ty: -rcx * sn + rcy * cs, zoom, bearing, pitch: pd };
    };
    const flyTo = (to, dur = 700) => { if (DH.reducedMotion) { Object.assign(sc.cam, to); kick(); return; } sc.camAnim = { from: Object.assign({}, sc.cam), to: Object.assign({}, sc.cam, to), t0: performance.now(), dur }; kick(); };

    /* ----- drawing ----- */
    function draw(now) {
      const cv = canvas.current; if (!cv) return false;
      const ctx = cv.getContext("2d"), dpr = window.devicePixelRatio || 1, pr = propsRef.current, v = pr.view;
      let active = false;
      if (sc.camAnim) { const a = sc.camAnim, k = c01((now - a.t0) / a.dur), e = easeOut(k); ["tx", "ty", "zoom", "bearing", "pitch"].forEach((f) => (sc.cam[f] = lerp(a.from[f], a.to[f], e))); if (k >= 1) sc.camAnim = null; else active = true; }
      if (sc.introT != null) { const k = c01((now - sc.introT) / 700); sc.fade = k; if (k < 1) active = true; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, sc.w, sc.h);
      ctx.globalAlpha = sc.fade;
      const cam = sc.cam, sinP = Math.sin((cam.pitch * Math.PI) / 180), cosP = Math.cos((cam.pitch * Math.PI) / 180);
      const poly = (pts, z) => { ctx.beginPath(); pts.forEach((p, i) => { const q = project(p[0], p[1], z || 0); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); };

      // ground grid: 250 m fine, 1 km strong
      const ext = 9000;
      for (let g = -ext; g <= ext; g += 250) {
        const strong = g % 1000 === 0; ctx.strokeStyle = strong ? "rgba(148,163,184,0.075)" : "rgba(148,163,184,0.03)"; ctx.lineWidth = 1;
        let a = project(g, -ext), b = project(g, ext); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        a = project(-ext, g); b = project(ext, g); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      // water
      WATER.forEach((w, i) => { poly(w); ctx.closePath(); ctx.fillStyle = i ? "rgba(21,48,84,0.5)" : "rgba(17,40,72,0.9)"; ctx.fill(); ctx.strokeStyle = "rgba(96,150,220,0.16)"; ctx.lineWidth = 1; ctx.stroke(); });
      // roads, rail, bridges
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ROADS.forEach((r) => { poly(r); ctx.strokeStyle = "rgba(148,163,184,0.10)"; ctx.lineWidth = Math.max(1, cam.zoom * 16); ctx.stroke(); });
      poly(RAIL); ctx.setLineDash([6, 5]); ctx.strokeStyle = "rgba(148,163,184,0.14)"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      BRIDGES.forEach((b) => { poly(b, 6); ctx.strokeStyle = "rgba(190,205,225,0.3)"; ctx.lineWidth = Math.max(1.5, cam.zoom * 18); ctx.stroke(); });

      // buildings: low-contrast extrusions, far to near
      const dimBase = v === "status" || v === "arcs" ? 0.6 : 1;
      const bs = buildings(st.sites).map((b) => { const c = project(b.x, b.y); return { b, ry: c[2], sx: c[0], sy: c[1] }; }).filter((o) => o.sx > -60 && o.sx < sc.w + 60 && o.sy > -60 && o.sy < sc.h + 80).sort((p, q) => q.ry - p.ry);
      bs.forEach(({ b }) => {
        const cr = [[-b.w, -b.d], [b.w, -b.d], [b.w, b.d], [-b.w, b.d]].map(([px, py]) => [b.x + px * b.cs - py * b.sn, b.y + px * b.sn + py * b.cs]);
        const base = cr.map((p) => project(p[0], p[1], 0)), top = cr.map((p) => project(p[0], p[1], b.h));
        if (sinP > 0.05) for (let i = 0; i < 4; i++) { const j = (i + 1) % 4;
          if (base[j][0] - base[i][0] <= 0.5) continue; // only edges running left-to-right on screen face the camera
          ctx.beginPath(); ctx.moveTo(base[i][0], base[i][1]); ctx.lineTo(base[j][0], base[j][1]); ctx.lineTo(top[j][0], top[j][1]); ctx.lineTo(top[i][0], top[i][1]); ctx.closePath();
          ctx.fillStyle = `rgba(${i % 2 ? "12,24,42" : "9,19,35"},${0.96 * dimBase})`; ctx.fill(); }
        ctx.beginPath(); top.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
        ctx.fillStyle = `rgba(17,32,54,${0.97 * dimBase})`; ctx.fill(); ctx.strokeStyle = `rgba(148,170,205,${0.09 * dimBase})`; ctx.lineWidth = 1; ctx.stroke();
      });

      // site columns
      const dmax = Math.max(...st.sites.map((s) => s.demandKwh), 0.1);
      const zf = Math.max(0.75, Math.min(1.6, cam.zoom / 0.11));
      const order = st.sites.map((s) => ({ s, p: xy(s.lat, s.lon) })).map((o) => Object.assign(o, { q: project(o.p[0], o.p[1]) })).sort((a, b) => b.q[2] - a.q[2]);
      order.forEach(({ s, q }, idx) => {
        const col = sc.cols[s.id]; let k;
        // the store is the source of truth: a new reading starts the height tween, a new status starts the crossfade and one ripple
        if (col.dTo !== s.demandKwh) { col.dFrom = col.demand; col.dTo = s.demandKwh; col.dt = DH.reducedMotion ? -1e9 : now; }
        if (col.status !== s.status) { col.cFrom = col.c.slice(); col.cTo = COL[s.status]; col.ct = DH.reducedMotion ? -1e9 : now; col.status = s.status; if (!DH.reducedMotion && sc.introT == null) sc.ripples.push({ id: s.id, t0: now, c: COL[s.status] }); }
        // tweens: rise (intro), demand (500 ms), colour (300 ms)
        if (sc.introT != null) { const t = now - sc.introT - 450 - idx * 60; col.h = t <= 0 ? 0 : easeOut(Math.min(1, t / 620)); if (col.h < 1) active = true; } else col.h = 1;
        k = c01((now - col.dt) / 500); col.demand = lerp(col.dFrom, col.dTo, easeOut(k)); if (k < 1) active = true;
        k = c01((now - col.ct) / 300); col.c = col.cFrom.map((c, i) => lerp(c, col.cTo[i], k)); if (k < 1) active = true;
        const isSel = pr.selected === s.id, isHover = pr.hover === s.id, off = s.status === "offline";
        const c = v === "servers" ? [148, 163, 184] : col.c;
        let alpha = v === "arcs" ? 0.3 : v === "servers" ? 0.4 : 1;
        const dimUntil = sc.dim[s.id]; if (dimUntil && now < dimUntil) { alpha *= 0.45; active = true; }
        if (pr.selected && !isSel) alpha *= 0.72;
        const rpx = Math.max(9, Math.min(24, 62 * cam.zoom)) * (isSel || isHover ? 1.12 : 1), ery = rpx * cosP;
        const frac = v === "status" ? 0.55 : Math.pow(col.demand / dmax, 0.8);
        const hpx = (14 + 150 * frac) * (sinP / 0.819) * zf * col.h * (off ? 0.5 : 1);
        const x = q[0], yb = q[1], yt = yb - hpx;
        // ground glow: intensity follows demand, breathing when backup heat is needed
        let glow = off ? 0 : 0.2 + 0.4 * frac;
        if (s.status === "unmet" && !DH.reducedMotion) { glow *= 0.75 + 0.5 * (0.5 + 0.5 * Math.sin(((now - sc.t0) / 2400) * 2 * Math.PI)); active = true; }
        if (v === "status") glow *= 1.5;
        if (glow > 0 && col.h > 0.05) { const R = rpx * 4.2, gr = ctx.createRadialGradient(x, yb, 0, x, yb, R); gr.addColorStop(0, rgba(c, 0.55 * glow * alpha)); gr.addColorStop(1, rgba(c, 0)); ctx.save(); ctx.translate(x, yb); ctx.scale(1, Math.max(0.25, cosP)); ctx.translate(-x, -yb); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, yb, R, 0, 7); ctx.fill(); ctx.restore(); }
        // base ring
        ctx.beginPath(); ctx.ellipse(x, yb, rpx * 1.45, Math.max(1, ery * 1.45), 0, 0, 7); ctx.strokeStyle = rgba(c, (isSel ? 0.95 : 0.45) * alpha); ctx.lineWidth = isSel ? 2 : 1; if (off) ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
        if (col.h > 0.02) {
          // body
          const g = ctx.createLinearGradient(0, yb, 0, yt); g.addColorStop(0, rgba(c, 0.16 * alpha)); g.addColorStop(1, rgba(c, (off ? 0.4 : 0.92) * alpha));
          ctx.beginPath(); ctx.moveTo(x - rpx, yb); ctx.lineTo(x - rpx, yt); ctx.ellipse(x, yt, rpx, Math.max(0.5, ery), 0, Math.PI, 0, false); ctx.lineTo(x + rpx, yb); ctx.ellipse(x, yb, rpx, Math.max(0.5, ery), 0, 0, Math.PI, false); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
          const sh = ctx.createLinearGradient(x - rpx, 0, x + rpx, 0); sh.addColorStop(0, "rgba(7,17,31,0.35)"); sh.addColorStop(0.35, "rgba(255,255,255,0.10)"); sh.addColorStop(1, "rgba(7,17,31,0.45)"); ctx.fillStyle = sh; ctx.fill();
          // heat pulse: one bright band rises per slot.tick while servers work
          sc.pulses.filter((p) => p.id === s.id).forEach((p) => { const pk = (now - p.t0) / 1600; if (pk < 0 || pk > 1) return; active = true; const e = pk < 0.5 ? 2 * pk * pk : 1 - Math.pow(-2 * pk + 2, 2) / 2, py = lerp(yb, yt, e), a = Math.sin(pk * Math.PI);
            ctx.save(); ctx.beginPath(); ctx.ellipse(x, py, rpx * 0.96, Math.max(0.5, ery * 0.96), 0, 0, 7); ctx.fillStyle = rgba(HEAT, 0.85 * a * alpha); ctx.shadowColor = rgba(HEAT, 0.9); ctx.shadowBlur = 14; ctx.fill(); ctx.restore(); });
          // top cap; dumping = slow amber shimmer
          let capA = off ? 0.55 : 1;
          ctx.beginPath(); ctx.ellipse(x, yt, rpx, Math.max(0.5, ery), 0, 0, 7); ctx.fillStyle = rgba(c.map((ch) => Math.min(255, ch * 1.12 + 22)), capA * alpha); ctx.shadowColor = rgba(c, 0.8 * alpha * (off ? 0 : 1)); ctx.shadowBlur = v === "status" ? 26 : 16; ctx.fill(); ctx.shadowBlur = 0;
          if (s.status === "dumping" && v !== "servers") { const ph = DH.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(((now - sc.t0) / 3200) * 2 * Math.PI); if (!DH.reducedMotion) active = true;
            const sg = ctx.createLinearGradient(x - rpx, 0, x + rpx, 0); sg.addColorStop(Math.max(0, ph - 0.3), "rgba(255,255,255,0)"); sg.addColorStop(ph, "rgba(255,255,255,0.75)"); sg.addColorStop(Math.min(1, ph + 0.3), "rgba(255,255,255,0)"); ctx.fillStyle = sg; ctx.fill();
            ctx.beginPath(); ctx.ellipse(x, yt - 5 - 3 * ph, rpx * 1.25, Math.max(0.5, ery * 1.25), 0, 0, 7); ctx.strokeStyle = rgba(COL.dumping, 0.35 * (1 - ph) * alpha); ctx.lineWidth = 1.2; ctx.stroke(); }
          if (off) { ctx.beginPath(); ctx.ellipse(x, yt, rpx, Math.max(0.5, ery), 0, 0, 7); ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(200,210,225,0.7)"; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
        }
        sc.pos[s.id] = { x, yt, yb, rpx, hpx };
      });
      sc.pulses = sc.pulses.filter((p) => now - p.t0 < 1700);
      // ripples: status change and migration arrival, one-shot
      sc.ripples = sc.ripples.filter((r) => now - r.t0 < 900);
      sc.ripples.forEach((r) => { const p = sc.pos[r.id]; if (!p) return; active = true; const k = c01((now - r.t0) / 900), R = p.rpx * (1.4 + 3.2 * easeOut(k)); ctx.beginPath(); ctx.ellipse(p.x, p.yb, R, Math.max(1, R * cosP), 0, 0, 7); ctx.strokeStyle = rgba(r.c, 0.8 * (1 - k)); ctx.lineWidth = 2; ctx.stroke(); });

      // migration arcs
      const slot = st.scheduler.slot;
      sc.arcs = sc.arcs.filter((a) => slot - a.born < 14);
      sc.arcs.forEach((a) => {
        const A = st.sites.find((s) => s.id === a.from), B = st.sites.find((s) => s.id === a.to); if (!A || !B) return;
        const pa = xy(A.lat, A.lon), pb = xy(B.lat, B.lon), dist = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), H = dist * 0.3;
        const k = a.settled ? 1 : c01((now - a.t0) / 900); if (k < 1) active = true; else if (!a.settled) { a.settled = true; sc.ripples.push({ id: a.to, t0: now, c: [156, 196, 255] }); active = true; }
        const age = slot - a.born, fadeA = v === "arcs" ? Math.max(0.35, 1 - age / 16) : Math.max(0, 0.85 - age * 0.16);
        if (fadeA <= 0.01) return;
        const N = 44, pts = []; for (let i = 0; i <= N; i++) { const t = i / N; pts.push(project(lerp(pa[0], pb[0], t), lerp(pa[1], pb[1], t), H * 4 * t * (1 - t) + 14)); }
        const upto = Math.max(1, Math.round(N * easeOut(k)));
        const strokeArc = (w, style) => { ctx.beginPath(); for (let i = 0; i <= upto; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineWidth = w; ctx.strokeStyle = style; ctx.stroke(); };
        strokeArc(v === "arcs" ? 6 : 4.5, `rgba(120,170,255,${0.2 * fadeA})`); strokeArc(v === "arcs" ? 2 : 1.4, `rgba(196,222,255,${0.95 * fadeA})`);
        const head = pts[upto];
        if (k < 1 || v === "arcs") { ctx.save(); ctx.beginPath(); ctx.arc(head[0], head[1], k < 1 ? 4 : 3, 0, 7); ctx.fillStyle = rgba(HEAT, k < 1 ? 1 : 0.9 * fadeA); ctx.shadowColor = rgba(HEAT, 0.9); ctx.shadowBlur = 12; ctx.fill(); ctx.restore(); }
      });

      // far-distance haze and vignette keep the eye on live data
      const hz = ctx.createLinearGradient(0, 0, 0, sc.h); hz.addColorStop(0, "rgba(7,17,31,0.82)"); hz.addColorStop(0.28, "rgba(7,17,31,0)"); hz.addColorStop(0.86, "rgba(7,17,31,0)"); hz.addColorStop(1, "rgba(7,17,31,0.7)"); ctx.fillStyle = hz; ctx.fillRect(0, 0, sc.w, sc.h);
      ctx.globalAlpha = 1;

      // DOM badges follow their columns
      // labels sit right of the badge; when two would collide, the one further back flips to the left
      const placed = [];
      const hit = (a) => placed.some((b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
      st.sites.map((s) => ({ s, p: sc.pos[s.id] })).filter((o) => o.p).sort((a, b) => b.p.yb - a.p.yb).forEach(({ s, p }) => {
        const el = badges.current[s.id]; if (!el) return;
        const lw = 34 + s.name.length * 6.9, top = p.yt - 46;
        const right = { x: p.x + 24, y: top, w: lw, h: 40 }, left = { x: p.x - 24 - lw, y: top, w: lw, h: 40 };
        const side = !hit(right) ? 'right' : !hit(left) && left.x > propsRef.current.inset.l ? 'left' : 'right';
        placed.push(side === 'right' ? right : left, { x: p.x - 20, y: top, w: 40, h: 40 });
        if (el.dataset.side !== side) el.dataset.side = side;
        const at = `translate(${Math.round(p.x)}px, ${Math.round(p.yt)}px)`;
        el.style.transform = side === "right" ? at : at + " translateX(-100%) translateX(40px)";
        el.style.zIndex = String(1000 + Math.round(p.yb));
        el.style.opacity = sc.introT != null ? Math.min(1, sc.cols[s.id].h * 1.4) : '';
      });
      if (tipRef.current && propsRef.current.hover) { const p = sc.pos[propsRef.current.hover]; if (p) { const right = p.x < sc.w - 330; tipRef.current.style.transform = `translate(${Math.round(right ? p.x + 34 : p.x - 34)}px, ${Math.round(Math.max(90, p.yt - 30))}px) translateX(${right ? "0" : "-100%"})`; } }
      if (sc.introT != null && now - sc.introT > 450 + st.sites.length * 60 + 700) { sc.introT = null; sc.fade = 1; st.sites.forEach((s) => s.serversRunning && sc.pulses.push({ id: s.id, t0: now })); active = true; if (onIntroDone) onIntroDone(); }
      return active;
    }
    const loop = (now) => { sc.raf = 0; if (draw(now)) sc.raf = requestAnimationFrame(loop); };
    const kick = () => { if (!sc.raf) sc.raf = requestAnimationFrame(loop); };

    // size
    useEffect(() => {
      const el = wrap.current, cv = canvas.current;
      const resize = () => { const dpr = window.devicePixelRatio || 1; sc.w = el.clientWidth; sc.h = el.clientHeight; cv.width = Math.round(sc.w * dpr); cv.height = Math.round(sc.h * dpr); cv.style.width = sc.w + "px"; cv.style.height = sc.h + "px"; if (!sc.fitted) { Object.assign(sc.cam, fitCam(55)); sc.fitted = true; } kick(); };
      resize(); const ro = window.ResizeObserver ? new ResizeObserver(resize) : null; if (ro) ro.observe(el); window.addEventListener("resize", resize);
      return () => { if (ro) ro.disconnect(); window.removeEventListener("resize", resize); cancelAnimationFrame(sc.raf); sc.raf = 0; };
    }, []);
    // data events -> one-shot animations
    DH.useBus("slot.tick", (m) => { const d = m.data, col = sc.cols[d.siteId]; if (!col) return; const now = performance.now();
      if (d.loadKw > 0 && !DH.reducedMotion) sc.pulses.push({ id: d.siteId, t0: now + Math.random() * 500 });
      kick(); });
    DH.useBus("task.migrated", (m) => { const d = m.data; if (!d.fromSite || !d.toSite || d.fromSite === d.toSite) return; const now = performance.now();
      sc.arcs.push({ from: d.fromSite, to: d.toSite, t0: now, id: now, settled: DH.reducedMotion, born: DH.store.state.scheduler.slot }); if (!DH.reducedMotion) sc.dim[d.fromSite] = now + 1100; kick(); });
    useEffect(() => { kick(); });
    // selection: ease the camera to the site with a slight tilt (700 ms ease-out)
    const first = useRef(true);
    useEffect(() => {
      if (first.current) { first.current = false; if (!selected) return; }
      if (!sc.fitted) return;
      if (selected) { const s = st.sites.find((x) => x.id === selected); if (!s) return; const p = xy(s.lat, s.lon), base = fitCam(is3d ? 60 : 0, sc.cam.bearing), z = Math.max(base.zoom * 1.5, sc.cam.zoom), b = sc.cam.bearing, up = 90 / z / Math.max(0.3, Math.cos(((is3d ? 60 : 0) * Math.PI) / 180)); flyTo({ tx: p[0] + up * Math.sin(b), ty: p[1] + up * Math.cos(b), zoom: z, pitch: is3d ? 60 : 0 }, 700); }
      else flyTo(fitCam(is3d ? 55 : 0, sc.cam.bearing), 700);
    }, [selected, inset && inset.r]);

    /* ----- interaction: drag to pan, wheel to zoom, keyboard ----- */
    const drag = useRef(null);
    const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, tx: sc.cam.tx, ty: sc.cam.ty, b: sc.cam.bearing, rot: e.shiftKey || e.button === 2 }; wrap.current.setPointerCapture && e.pointerId != null && e.target === canvas.current && canvas.current.setPointerCapture(e.pointerId); };
    const onMove = (e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; sc.camAnim = null;
      if (d.rot) sc.cam.bearing = d.b + dx * 0.006; else { const c = sc.cam, cs = Math.cos(c.bearing), sn = Math.sin(c.bearing), rx = -dx / c.zoom, ry = dy / c.zoom / Math.max(0.3, Math.cos((c.pitch * Math.PI) / 180)); c.tx = d.tx + rx * cs + ry * sn; c.ty = d.ty - rx * sn + ry * cs; } kick(); };
    const onUp = () => { drag.current = null; };
    const zoomBy = (f, anim) => { const z = Math.max(0.04, Math.min(0.6, sc.cam.zoom * f)); anim ? flyTo({ zoom: z }, 260) : ((sc.cam.zoom = z), kick()); };
    const onWheel = (e) => { e.preventDefault(); sc.camAnim = null; zoomBy(e.deltaY < 0 ? 1.12 : 0.89); };
    useEffect(() => { const el = canvas.current; el.addEventListener("wheel", onWheel, { passive: false }); return () => el.removeEventListener("wheel", onWheel); }, []);
    const onKey = (e) => { const step = 60 / sc.cam.zoom / 4; const m = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (m) { e.preventDefault(); sc.cam.tx += m[0]; sc.cam.ty += m[1]; kick(); } if (e.key === "+" || e.key === "=") zoomBy(1.2, true); if (e.key === "-") zoomBy(0.83, true); };
    const toggle3d = () => { const n = !is3d; set3d(n); flyTo(Object.assign(selected ? {} : fitCam(n ? 55 : 0, sc.cam.bearing), { pitch: n ? (selected ? 60 : 55) : 0 }), 600); };

    const hs = hover && st.sites.find((s) => s.id === hover);
    return html`<div ref=${wrap} class=${cx("fm", "fm--" + view, specimen && "fm--specimen")} style=${height ? `height:${height}px` : null} onPointerMove=${onMove} onPointerUp=${onUp} onPointerLeave=${onUp} onContextMenu=${(e) => e.preventDefault()}>
      <canvas ref=${canvas} class="fm__canvas" onPointerDown=${onDown} tabindex="0" role="application" aria-label="Fleet map of Basel. Drag to pan, scroll to zoom, arrow keys to move. Sites follow as buttons. Use View sites as list for a table." onKeyDown=${onKey}></canvas>
      <div class="fm__markers">${st.sites.map((s) => html`<${SiteMarker3D} key=${s.id} site=${s} view=${view} selected=${selected === s.id} dimmed=${selected && selected !== s.id}
        refFn=${(el) => (badges.current[s.id] = el)} onSelect=${() => onSelect && onSelect(s.id)} onHover=${(on) => setHover(on ? s.id : (h) => (h === s.id ? null : h))} />`)}</div>
      ${hs && html`<div class="fm__tip dh-glass" ref=${tipRef} role="tooltip">
        <div class="row-between"><span class="w-600 t-14">${hs.name}</span><${OriginBadge} live=${hs.live} /></div>
        <div class="row" style="margin:6px 0 10px"><${StatusChip} kind="site" value=${hs.status} size="sm" /><span class="t-12 faint">${hs.hostType}</span></div>
        <dl class="fm__tipgrid"><dt>Heat demand</dt><dd class="num">${fmt.num(hs.demandKwh, 1)} <span class="faint">kWh, last 15 min</span></dd>
          <dt>Servers</dt><dd class="num">${hs.serversRunning} / ${hs.serversTotal} <span class="faint">running</span></dd>
          <dt>Tank</dt><dd class="num">${fmt.pct((100 * hs.tankKwh) / hs.tankCapacityKwh)} % <span class="faint">${fmt.num(hs.tankKwh, 1)} / ${fmt.num(hs.tankCapacityKwh, 0)} kWh</span></dd></dl>
        ${hs.status === "offline" && html`<div class="t-12 faint" style="margin-top:8px">Last values from ${fmt.time(hs.lastSeen)}</div>`}
      </div>`}
      <div class="fm__controls dh-glass" role="group" aria-label="Map controls">
        <button type="button" class="dh-iconbtn" aria-pressed=${is3d} onClick=${toggle3d} title=${is3d ? "Switch to flat view" : "Switch to 3D view"}><span class="num w-600 t-12">${is3d ? "3D" : "2D"}</span></button>
        <button type="button" class="dh-iconbtn" onClick=${() => zoomBy(1.3, true)} aria-label="Zoom in" title="Zoom in"><${Icon} name="plus" size=${16} /></button>
        <button type="button" class="dh-iconbtn" onClick=${() => zoomBy(0.77, true)} aria-label="Zoom out" title="Zoom out"><${Icon} name="minus" size=${16} /></button>
        <button type="button" class="dh-iconbtn" onClick=${() => flyTo(selected ? { bearing: 0 } : fitCam(is3d ? 55 : 0, 0), 500)} aria-label="Reset north" title="Reset north"><${Icon} name="compass" size=${16} /></button>
        <button type="button" class="dh-iconbtn" onClick=${() => flyTo(fitCam(is3d ? 55 : 0), 700)} aria-label="Locate fleet" title="Locate fleet"><${Icon} name="locate" size=${16} /></button>
      </div>
      ${!specimen && html`<div class="fm__attr">Stylised base map of Basel, offline · sites are illustrative</div>`}
    </div>`;
  }

  /* ---------- SiteMarker3D (DOM part): ring badge, host glyph, label ----------------- */
  function SiteMarker3D({ site, view, selected, dimmed, refFn, onSelect, onHover }) {
    const v = vocab.site[site.status], R = 15, C = 2 * Math.PI * R, frac = site.serversTotal ? site.serversRunning / site.serversTotal : 0;
    const ping = DH.useFlash(site.serversRunning + "/" + site.serversTotal, 900);
    const big = view === "servers";
    return html`<button type="button" ref=${refFn} class=${cx("fm-marker", "tone-" + v.tone, selected && "is-selected", dimmed && "is-dimmed", big && "is-big", site.status === "unmet" && "is-critical", ping && "is-ping")}
      onClick=${onSelect} onMouseEnter=${() => onHover(true)} onMouseLeave=${() => onHover(false)} onFocus=${() => onHover(true)} onBlur=${() => onHover(false)}
      aria-label=${`${site.name}, ${site.hostType}. ${v.label}. Heat demand ${fmt.num(site.demandKwh, 1)} kilowatt hours in the last 15 minutes. ${site.serversRunning} of ${site.serversTotal} servers running. Tank ${fmt.pct((100 * site.tankKwh) / site.tankCapacityKwh)} percent.`}>
      <span class="fm-marker__badge">
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18.5" class="fm-marker__bg" /><circle cx="20" cy="20" r=${R} class="fm-marker__track" />
          <circle cx="20" cy="20" r=${R} class="fm-marker__arc" stroke-dasharray=${C} stroke-dashoffset=${C * (1 - frac)} transform="rotate(-90 20 20)" /></svg>
        <span class="fm-marker__glyph">${big ? html`<span class="num">${site.serversRunning}/${site.serversTotal}</span>` : html`<${Icon} name=${vocab.hostType[site.type] || "factory"} size=${15} />`}</span>
      </span>
      <span class="fm-marker__label"><span class="fm-marker__name">${site.name}</span>
        <span class="fm-marker__meta">${view === "status" ? html`<${Icon} name=${v.icon} size=${11} />${v.label}` : view === "servers" ? `${vocab.hostType[site.type] ? site.hostType.split(",")[0] : ""}` : html`<span class="num">${site.serversRunning}/${site.serversTotal}</span> servers`}</span></span>
    </button>`;
  }

  /* ---------- specimen for the design system sheet ------------------------------------- */
  function MarkerSpecimen() {
    const [view, setView] = useState("demand"), [sel, setSel] = useState(null);
    const fire = () => DH.bus.dispatch({ type: "task.migrated", channel: "fleet", time: DH.store.state.scheduler.currentTime, data: { taskId: "demo", kind: "migrated", fromSite: "PHARMA1", toSite: "LAUNDRY1" } });
    return html`<div style="width:100%;position:relative;border-radius:12px;overflow:hidden;border:1px solid var(--line)">
      <${FleetMap} view=${view} selected=${sel} onSelect=${(id) => setSel((s) => (s === id ? null : id))} height=${460} specimen />
      <div class="row wrap" style="position:absolute;top:12px;left:12px;gap:8px"><${DH.Segmented} label="Map view" value=${view} onChange=${setView} options=${VIEWS} /><button type="button" class="dh-btn dh-btn--sm" onClick=${fire}><${Icon} name="shuffle" size=${12} />Fire a migration arc</button></div>
    </div>`;
  }
  const VIEWS = [{ value: "demand", label: "Heat Demand", icon: "flame" }, { value: "status", label: "Status", icon: "check-circle" }, { value: "servers", label: "Servers", icon: "server" }, { value: "arcs", label: "Arcs", icon: "shuffle" }];

  Object.assign(DH, { FleetMap, SiteMarker3D, MarkerSpecimen, MAP_VIEWS: VIEWS });
})();
