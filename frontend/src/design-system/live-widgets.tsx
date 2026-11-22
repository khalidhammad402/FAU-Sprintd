/** ClockControl, AlertCard, AlertTray, AlertToasts, AssumptionPill, PayOffStatement */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import { time } from "@/lib/time";
import { useMotion } from "@/lib/motion";
import { useLive, useNow } from "@/live/store";
import { adminApi } from "@/api/adapters";
import { useSchedulerMutations } from "@/api/queries";
import type { Alert, Assumption } from "@/api/types";
import { Button } from "./primitives";
import { Pop } from "./overlays";
import { alertKind, effectiveSeverity, severity, toneAlpha, toneText, type Tone } from "./vocab";
import { EmptyState } from "./states";

/** Live/pause control with the simulated scheduler clock. Digits roll on clock.tick. */
export function ClockControl({ readOnly }: { readOnly?: boolean }) {
  const clock = useLive((s) => s.clock);
  const now = useNow();
  const { update } = useSchedulerMutations();
  const { reduced } = useMotion();
  const [beat, setBeat] = useState(0);
  const slot = clock?.slot;
  useEffect(() => setBeat((b) => b + 1), [slot]);
  const down = useLive((s) => s.conn.state === "reconnecting" || s.conn.state === "closed");
  const mode = down ? "Offline" : clock?.mode === "jumping" ? "Jumping" : clock?.paused ? "Paused" : clock ? "Live" : "Connecting";
  const text = time.clock(now);
  const live = mode === "Live";
  return (
    <div title="Simulated time: the scheduler clock, not your wall clock" className="inline-flex h-10 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border border-line bg-surface pl-1.5 pr-4">
      <button
        type="button"
        disabled={readOnly || !clock || update.isPending}
        onClick={() => clock && update.mutate({ paused: !clock.paused })}
        aria-label={clock?.paused ? "Resume the simulated clock" : "Pause the simulated clock"}
        className={cn("relative grid h-7 w-7 place-items-center rounded-full border transition-colors", live ? "border-ok/40 bg-ok/15 text-ok-ink" : "border-line-strong bg-surface-2 text-ink")}
      >
        {clock?.paused ? <Play aria-hidden className="h-3 w-3 fill-current" /> : <Pause aria-hidden className="h-3 w-3 fill-current" />}
        {live && !reduced && <span key={beat} aria-hidden className="absolute inset-0 rounded-full border border-ok" style={{ animation: "ping1 900ms cubic-bezier(0.23,1,0.32,1) 1 both" }} />}
      </button>
      <span className={cn("text-xs font-semibold max-md:hidden", live ? "text-ok-ink" : mode === "Jumping" ? "text-dump-ink" : "text-ink-3")}>{mode}</span>
      <span aria-hidden className="h-4 w-px bg-line-strong max-md:hidden" />
      <span className="text-sm font-medium tnum" aria-label={`Simulated time ${text}`}>
        {[...text].map((ch, i) => (
          <span key={`${i}${ch}`} className={reduced ? "" : "inline-block animate-rise"} style={{ whiteSpace: "pre" }}>
            {ch}
          </span>
        ))}
      </span>
      <span className="hidden text-xs text-ink-3 xl:inline">Simulated time</span>
    </div>
  );
}

