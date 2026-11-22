/**
 * HeatFlowChart and StackedBars (Recharts). Rules: legend, axis unit, hover tooltip with exact values,
 * an empty state, a "view as table" alternative, recessive grid, text never in series colour, 2px surface
 * gap between stacked fills.
 */
import { useState, type ReactNode } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { Table2 } from "lucide-react";
import { num } from "@/lib/format";
import { time } from "@/lib/time";
import type { SlotReading } from "@/api/types";
import { toneVar, type Tone } from "./vocab";

export type Series = { key: string; label: string; tone?: Tone; color?: string; line?: boolean; dashed?: boolean };
const colorOf = (s: Series) => s.color ?? (s.tone ? toneVar[s.tone] : "rgb(var(--ink))");
const axis = { fontSize: 11, fill: "rgb(var(--ink-3))" };

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          {s.line ? (
            <span aria-hidden className="w-3.5 border-t-2" style={{ borderColor: colorOf(s), borderStyle: s.dashed ? "dashed" : "solid" }} />
          ) : (
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colorOf(s) }} />
          )}
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function TipBox({ title, rows, unit }: { title: string; rows: { s: Series; v: number }[]; unit: string }) {
  return (
    <div className="min-w-44 rounded-ctl border border-line-strong bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1.5 font-semibold text-ink-2 tnum">{title}</p>
      {rows.map(({ s, v }) => (
        <p key={s.key} className="flex items-center justify-between gap-4 leading-6">
          <span className="inline-flex items-center gap-1.5 text-ink-2">
            <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: colorOf(s) }} />
            {s.label}
          </span>
          <span className="tnum text-ink">{`${num(v, 2)} ${unit}`}</span>
        </p>
      ))}
    </div>
  );
}

