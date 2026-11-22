/** Platform Economics pieces: side cards, money figures and the plan vs live revenue mix. */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Activity } from "lucide-react";
import { AnimatedNumber, Card, Chip, Skeleton } from "@/design-system";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";

/** Business-plan target mix. Not measured: label it "plan". */
export const PLAN_MIX = [
  { key: "compute", label: "Compute-as-a-service", pct: 60 },
  { key: "heat", label: "Heat-as-a-service", pct: 20 },
  { key: "grid", label: "Grid flexibility", pct: 10 },
  { key: "cert", label: "Certificates and licensing", pct: 10 },
] as const;

// neutral ramp: revenue streams have no physical meaning, so no data colour
const RAMP = ["rgb(var(--ink))", "rgb(var(--ink-2))", "rgb(var(--ink-3))", "rgb(var(--line-strong))"];

/** Live mix from the two streams the backend measures today; null when there is no income yet. */
export function liveMix(computeChf: number | null | undefined, heatChf: number | null | undefined) {
  const c = Math.max(0, computeChf ?? 0),
    h = Math.max(0, heatChf ?? 0);
  if (c + h <= 0) return null;
  return { compute: (100 * c) / (c + h), heat: (100 * h) / (c + h) };
}

export function Figure({ label, value, unit, decimals = 0, period, loading }: { label: string; value: number | null | undefined; unit: string; decimals?: number; period: string; loading?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-ctl border border-line bg-surface-2 px-3 py-2.5">
      <span className="truncate text-xs text-ink-2">{label}</span>
      {loading ? (
        <Skeleton className="my-1 h-5 w-16" />
      ) : (
        <span className="whitespace-nowrap">
          <span className="text-lg font-light tnum">
            <AnimatedNumber value={value} decimals={decimals} />
          </span>
          <span className="ml-1 text-xs text-ink-3">{unit}</span>
        </span>
      )}
      <span className="text-xs text-ink-3">{period}</span>
    </div>
  );
}

export function SideCard({
  n,
  role,
  title,
  who,
  icon: I,
  roadmap,
  share,
  children,
}: {
  n: number;
  role: string;
  title: string;
  who: string;
  icon: LucideIcon;
  roadmap?: boolean;
  share: number;
  children: ReactNode;
}) {
  return (
    <Card className={cn("flex flex-col p-5", roadmap && "border-dashed bg-transparent")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ctl bg-surface-3 text-ink-2">
            <I aria-hidden className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-ink-3">{`Side ${n}, ${role}`}</p>
            <h2 className="text-md font-semibold">{title}</h2>
            <p className="text-xs text-ink-2">{who}</p>
          </div>
        </div>
        {roadmap ? (
          <span className="shrink-0 whitespace-nowrap rounded-md border border-dashed border-line-strong px-2 py-0.5 text-2xs font-semibold text-ink-2">Roadmap, scenario</span>
        ) : (
          <Chip tone="ok" icon={Activity} size="sm">
            Live figures
          </Chip>
        )}
      </div>
      <div className="mt-4 flex-1">{children}</div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
        <span className="text-ink-2">Share of revenue, plan, not measured</span>
        <span className="font-semibold tnum">{`about ${share} %`}</span>
      </div>
    </Card>
  );
}

function MixBar({ parts, label }: { parts: { key: string; label: string; pct: number }[]; label: string }) {
  return (
    <div role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${num(p.pct, 0)} percent`).join(", ")}`} className="flex h-3 gap-0.5 overflow-hidden rounded-full">
      {parts.map((p, i) => (
        <span key={p.key} className="h-full transition-[width] duration-500 ease-out" style={{ width: `${p.pct}%`, background: RAMP[i] }} />
      ))}
    </div>
  );
}

export function RevenueMix({ computeChf, heatChf }: { computeChf: number | null | undefined; heatChf: number | null | undefined }) {
  const live = liveMix(computeChf, heatChf);
  return (
    <div className="grid grid-cols-2 gap-8 max-lg:grid-cols-1">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold">Plan mix</span>
          <span className="rounded-md border border-dashed border-line-strong px-1.5 py-0.5 text-2xs text-ink-2">plan, not measured</span>
        </div>
        <MixBar parts={[...PLAN_MIX]} label="Planned revenue mix" />
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-2">
          {PLAN_MIX.map((p, i) => (
            <li key={p.key} className="flex items-center gap-2">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: RAMP[i] }} />
              {p.label}
              <span className="ml-auto tnum text-ink">{`${p.pct} %`}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold">Live mix, since run start</span>
          <span className="text-2xs text-ink-3">measured compute income and heat value, GET /admin/kpis</span>
        </div>
        {live ? (
          <MixBar
            parts={[
              { key: "compute", label: "Compute", pct: live.compute },
              { key: "heat", label: "Heat", pct: live.heat },
            ]}
            label="Measured revenue mix since run start"
          />
        ) : (
          <p className="text-sm text-ink-3">No income recorded yet in this run.</p>
        )}
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-2">
          {[
            ["Compute-as-a-service", live?.compute],
            ["Heat-as-a-service", live?.heat],
          ].map(([l, v], i) => (
            <li key={String(l)} className="flex items-center gap-2">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: RAMP[i] }} />
              {l}
              <span className="ml-auto tnum text-ink">{v == null ? "–" : `${num(v as number, 0)} %`}</span>
            </li>
          ))}
          <li className="col-span-2 text-ink-3">Grid flexibility and certificates earn nothing today: roadmap.</li>
        </ul>
      </div>
    </div>
  );
}
