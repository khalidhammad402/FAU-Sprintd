/** Buttons, cards, chips, badges and the small pieces everything else is built from. */
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { BedDouble, Building2, Factory, Shirt, Waves, Wheat, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { HostIcon } from "@/lib/terms";
import { eventKind, jobStatus, serverState, severity, siteStatus, taskState, toneSoft, type Tone, type Vocab } from "./vocab";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; icon?: LucideIcon };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = "secondary", size = "md", icon: I, className, children, type = "button", ...p }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-ctl border font-medium",
        "transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "lg" && "h-11 px-4 text-base",
        variant === "primary" && "border-transparent bg-accent text-accent-fg hover:bg-accent/90",
        variant === "secondary" && "border-line-strong bg-surface text-ink hover:bg-surface-2",
        variant === "ghost" && "border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
        variant === "danger" && "border-critical/40 bg-critical/10 text-critical-ink hover:bg-critical/15",
        className,
      )}
      {...p}
    >
      {I && <I aria-hidden className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; size?: "sm" | "md" }>(function IconButton(
  { icon: I, label, size = "md", className, type = "button", ...p },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-grid place-items-center rounded-ctl text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-[0.96]",
        size === "md" ? "h-9 w-9" : "h-7 w-7",
        className,
      )}
      {...p}
    >
      <I aria-hidden className={size === "md" ? "h-[18px] w-[18px]" : "h-4 w-4"} />
    </button>
  );
});

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-line bg-surface", className)} {...p} />;
}

export function CardHeader({ title, sub, right, className }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

export function Chip({ tone, icon: I, children, size = "md", className }: { tone: Tone; icon?: LucideIcon; children: ReactNode; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition-colors duration-300",
        size === "md" ? "h-6 pl-2 pr-2.5 text-xs" : "h-5 pl-1.5 pr-2 text-2xs",
        toneSoft[tone],
        className,
      )}
    >
      {I && <I aria-hidden className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />}
      {children}
    </span>
  );
}

const kinds: Record<string, Record<string, Vocab>> = { site: siteStatus, task: taskState, job: jobStatus, server: serverState, severity, event: eventKind };
/** StatusChip: icon + word + tone for any state */
export function StatusChip({ kind, value, size, label }: { kind: keyof typeof kinds; value: string; size?: "sm" | "md"; label?: string }) {
  const v = kinds[kind][value] ?? { label: value, tone: "idle" as Tone, icon: undefined };
  return (
    <Chip tone={v.tone} icon={v.icon} size={size}>
      {label ?? v.label}
    </Chip>
  );
}

/** LIVE = a real process on a laptop agent. SIMULATED = everything else. Told apart by form, not colour. */
export function OriginBadge({ live, className }: { live: boolean; className?: string }) {
  return (
    <span
      title={live ? "LIVE: a real process on a connected laptop agent" : "SIMULATED: computed by the scheduler model"}
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-md border px-1.5 text-2xs font-semibold uppercase tracking-wide",
        live ? "border-ink/60 text-ink" : "border-dashed border-line-strong text-ink-3",
        className,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-ink" : "border border-dashed border-ink-3")} />
      {live ? "Live" : "Simulated"}
    </span>
  );
}

const hostIcons: Record<HostIcon, LucideIcon> = { hotel: BedDouble, pool: Waves, block: Building2, plant: Factory, laundry: Shirt, farm: Wheat };
export function HostGlyph({ icon, className }: { icon: HostIcon; className?: string }) {
  const I = hostIcons[icon] ?? Factory;
  return <I aria-hidden className={className} />;
}

export function Logo({ compact, tagline }: { compact?: boolean; tagline?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <rect x="1" y="1" width="30" height="30" rx="8" fill="#0F1B2E" stroke="rgba(255,255,255,.12)" />
        <path d="M9 10.5h9.5M9 16h6M9 21.5h3.5" stroke="#FF7A1A" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M22 13.2s3.6 3.6 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-2.8 3.6-6.4 3.6-6.4z" fill="#3B82F6" />
      </svg>
      {!compact && (
        <span className="flex flex-col leading-tight">
          <span className="text-md font-semibold tracking-tight">
            Digital<span className="text-heat-ink">Heat</span>
          </span>
          {tagline && <span className="text-2xs text-ink-3">Compute. Heat. Sustain.</span>}
        </span>
      )}
    </span>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <span role="alert" className="text-xs text-critical-ink">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-ink-3">{hint}</span>
      ) : null}
    </div>
  );
}

export const inputClass =
  "h-9 w-full rounded-ctl border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-ink-3 focus-visible:border-tank aria-[invalid=true]:border-critical";

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-ink-2">{children}</kbd>;
}

export function Illustrative({ text = "Illustrative data" }: { text?: string }) {
  return <span className="inline-flex h-5 items-center rounded-md border border-dashed border-line-strong px-1.5 text-2xs font-medium text-ink-3">{text}</span>;
}
