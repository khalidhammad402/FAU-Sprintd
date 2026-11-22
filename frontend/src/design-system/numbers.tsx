/** Quantity, AnimatedNumber, KpiTile, Sparkline, Trend: every number has a unit and a period. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { autoDecimals, num, NBSP } from "@/lib/format";
import { useMotion } from "@/lib/motion";
import { toneText, toneVar, type Tone } from "./vocab";

/** Counts to a new value in 400 ms (ease-out). Instant under reduced motion. */
export function AnimatedNumber({ value, decimals, className }: { value: number | null | undefined; decimals?: number; className?: string }) {
  const { reduced } = useMotion();
  const [shown, setShown] = useState(value ?? 0);
  const from = useRef(value ?? 0);
  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return;
    if (reduced) {
      from.current = value;
      setShown(value);
      return;
    }
    const a = from.current,
      b = value,
      t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / 400));
      const v = a + (b - a) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  if (value == null || !Number.isFinite(value)) return <span className={cn("tnum", className)}>–</span>;
  return <span className={cn("tnum", className)}>{num(shown, decimals ?? autoDecimals(value))}</span>;
}

/** <Quantity value unit period />: the one way to print a heat or money figure */
export function Quantity({
  value,
  unit,
  period,
  decimals,
  size = "md",
  animate = true,
  className,
}: {
  value: number | null | undefined;
  unit?: string;
  period?: string;
  decimals?: number;
  size?: "sm" | "md" | "lg" | "xl";
  animate?: boolean;
  className?: string;
}) {
  const big = { sm: "text-sm", md: "text-md", lg: "text-xl font-light tracking-tight", xl: "text-2xl font-light tracking-tight" }[size];
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1", className)}>
      <span className={cn("tnum text-ink", big)}>{animate ? <AnimatedNumber value={value} decimals={decimals} /> : num(value, decimals)}</span>
      {unit && <span className={cn("text-ink-3", size === "lg" || size === "xl" ? "text-sm" : "text-xs")}>{unit}</span>}
      {period && <span className="text-xs text-ink-3">{`,${NBSP}${period}`}</span>}
    </span>
  );
}

/** Trend vs a comparable prior period. Renders nothing without one. */
export function Trend({
  value,
  prior,
  decimals = 1,
  unit,
  lowerIsBetter,
  label,
}: {
  value: number | null | undefined;
  prior: number | null | undefined;
  decimals?: number;
  unit?: string;
  lowerIsBetter?: boolean;
  label: string;
}) {
  if (value == null || prior == null || !Number.isFinite(value) || !Number.isFinite(prior)) return null;
  const delta = value - prior;
  const flat = Math.abs(delta) < Math.pow(10, -decimals) / 2;
  const good = flat ? null : delta > 0 !== !!lowerIsBetter;
  const I = flat ? Minus : delta > 0 ? ArrowUp : ArrowDown;
  return (
    <span title={label} className={cn("inline-flex items-center gap-0.5 text-xs font-medium tnum", good === true ? "text-ok-ink" : good === false ? "text-dump-ink" : "text-ink-3")}>
      <I aria-hidden className="h-3 w-3" />
      {flat ? "0" : `${delta > 0 ? "+" : "−"}${num(Math.abs(delta), decimals)}`}
      {unit && `${NBSP}${unit}`}
      <span className="sr-only">{` ${good === null ? "unchanged" : good ? "better" : "worse"} ${label}`}</span>
    </span>
  );
}

/** Small line of a series. Only drawn with at least 3 real points. */
export function Sparkline({ values, tone = "idle", width = 84, height = 26, label }: { values: (number | null)[]; tone?: Tone; width?: number; height?: number; label: string }) {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  if (v.length < 3) return null;
  const mn = Math.min(...v),
    mx = Math.max(...v),
    sp = mx - mn || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * (width - 2) + 1, height - 2 - ((x - mn) / sp) * (height - 4)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke={toneVar[tone]} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={toneVar[tone]} />
    </svg>
  );
}

export function KpiTile({
  label,
  icon: I,
  tone = "idle",
  value,
  unit,
  decimals,
  period,
  trend,
  spark,
  size = "md",
  className,
  loading,
  footer,
}: {
  label: string;
  icon?: LucideIcon;
  tone?: Tone;
  value: number | null | undefined;
  unit?: string;
  decimals?: number;
  period: string;
  trend?: ReactNode;
  spark?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  loading?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex items-center gap-1.5 text-xs text-ink-2">
        {I && <I aria-hidden className={cn("h-3.5 w-3.5", toneText[tone])} />}
        <span className="truncate">{label}</span>
      </div>
      {loading ? (
        <div className="skeleton mt-1 h-7 w-24" aria-hidden />
      ) : (
        <div className="flex items-end justify-between gap-3">
          <span className="inline-flex items-baseline gap-1">
            <span className={cn("tnum font-light tracking-tight text-ink", size === "lg" ? "text-2xl" : size === "md" ? "text-xl" : "text-lg")}>
              <AnimatedNumber value={value} decimals={decimals} />
            </span>
            {unit && <span className="text-sm text-ink-3">{unit}</span>}
          </span>
          {spark}
        </div>
      )}
      <div className="flex min-h-4 items-center gap-2 text-xs text-ink-3">
        {trend}
        <span>{period}</span>
        {footer}
      </div>
    </div>
  );
}
