/* ==========================================================================
   DigitalHeat charts: DonutGauge, HeatFlowChart, StackedBars, SparkTrend, TaskGraph.
   Rules: compact legend, axis units, hover tooltip with exact values, a meaningful
   empty state. Colours come from the semantic tokens only.
   ========================================================================== */
(function () {
  const DH = window.DH, P = window.htmPreact;
  const { html, useState, useRef } = P;
  const { fmt, cx, Legend, Trend, useSize, useFlash, vocab } = DH;

  const nice = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10) * p; };
  let uid = 0;

  /* ---------- DonutGauge: variant "ring" (coverage) or "tank" (liquid level) -------- */
  function DonutGauge({ value, max = 100, tone = "ok", size = 132, stroke = 10, variant = "ring", center, label }) {
    const pct = Math.max(0, Math.min(1, max ? value / max : 0));
    const r = (size - stroke) / 2, c = size / 2, C = 2 * Math.PI * r;
    const moving = useFlash(Math.round(pct * 500), 2900);
    const id = useRef("dh-clip-" + ++uid).current;
    const inner = r - stroke / 2 - 5, W = inner * 4, x0 = c - inner, A = Math.max(2, size * 0.022);
    const levelY = c + inner - pct * inner * 2;
    const wave = `M${x0} 0 q${W / 8} ${-A} ${W / 4} 0 t${W / 4} 0 t${W / 4} 0 t${W / 4} 0 V${A + 2} H${x0} Z`;
    return html`<div class=${cx("dh-donut", "tone-" + tone, variant === "tank" && "dh-tank", moving && "is-moving")} style=${`width:${size}px;height:${size}px`} role="img" aria-label=${label}>
      <svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`}>
        ${variant === "tank" && html`<clipPath id=${id}><circle cx=${c} cy=${c} r=${inner} /></clipPath>
          <circle cx=${c} cy=${c} r=${inner} fill="var(--surface-2)" />
          <g clip-path=${`url(#${id})`}><g class="dh-tank__level" style=${`transform:translateY(${levelY}px)`}>
            <path class="dh-tank__wave" d=${wave} /><rect class="dh-tank__liquid" x=${x0} y=${A} width=${inner * 2} height=${size} /></g></g>`}
        <circle class="dh-donut__track" cx=${c} cy=${c} r=${r} stroke-width=${stroke} />
        <circle class="dh-donut__arc" cx=${c} cy=${c} r=${r} stroke-width=${stroke} stroke-dasharray=${C} stroke-dashoffset=${C * (1 - pct)} transform=${`rotate(-90 ${c} ${c})`} />
      </svg>
      <div class="dh-donut__center"><div>${center}</div></div>
    </div>`;
  }

  /* ---------- HeatFlowChart ------------------------------------------------------------
     rows: slot readings as returned by GET /admin/sites/{id}/timeline
     Stack (adds up to demand): server heat used directly, heat drawn from the tank, backup heat.
     Dumped heat sits above the demand line: anything amber is waste. */
  const HF = [
    { key: "server", label: "Server heat", tone: "heat" },
    { key: "tank", label: "From tank", tone: "tank" },
    { key: "backup", label: "Backup heat", tone: "critical" },
    { key: "dumped", label: "Dumped", tone: "dump" },
  ];
  function HeatFlowChart({ rows, height = 176, until, unit = "kWh per 15 min", empty = "No heat demand data for this period", legend = true, slotMin = 15 }) {
    const ref = useRef(null), w = useSize(ref) || 360;
    const [hi, setHi] = useState(null);
    if (!rows || rows.length < 2) return html`<div ref=${ref} class="dh-chart"><div class="dh-chart__empty" style=${`height:${height}px`}>${empty}</div></div>`;
    const m = { l: 36, r: 6, t: 18, b: 22 }, iw = w - m.l - m.r, ih = height - m.t - m.b;
    const pts = rows.map((d) => {
      const server = Math.max(0, Math.min(d.producedKwh - d.dumpedKwh, d.deliveredKwh));
      return { d, t: new Date(d.time).getTime(), server, tank: Math.max(0, d.deliveredKwh - server), backup: d.unmetKwh, dumped: d.dumpedKwh, demand: d.demandKwh };
    });
    const t0 = pts[0].t, tLast = pts[pts.length - 1].t, t1 = Math.max(tLast, until ? new Date(until).getTime() - slotMin * 60000 : tLast);
    const yMax = nice(Math.max(...pts.map((p) => p.demand + p.dumped)) * 1.08);
    const x = (t) => m.l + (iw * (t - t0)) / (t1 - t0 || 1), y = (v) => m.t + ih - (ih * v) / yMax;
    let base = pts.map(() => 0);
    const areas = HF.map((s) => {
      const top = pts.map((p, i) => base[i] + p[s.key]);
      const path = "M" + pts.map((p, i) => `${x(p.t).toFixed(1)} ${y(top[i]).toFixed(1)}`).join(" L") + " L" + pts.map((p, i) => `${x(p.t).toFixed(1)} ${y(base[i]).toFixed(1)}`).reverse().join(" L") + " Z";
      base = top;
      return { s, path };
    });
    const demand = "M" + pts.map((p) => `${x(p.t).toFixed(1)} ${y(p.demand).toFixed(1)}`).join(" L");
    const ticks = [0, yMax / 2, yMax];
    const xt = [0, 1 / 3, 2 / 3, 1].map((f) => t0 + (t1 - t0) * f);
    const move = (e) => { const b = ref.current.getBoundingClientRect(), px = e.clientX - b.left; let best = 0, bd = 1e9; pts.forEach((p, i) => { const dd = Math.abs(x(p.t) - px); if (dd < bd) { bd = dd; best = i; } }); setHi(best); };
    const h = hi != null ? pts[hi] : null;
    const gap = t1 - tLast > slotMin * 60000;
    const tot = (k) => pts.reduce((a, p) => a + p[k], 0);
    return html`<div class="col" style="gap:8px"><div ref=${ref} class="dh-chart" onMouseMove=${move} onMouseLeave=${() => setHi(null)}>
      <svg viewBox=${`0 0 ${w} ${height}`} height=${height} role="img" aria-label=${`Heat flow from ${fmt.time(rows[0].time)} to ${fmt.time(rows[rows.length - 1].time)}: demand ${fmt.kwh(tot("demand"))} kWh, server heat ${fmt.kwh(tot("server"))} kWh, from tank ${fmt.kwh(tot("tank"))} kWh, backup heat ${fmt.kwh(tot("backup"))} kWh, dumped ${fmt.kwh(tot("dumped"))} kWh.`}>
        <text class="dh-chart__unit" x="0" y="9">${unit}</text>
        ${ticks.map((t) => html`<line class="dh-chart__grid" x1=${m.l} x2=${w - m.r} y1=${y(t)} y2=${y(t)} /><text class="dh-chart__axis" x=${m.l - 6} y=${y(t) + 3.5} text-anchor="end">${fmt.num(t, yMax < 10 ? 1 : 0)}</text>`)}
        ${areas.map(({ s, path }) => html`<path d=${path} fill=${`var(--${s.tone})`} fill-opacity=${s.key === "tank" ? 0.78 : 0.86} />`)}
        <path d=${demand} fill="none" stroke="var(--text)" stroke-width="1.6" stroke-linejoin="round" />
        ${gap && html`<rect x=${x(tLast)} y=${m.t} width=${x(t1) - x(tLast)} height=${ih} fill="var(--surface-3)" /><line x1=${x(tLast)} x2=${x(tLast)} y1=${m.t} y2=${m.t + ih} stroke="var(--idle)" stroke-dasharray="3 3" /><text class="dh-chart__axis" x=${x(tLast) + 5} y=${m.t + 12}>no data</text>`}
        ${xt.map((t, i) => html`<text class="dh-chart__axis" x=${x(t)} y=${height - 5} text-anchor=${i === 0 ? "start" : i === 3 ? "end" : "middle"}>${fmt.time(fmt.iso(t))}</text>`)}
        ${h && html`<line class="dh-chart__cursor" x1=${x(h.t)} x2=${x(h.t)} y1=${m.t} y2=${m.t + ih} /><circle cx=${x(h.t)} cy=${y(h.demand)} r="3.5" fill="var(--surface-solid)" stroke="var(--text)" stroke-width="1.6" />`}
      </svg>
      ${h && html`<div class="dh-chart__tip" style=${`left:${Math.max(92, Math.min(w - 92, x(h.t)))}px;top:${m.t + 6}px`}>
        <h5>${fmt.time(h.d.time)} to ${fmt.time(fmt.iso(h.t + slotMin * 60000))}</h5>
        <div><span class="dh-legend__item"><span class="dh-swatch dh-swatch--line" style="--tone:var(--text)"></span>Demand</span><span class="num">${fmt.num(h.demand, 2)} kWh</span></div>
        ${HF.map((s) => html`<div class=${"tone-" + s.tone}><span class="dh-legend__item"><span class="dh-swatch"></span>${s.label}</span><span class="num">${fmt.num(h[s.key], 2)} kWh</span></div>`)}
        <div><span class="dh-legend__item faint">Tank after slot</span><span class="num">${fmt.num(h.d.tankKwh, 1)} kWh</span></div>
      </div>`}</div>
      ${legend && html`<${Legend} items=${[...HF, { label: "Demand", line: true, color: "var(--text)" }]} />`}
    </div>`;
  }

  /* ---------- StackedBars ----------------------------------------------------------------
     buckets: [{ label, tip?, segments: [{ key, label, value, tone? , color? }], marker?: { label, value } }] */
  function StackedBars({ buckets, height = 200, unit = "kWh", d, empty = "No data for this period", legendItems, ariaLabel, yMaxFixed, maxBar = 44 }) {
    const ref = useRef(null), w = useSize(ref) || 480;
    const [hi, setHi] = useState(null);
    if (!buckets || !buckets.length) return html`<div ref=${ref} class="dh-chart"><div class="dh-chart__empty" style=${`height:${height}px`}>${empty}</div></div>`;
    const m = { l: 40, r: 6, t: 18, b: 22 }, iw = w - m.l - m.r, ih = height - m.t - m.b;
    const totals = buckets.map((b) => b.segments.reduce((a, s) => a + (s.value || 0), 0));
    const yMax = yMaxFixed || nice(Math.max(...totals, ...buckets.map((b) => (b.marker ? b.marker.value : 0))) * 1.06);
    const dec = d != null ? d : yMax < 10 ? 1 : 0;
    const band = iw / buckets.length, bw = Math.min(maxBar, Math.max(4, band * 0.62));
    const y = (v) => m.t + ih - (ih * v) / yMax, cx0 = (i) => m.l + band * i + band / 2;
    const every = Math.ceil(buckets.length / Math.max(2, Math.floor(iw / 46)));
    const h = hi != null ? buckets[hi] : null;
    const segs = buckets[0].segments;
    return html`<div class="col" style="gap:8px"><div ref=${ref} class="dh-chart" onMouseLeave=${() => setHi(null)}>
      <svg viewBox=${`0 0 ${w} ${height}`} height=${height} role="img" aria-label=${ariaLabel || `Bar chart in ${unit}`}>
        <text class="dh-chart__unit" x="0" y="9">${unit}</text>
        ${[0, yMax / 2, yMax].map((t) => html`<line class="dh-chart__grid" x1=${m.l} x2=${w - m.r} y1=${y(t)} y2=${y(t)} /><text class="dh-chart__axis" x=${m.l - 6} y=${y(t) + 3.5} text-anchor="end">${fmt.num(t, dec)}</text>`)}
        ${buckets.map((b, i) => {
          let acc = 0; const n = b.segments.filter((s) => s.value > 0).length; let k = 0;
          return html`<g key=${i} opacity=${hi == null || hi === i ? 1 : 0.45} style="transition:opacity 150ms">
            ${b.segments.map((s) => { if (!(s.value > 0)) return null; const y1 = y(acc + s.value), hh = y(acc) - y1; acc += s.value; k++; const top = k === n;
              return html`<path key=${s.key} d=${top ? `M${cx0(i) - bw / 2} ${y1 + hh} v${-Math.max(0, hh - 3)} q0 -3 3 -3 h${bw - 6} q3 0 3 3 v${Math.max(0, hh - 3)} Z` : `M${cx0(i) - bw / 2} ${y1} h${bw} v${hh} h${-bw} Z`} fill=${s.color || `var(--${s.tone})`} style="transition:d 500ms cubic-bezier(.16,1,.3,1)" />`; })}
            ${b.marker && html`<line x1=${cx0(i) - bw / 2 - 3} x2=${cx0(i) + bw / 2 + 3} y1=${y(b.marker.value)} y2=${y(b.marker.value)} stroke="var(--text)" stroke-width="2" stroke-linecap="round" />`}
            ${i % every === 0 && html`<text class="dh-chart__axis" x=${cx0(i)} y=${height - 5} text-anchor="middle">${b.label}</text>`}
            <rect x=${m.l + band * i} y=${m.t} width=${band} height=${ih} fill="transparent" onMouseEnter=${() => setHi(i)} />
          </g>`;
        })}
      </svg>
      ${h && html`<div class="dh-chart__tip" style=${`left:${Math.max(96, Math.min(w - 96, cx0(hi)))}px;top:${Math.max(m.t + 4, y(Math.max(totals[hi], h.marker ? h.marker.value : 0)))}px`}>
        <h5>${h.tip || h.label}</h5>
        ${h.marker && html`<div><span class="dh-legend__item"><span class="dh-swatch dh-swatch--line" style="--tone:var(--text)"></span>${h.marker.label}</span><span class="num">${fmt.num(h.marker.value, dec + 1)} ${unit}</span></div>`}
        ${h.segments.map((s) => html`<div class=${s.tone ? "tone-" + s.tone : null}><span class="dh-legend__item"><span class="dh-swatch" style=${s.color ? `--tone:${s.color}` : null}></span>${s.label}</span><span class="num">${fmt.num(s.value, dec + 1)} ${unit}</span></div>`)}
        ${h.note && html`<div class="faint" style="white-space:normal;max-width:220px">${h.note}</div>`}
      </div>`}</div>
      <${Legend} items=${legendItems || [...segs.map((s) => ({ label: s.label, tone: s.tone, color: s.color })), ...(buckets[0].marker ? [{ label: buckets[0].marker.label, line: true, color: "var(--text)" }] : [])]} />
    </div>`;
  }

  /* ---------- SparkTrend: renders only when a comparable prior period exists ------------------ */
  function SparkTrend({ values, prior, value, d, unit, lowerIsBetter, tone = "idle", label }) {
    if (prior == null || !values || values.length < 2) return null;
    const w = 64, h = 20, mn = Math.min(...values), mx = Math.max(...values), sp = mx - mn || 1;
    const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - mn) / sp) * (h - 4)).toFixed(1)}`).join(" ");
    return html`<span class=${cx("dh-spark", "tone-" + tone)}><svg width=${w} height=${h} viewBox=${`0 0 ${w} ${h}`} aria-hidden="true"><polyline points=${pts} fill="none" stroke="var(--tone)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" /></svg>
      <${Trend} value=${value != null ? value : values[values.length - 1]} prior=${prior} d=${d} unit=${unit} lowerIsBetter=${lowerIsBetter} label=${label} /></span>`;
  }

  /* ---------- TaskGraph: dependencies of one job, left to right -------------------------------- */
  function TaskGraph({ tasks, selected, onSelect }) {
    if (!tasks || !tasks.length) return html`<p class="t-13 faint">This job has no tasks.</p>`;
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t])), depth = {};
    const dep = (t) => (depth[t.id] != null ? depth[t.id] : (depth[t.id] = t.dependsOn.filter((x) => byId[x]).length ? 1 + Math.max(...t.dependsOn.filter((x) => byId[x]).map((x) => dep(byId[x]))) : 0));
    tasks.forEach(dep);
    const cols = []; tasks.forEach((t) => (cols[depth[t.id]] = cols[depth[t.id]] || []).push(t));
    const nw = 138, nh = 40, gx = 40, gy = 10, rowsMax = Math.max(...cols.map((c) => c.length));
    const W = cols.length * (nw + gx) - gx, H = rowsMax * (nh + gy) - gy;
    const pos = {};
    cols.forEach((c, ci) => { const off = ((rowsMax - c.length) * (nh + gy)) / 2; c.forEach((t, ri) => (pos[t.id] = { x: ci * (nw + gx), y: off + ri * (nh + gy) })); });
    const short = (s) => (s.length > 19 ? s.slice(0, 18) + "…" : s);
    return html`<svg class="dh-graph" viewBox=${`-1 -1 ${W + 2} ${H + 2}`} style=${`max-width:${W}px`} role="group" aria-label=${`Task dependencies: ${tasks.length} tasks in ${cols.length} stage${cols.length > 1 ? "s" : ""}`}>
      ${tasks.map((t) => t.dependsOn.filter((x) => pos[x]).map((x) => { const a = pos[x], b = pos[t.id]; return html`<path class=${cx("dh-graph__edge", byId[x].state === "done" && "is-done")} d=${`M${a.x + nw} ${a.y + nh / 2} C${a.x + nw + gx / 2} ${a.y + nh / 2} ${b.x - gx / 2} ${b.y + nh / 2} ${b.x} ${b.y + nh / 2}`} />`; }))}
      ${tasks.map((t) => { const p = pos[t.id], v = vocab.task[t.state] || vocab.task.waiting;
        return html`<g class=${cx("dh-graph__node", "tone-" + v.tone)} transform=${`translate(${p.x} ${p.y})`} tabindex=${onSelect ? 0 : null} role=${onSelect ? "button" : null} style=${onSelect ? "cursor:pointer" : null}
          aria-label=${`${t.name}, ${v.label}${t.state === "running" ? `, ${Math.round(t.progressPct)} percent` : ""}`} onClick=${onSelect ? () => onSelect(t) : null} onKeyDown=${onSelect ? (e) => { if (e.key === "Enter") onSelect(t); } : null}>
          <rect width=${nw} height=${nh} rx="9" stroke-width=${selected === t.id ? 2.5 : 1.5} />
          ${t.state === "running" && html`<rect x="1" y=${nh - 4} width=${Math.max(0, (nw - 2) * t.progressPct) / 100} height="3" rx="1.5" style="fill:var(--heat);stroke:none;transition:width 900ms cubic-bezier(.16,1,.3,1)" />`}
          <text x="10" y="16">${short(t.name)}</text><text class="dh-graph__state" x="10" y="30">${v.label}${t.state === "running" || t.state === "paused" ? ` ${Math.round(t.progressPct)} %` : ""}</text></g>`; })}
    </svg>`;
  }

  Object.assign(DH, { DonutGauge, HeatFlowChart, StackedBars, SparkTrend, TaskGraph, niceMax: nice });
})();
