/** DonutGauge (ring and tank), RackBar, ProgressBar, HeatPulse, CheckDraw */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Database, Server as ServerIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { kw, num } from "@/lib/format";
import { useMotion } from "@/lib/motion";
import { toneBg, toneVar, type Tone } from "./vocab";

export function DonutGauge({
  value,
  max = 100,
  tone = "ok",
  size = 120,
  stroke = 10,
  variant = "ring",
  label,
  children,
}: {
  value: number | null | undefined;
  max?: number;
  tone?: Tone;
  size?: number;
  stroke?: number;
  variant?: "ring" | "tank";
  label: string;
  children?: ReactNode;
}) {
  const id = useId();
  const { reduced } = useMotion();
  const pct = Math.max(0, Math.min(1, max ? (value ?? 0) / max : 0));
  const r = (size - stroke) / 2,
    c = size / 2,
    C = 2 * Math.PI * r;
  const inner = r - stroke / 2 - 4;
  // a short surface wave after each level change (event-driven, 2 passes)
  const [waving, setWaving] = useState(false);
  const prev = useRef(pct);
  useEffect(() => {
    if (Math.abs(prev.current - pct) < 0.002 || reduced) return;
    prev.current = pct;
    setWaving(true);
    const t = setTimeout(() => setWaving(false), 2800);
    return () => clearTimeout(t);
  }, [pct, reduced]);
  const W = inner * 4,
    A = Math.max(2, size * 0.02),
    x0 = c - inner;
  const wave = `M${x0} 0 q${W / 8} ${-A} ${W / 4} 0 t${W / 4} 0 t${W / 4} 0 t${W / 4} 0 V${A + 2} H${x0} Z`;
  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {variant === "tank" && (
          <>
            <clipPath id={`clip${id}`}>
              <circle cx={c} cy={c} r={inner} />
            </clipPath>
            <circle cx={c} cy={c} r={inner} fill="rgb(var(--surface-2))" />
            <g clipPath={`url(#clip${id})`}>
              <g style={{ transform: `translateY(${c + inner - pct * inner * 2}px)`, transition: "transform 600ms cubic-bezier(0.23,1,0.32,1)" }}>
                <path d={wave} fill={toneVar[tone]} fillOpacity={0.5} style={{ animation: waving ? "wave 1.4s linear 2" : undefined }} />
                <rect x={x0} y={A} width={inner * 2} height={size} fill={toneVar[tone]} fillOpacity={0.22} />
              </g>
            </g>
          </>
        )}
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgb(var(--surface-3))" strokeWidth={stroke} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={toneVar[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.23,1,0.32,1), stroke 300ms" }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** One bar per server, one segment per running task (orange). Offline = hatched track. */
export function RackBar({
  capacityKw,
  loadKw,
  tasks,
  offline,
  label,
  right,
  onClick,
}: {
  capacityKw: number;
  loadKw: number;
  tasks: { id: string; name: string; powerKw: number; paused?: boolean }[];
  offline?: boolean;
  label: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("grid w-full grid-cols-[minmax(0,auto)_1fr_auto] items-center gap-3 rounded-ctl px-2 py-1.5 text-left", onClick && "hover:bg-surface-2")}
      aria-label={typeof label === "string" ? `${label}: ${offline ? "offline" : `${num(loadKw, 1)} of ${num(capacityKw, 1)} kilowatts in use`}` : undefined}
    >
      <span className="flex min-w-[96px] items-center gap-2 font-mono text-xs text-ink-2">{label}</span>
      <span
        className={cn("relative flex h-2.5 gap-px overflow-hidden rounded-full bg-surface-3")}
        style={offline ? { background: "repeating-linear-gradient(135deg, rgb(var(--surface-3)) 0 4px, transparent 4px 8px)" } : undefined}
      >
        {!offline &&
          tasks.map((t) => (
            <span
              key={t.id}
              title={`${t.id} · ${t.name} · ${kw(t.powerKw, 2)}`}
              className={cn("h-full min-w-[2px] transition-[width] duration-500 ease-out", t.paused ? "" : "bg-heat")}
              style={{
                width: `${(100 * t.powerKw) / Math.max(capacityKw, 0.001)}%`,
                background: t.paused ? "repeating-linear-gradient(135deg, rgb(var(--dump)) 0 3px, transparent 3px 6px)" : undefined,
              }}
            />
          ))}
      </span>
      <span className="min-w-[88px] whitespace-nowrap text-right text-xs tnum text-ink-2">{right ?? (offline ? "offline" : `${num(loadKw, 2)} / ${num(capacityKw, 1)} kW`)}</span>
    </Tag>
  );
}

/** Never moves backward. `running` adds a soft light travelling along the bar. */
export function ProgressBar({ value, tone = "heat", running, size = "sm", label }: { value: number; tone?: Tone; running?: boolean; size?: "sm" | "lg"; label: string }) {
  const max = useRef(0);
  const { reduced } = useMotion();
  max.current = Math.max(max.current, value || 0);
  const v = Math.min(100, max.current);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      className={cn("relative w-full overflow-hidden rounded-full bg-surface-3", size === "sm" ? "h-1.5" : "h-2.5")}
    >
      <div className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out", toneBg[tone])} style={{ width: `${v}%` }}>
        {running && !reduced && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-10 rounded-full bg-gradient-to-r from-transparent via-white/60 to-transparent"
            style={{ animation: "travel 1.6s cubic-bezier(0.77,0,0.175,1) infinite" }}
          />
        )}
      </div>
    </div>
  );
}

export function CheckDraw({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("h-4 w-4", className)}>
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="rgb(var(--ok-ink))" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="24" strokeDashoffset="24">
        <animate attributeName="stroke-dashoffset" from="24" to="0" dur="0.42s" fill="freeze" />
      </path>
    </svg>
  );
}

/** Orange particle from the rack glyph to the tank glyph, only while compute runs; faster with load. */
export function HeatPulse({ on, load = 0.5, label }: { on: boolean; load?: number; label?: string }) {
  const { reduced } = useMotion();
  const dur = Math.round(2400 - 1400 * Math.max(0, Math.min(1, load)));
  return (
    <div className="flex items-center" role="img" aria-label={on ? "Server heat is flowing into the tank" : "No heat flowing: servers idle"}>
      <ServerIcon aria-hidden className={cn("h-4 w-4", on ? "text-heat-ink" : "text-ink-3")} />
      <span className="relative mx-1.5 h-0.5 min-w-10 flex-1 rounded-full bg-gradient-to-r from-heat/40 to-tank/40">
        {on && !reduced && (
          <span
            aria-hidden
            className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-heat shadow-[0_0_8px_2px_rgb(var(--heat)/0.6)]"
            style={{ animation: `travel ${dur}ms cubic-bezier(0.77,0,0.175,1) infinite` }}
          />
        )}
      </span>
      <Database aria-hidden className="h-4 w-4 text-tank-ink" />
      {label && <span className="ml-2 text-xs text-ink-2">{label}</span>}
    </div>
  );
}