function ChartFrame({ title, unit, series, table, children, empty, height }: { title?: ReactNode; unit: string; series: Series[]; table: ReactNode; children: ReactNode; empty?: boolean; height: number }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-3">{title ?? unit}</span>
        {!empty && (
          <button type="button" aria-pressed={asTable} onClick={() => setAsTable((x) => !x)} className="inline-flex items-center gap-1 rounded-ctl px-1.5 py-0.5 text-xs text-ink-3 hover:bg-surface-2 hover:text-ink">
            <Table2 aria-hidden className="h-3.5 w-3.5" />
            {asTable ? "Chart" : "Table"}
          </button>
        )}
      </div>
      {empty ? (
        <div className="grid place-items-center rounded-card border border-dashed border-line-strong text-sm text-ink-3" style={{ height }}>
          {typeof empty === "boolean" ? "No data for this period" : empty}
        </div>
      ) : asTable ? (
        <div className="overflow-auto scrollbar-thin" style={{ maxHeight: height + 40 }}>
          {table}
        </div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
      {!empty && <Legend series={series} />}
    </div>
  );
}

function SimpleTable({ rows, cols, unit }: { rows: Record<string, string | number>[]; cols: { key: string; label: string }[]; unit: string }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-ink-3">
          {cols.map((c, i) => (
            <th key={c.key} className={i ? "px-2 py-1 text-right font-medium" : "px-2 py-1 font-medium"}>
              {i ? `${c.label} (${unit})` : c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line">
            {cols.map((c, j) => (
              <td key={c.key} className={j ? "px-2 py-1 text-right tnum" : "px-2 py-1 tnum"}>
                {typeof r[c.key] === "number" ? num(r[c.key] as number, 2) : r[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const HF: Series[] = [
  { key: "server", label: "Server heat", tone: "heat" },
  { key: "tank", label: "From tank", tone: "tank" },
  { key: "backup", label: "Backup heat", tone: "critical" },
  { key: "dumped", label: "Dumped", tone: "dump" },
  { key: "demand", label: "Demand", line: true, color: "rgb(var(--ink))" },
];

/** Stack adds up to demand: server heat used directly + drawn from tank + backup. Dumped sits above the line. */
export function HeatFlowChart({ rows, height = 190, title, empty = "No heat demand data for this period" }: { rows: SlotReading[]; height?: number; title?: ReactNode; empty?: string }) {
  const data = rows.map((r) => {
    const server = Math.max(0, Math.min(r.producedKwh - r.dumpedKwh, r.deliveredKwh));
    return { t: time.hm(r.time), when: r.time, server, tank: Math.max(0, r.deliveredKwh - server), backup: r.unmetKwh, dumped: r.dumpedKwh, demand: r.demandKwh };
  });
  const tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as Record<string, number | string>;
    return <TipBox title={`${time.dayTime(p.when as string)}`} unit="kWh" rows={HF.map((s) => ({ s, v: Number(p[s.key] ?? 0) }))} />;
  };
  return (
    <ChartFrame
      title={title ?? "kWh per 15 min"}
      unit="kWh"
      series={HF}
      empty={rows.length < 2 ? (empty as unknown as boolean) : undefined}
      height={height}
      table={<SimpleTable unit="kWh" rows={data} cols={[{ key: "t", label: "Time" }, ...HF.map((s) => ({ key: s.key, label: s.label }))]} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
          <XAxis dataKey="t" tick={axis} tickLine={false} axisLine={false} minTickGap={36} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => num(v, v < 10 ? 1 : 0)} />
          <Tooltip content={tip} cursor={{ stroke: "rgb(var(--line-strong))", strokeDasharray: "3 3" }} />
          {HF.filter((s) => !s.line).map((s) => (
            <Area key={s.key} dataKey={s.key} stackId="1" type="monotone" stroke="rgb(var(--surface))" strokeWidth={1} fill={colorOf(s)} fillOpacity={s.key === "tank" ? 0.75 : 0.85} isAnimationActive={false} />
          ))}
          <Line dataKey="demand" type="monotone" stroke="rgb(var(--ink))" strokeWidth={1.8} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Stacked bars with an optional marker line series (e.g. heat demand). */
export function StackedBars<T extends Record<string, unknown>>({
  data,
  xLabel,
  series,
  unit,
  height = 220,
  title,
  marker,
  empty = "No data for this period",
  decimals,
}: {
  data: T[];
  xLabel: (row: T) => string;
  series: Series[];
  unit: string;
  height?: number;
  title?: ReactNode;
  marker?: Series;
  empty?: string;
  decimals?: number;
}) {
  const rows = data.map((d) => ({ ...d, __x: xLabel(d) }));
  const all = marker ? [...series, marker] : series;
  const tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as Record<string, unknown>;
    return <TipBox title={String(p.__x)} unit={unit} rows={all.map((s) => ({ s, v: Number(p[s.key] ?? 0) }))} />;
  };
  return (
    <ChartFrame
      title={title ?? unit}
      unit={unit}
      series={all}
      empty={rows.length === 0 ? (empty as unknown as boolean) : undefined}
      height={height}
      table={<SimpleTable unit={unit} rows={rows.map((r) => Object.fromEntries([["x", r.__x], ...all.map((s) => [s.key, Number(r[s.key] ?? 0)])]))} cols={[{ key: "x", label: "Period" }, ...all.map((s) => ({ key: s.key, label: s.label }))]} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: -12 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
          <XAxis dataKey="__x" tick={axis} tickLine={false} axisLine={false} minTickGap={8} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => num(v, decimals ?? (v < 10 ? 1 : 0))} />
          <Tooltip content={tip} cursor={{ fill: "rgb(var(--surface-3) / 0.5)" }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="s"
              fill={colorOf(s)}
              stroke="rgb(var(--surface))"
              strokeWidth={i < series.length - 1 ? 0 : 0}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              isAnimationActive={false}
            />
          ))}
          {marker && <Line dataKey={marker.key} type="monotone" stroke={colorOf(marker)} strokeWidth={2} dot={{ r: 2.5, fill: colorOf(marker) }} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Plain bar chart for one series */
export function SimpleBars({ data, unit, height = 160, color, label }: { data: { x: string; v: number }[]; unit: string; height?: number; color: string; label: string }) {
  return (
    <ChartFrame unit={unit} series={[{ key: "v", label, color }]} height={height} empty={data.length === 0 ? true : undefined} table={<SimpleTable unit={unit} rows={data} cols={[{ key: "x", label: "Period" }, { key: "v", label }]} />}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
          <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={({ active, payload }) => (active && payload?.length ? <TipBox title={String(payload[0].payload.x)} unit={unit} rows={[{ s: { key: "v", label, color }, v: Number(payload[0].value) }]} /> : null)} cursor={{ fill: "rgb(var(--surface-3) / 0.5)" }} />
          <Bar dataKey="v" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
