/** Small building blocks shared by the Host Portal screens. */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, Skeleton, toneAlpha, toneText, type Tone } from "@/design-system";

/** One idea per card: label, big number with unit, period, one explaining sentence. */
export function Fact({
  icon: I,
  tone = "idle",
  label,
  value,
  period,
  children,
  aside,
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  label: string;
  value: ReactNode;
  period: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-3 p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5 text-sm font-medium text-ink-2">
          <span className={cn("grid h-8 w-8 place-items-center rounded-ctl", toneText[tone])} style={{ background: toneAlpha(tone, 0.12) }}>
            <I aria-hidden className="h-4 w-4" />
          </span>
          {label}
        </span>
        {aside}
      </div>
      <div>
        <div className="text-2xl font-light tracking-tight tnum">{value}</div>
        <div className="mt-0.5 text-xs text-ink-3">{period}</div>
      </div>
      {children && <div className="text-sm text-ink-2">{children}</div>}
    </Card>
  );
}

export function Unit({ children }: { children: ReactNode }) {
  return <span className="ml-1 text-sm font-normal text-ink-3">{children}</span>;
}

export function CardSkeleton({ className, lines = 2 }: { className?: string; lines?: number }) {
  return (
    <Card className={cn("flex flex-col gap-3 p-5", className)}>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-24" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={i ? "w-2/3" : "w-11/12"} />
      ))}
    </Card>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-md font-semibold">{children}</h2>
      {right}
    </div>
  );
}