export function AlertCard({ alert, onView, now }: { alert: Alert; onView?: (a: Alert) => void; now?: string | null }) {
  const sevKey = effectiveSeverity(alert);
  const v = severity[sevKey] ?? severity.info;
  const I = v.icon;
  const [busy, setBusy] = useState(false);
  const ack = async () => {
    setBusy(true);
    useLive.getState().ackAlert(alert.id, true); // optimistic
    try {
      await adminApi.ackEvent(alert.id, true);
    } catch {
      useLive.getState().ackAlert(alert.id, false); // roll back
    } finally {
      setBusy(false);
    }
  };
  const critical = sevKey === "critical" && !alert.acknowledged;
  return (
    <article
      aria-label={`${v.label} alert: ${alert.message}`}
      className={cn("grid grid-cols-[28px_1fr] gap-3 rounded-card border border-line bg-surface-2 p-3", alert.acknowledged && "opacity-60", critical && "animate-breathe")}
      style={{ borderLeft: `3px solid ${alert.acknowledged ? "rgb(var(--line-strong))" : toneAlpha(v.tone as Tone, 1)}` }}
    >
      <span className={cn("grid h-7 w-7 place-items-center rounded-ctl", toneText[v.tone as Tone])} style={{ background: toneAlpha(v.tone as Tone, 0.15) }}>
        <I aria-hidden className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug">{alert.message}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
          <span className={cn("font-semibold", toneText[v.tone as Tone])}>{v.label}</span>
          <span>{alertKind[alert.kind] ?? alert.kind}</span>
          <time dateTime={alert.time} className="tnum">
            {time.hm(alert.time)}
            {now ? `, ${time.relative(alert.time, now)}` : ""}
          </time>
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {alert.acknowledged ? (
            <span className="inline-flex items-center gap-1 text-xs text-ink-3">
              <Check aria-hidden className="h-3 w-3" />
              Acknowledged
            </span>
          ) : (
            <Button size="sm" icon={Check} disabled={busy} onClick={ack}>
              Acknowledge
            </Button>
          )}
          {onView && (alert.siteId || alert.jobId) && (
            <Button size="sm" variant="ghost" onClick={() => onView(alert)}>
              {alert.siteId ? "View site" : "View job"}
              <ChevronRight aria-hidden className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export function AlertTray({ onView }: { onView?: (a: Alert) => void }) {
  const alerts = useLive((s) => s.alerts);
  const now = useNow();
  const [tab, setTab] = useState<"open" | "ack">("open");
  const open = alerts.filter((a) => !a.acknowledged);
  const crit = open.filter((a) => effectiveSeverity(a) === "critical").length;
  // info alerts (heat dumped) are listed but do not raise the badge
  const loud = open.filter((a) => effectiveSeverity(a) !== "info").length;
  const list = (tab === "open" ? open : alerts.filter((a) => a.acknowledged)).slice(0, 60);
  return (
    <Pop
      label="Alerts"
      align="end"
      width={400}
      trigger={
        <button type="button" aria-label={`Alerts: ${open.length} open, ${crit} critical, ${loud - crit} warnings`} className="relative grid h-9 w-9 place-items-center rounded-ctl text-ink-2 hover:bg-surface-2 hover:text-ink">
          <Bell aria-hidden className="h-[18px] w-[18px]" />
          {loud > 0 && (
            <span className={cn("absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold tnum", crit ? "bg-critical text-white" : "bg-dump text-[#07111F]")}>
              {loud > 99 ? "99+" : loud}
            </span>
          )}
        </button>
      }
    >
      <div className="-m-4">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-sm font-semibold">Alerts</span>
          <div className="flex gap-1 text-xs">
            {(["open", "ack"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={cn("rounded-ctl px-2 py-1", tab === k ? "bg-surface-3 font-semibold text-ink" : "text-ink-2")}>
                {k === "open" ? `Open ${open.length}` : "Acknowledged"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto p-3 scrollbar-thin">
          {list.length === 0 ? (
            <EmptyState compact icon={Check} title={tab === "open" ? "No open alerts" : "Nothing acknowledged yet"} body={tab === "open" ? "Every site is covered and every deadline is on track." : undefined} />
          ) : (
            list.map((a) => <AlertCard key={a.id} alert={a} now={now} onView={onView} />)
          )}
        </div>
      </div>
    </Pop>
  );
}

/** Critical alerts slide in from the right and leave after 9 s; they stay in the tray. */
export function AlertToasts({ onView }: { onView?: (a: Alert) => void }) {
  const alerts = useLive((s) => s.alerts);
  const { reduced } = useMotion();
  const seen = useRef<Set<number> | null>(null);
  const [shown, setShown] = useState<Alert[]>([]);
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(alerts.map((a) => a.id)); // never toast what was already there at load
      return;
    }
    const fresh = alerts.filter((a) => !seen.current!.has(a.id) && effectiveSeverity(a) === "critical" && !a.acknowledged);
    alerts.forEach((a) => seen.current!.add(a.id));
    if (!fresh.length) return;
    setShown((s) => [...s, ...fresh].slice(-3));
    const t = setTimeout(() => setShown((s) => s.filter((x) => !fresh.includes(x))), 9000);
    return () => clearTimeout(t);
  }, [alerts]);
  return (
    <div role="status" aria-live="assertive" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[380px] max-w-[calc(100vw-32px)] flex-col gap-2">
      <AnimatePresence>
        {shown.map((a) => (
          <motion.div
            key={a.id}
            className="pointer-events-auto rounded-card bg-surface shadow-pop"
            initial={reduced ? false : { opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 32, transition: { duration: 0.2 } }}
            transition={{ duration: 0.36, ease: [0.23, 1, 0.32, 1] }}
          >
            <AlertCard alert={a} onView={onView} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

const statusTone: Record<string, Tone> = { BRIEF: "tank", SOURCE: "ok", ASSUMPTION: "dump", MOCK: "critical", LIMIT: "idle", OK: "ok", PLACEHOLDER: "dump" };
const statusText: Record<string, string> = {
  BRIEF: "From the case brief",
  SOURCE: "Named public source",
  ASSUMPTION: "Our own choice, to be confirmed",
  MOCK: "Test input that must be replaced",
  LIMIT: "Known simplification of the model",
  PLACEHOLDER: "Placeholder until a real value is set",
};
export function AssumptionPill({ a, compact }: { a: Pick<Assumption, "name" | "value" | "status" | "source">; compact?: boolean }) {
  const key = a.status.split(/[\s+]/)[0].toUpperCase();
  const tone = statusTone[key] ?? "idle";
  return (
    <Pop
      label={`Assumption: ${a.name}`}
      width={340}
      trigger={
        <button type="button" className="inline-flex min-h-7 max-w-full items-center gap-2 rounded-full border border-line-strong bg-surface-2 py-1 pl-1.5 pr-3 text-left text-xs hover:border-ink-3">
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide", toneText[tone])} style={{ background: toneAlpha(tone, 0.15) }}>
            {a.status}
          </span>
          {!compact && <span className="whitespace-nowrap font-medium text-ink">{a.name}</span>}
          <span className="truncate tnum text-ink-2">{a.value}</span>
        </button>
      }
    >
      <p className="mb-2 font-semibold">{a.name}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-xs text-ink-3">Value</dt>
        <dd className="tnum">{a.value}</dd>
        <dt className="text-xs text-ink-3">Status</dt>
        <dd>
          <span className={cn("font-semibold", toneText[tone])}>{a.status}</span> <span className="text-xs text-ink-2">{statusText[key] ?? ""}</span>
        </dd>
        <dt className="text-xs text-ink-3">Source</dt>
        <dd className="text-ink-2">{a.source || "Not given"}</dd>
      </dl>
    </Pop>
  );
}

/** The backend sentence, shown verbatim. Numbers and the word NOT are emphasised, never rewritten. */
export function PayOffStatement({ text, algorithm, generatedAt }: { text: string | undefined | null; algorithm?: string; generatedAt?: string | null }) {
  if (!text) return null;
  const parts = text.split(/(\bNOT\b|\d[\d,]*(?:\.\d+)?)/g);
  return (
    <figure className="relative m-0 rounded-card border border-line bg-surface-2 py-4 pl-6 pr-5">
      <span aria-hidden className="absolute bottom-4 left-0 top-4 w-[3px] rounded-r bg-dump" />
      <p className="mb-2 text-xs font-semibold text-ink-2">When the model does not pay off</p>
      <blockquote className="m-0 text-sm leading-relaxed text-ink">
        {parts.map((p, i) =>
          p === "NOT" ? (
            <mark key={i} className="rounded bg-critical/15 px-1 font-bold text-critical-ink">
              NOT
            </mark>
          ) : /^\d/.test(p) ? (
            <b key={i} className="font-semibold tnum">
              {p}
            </b>
          ) : (
            p
          ),
        )}
      </blockquote>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 text-xs text-ink-3">
        <span>Verbatim from the backend (payOffStatement, GET /admin/results)</span>
        {algorithm && <span>Algorithm: {algorithm.toUpperCase()}</span>}
        {generatedAt && <span>Run of {time.date(generatedAt)}</span>}
      </figcaption>
    </figure>
  );
}
