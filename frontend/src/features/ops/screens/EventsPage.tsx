/** Events: task lifecycle across the fleet and alerts, newest first, as they arrive over the WebSocket. */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Bell } from "lucide-react";
import { useSites } from "@/api/queries";
import type { Alert } from "@/api/types";
import { Button, Card, EmptyState, FilterChips, eventDetail, eventKind, effectiveSeverity, severity, alertKind, toneAlpha, toneText, type Tone } from "@/design-system";
import { cn } from "@/lib/cn";
import { useMotion } from "@/lib/motion";
import { time } from "@/lib/time";
import { useLive, type LiveTaskEvent } from "@/live/store";
import { OpsPage } from "../OpsShell";
import { useOpsParams } from "../hooks";

const KINDS = ["started", "paused", "resumed", "migrated", "completed", "missed"] as const;
type Item = { key: string; time: string; fresh: boolean } & ({ type: "task"; e: LiveTaskEvent } | { type: "alert"; a: Alert });

/** Merge task events and alerts into one stream, newest first. */
export function mergeStream(events: LiveTaskEvent[], alerts: Alert[], filter: string | null, freshSince: number): Item[] {
  const items: Item[] = [];
  if (filter !== "alerts")
    events.filter((e) => e.kind !== "ready" && (!filter || e.kind === filter)).forEach((e) => items.push({ type: "task", e, key: e.key, time: e.time, fresh: e.receivedAt > freshSince }));
  if (!filter || filter === "alerts") alerts.forEach((a) => items.push({ type: "alert", a, key: `alert-${a.id}`, time: a.time, fresh: !!a.isNew }));
  return items.sort((x, y) => (x.time < y.time ? 1 : x.time > y.time ? -1 : 0)).slice(0, 300);
}

export default function EventsPage() {
  const { get, set } = useOpsParams();
  const nav = useNavigate();
  const events = useLive((s) => s.events);
  const alerts = useLive((s) => s.alerts);
  const sites = useSites();
  const { reduced } = useMotion();
  const filter = get("kind");
  const freshSince = useMemo(() => Date.now(), []); // events that arrive while the screen is open slide in
  const items = useMemo(() => mergeStream(events, alerts, filter, freshSince), [events, alerts, filter, freshSince]);
  const siteName = (id: string | null | undefined) => (id ? (sites.data?.find((s) => s.id === id)?.name ?? id) : null);
  const count = (k: string) => (k === "alerts" ? alerts.length : events.filter((e) => e.kind === k).length);

  return (
    <OpsPage title="Events" sub="Task lifecycle across the fleet and alerts, newest first. Task events arrive live from the scheduler from the moment this console opened.">
      <Card className="p-4">
        <FilterChips
          groups={[
            {
              label: "Show",
              value: filter,
              onChange: (v) => set({ kind: v }),
              options: [...KINDS.map((k) => ({ value: k, label: eventKind[k].label, count: count(k) })), { value: "alerts", label: "Alerts", count: count("alerts") }],
            },
          ]}
        />
        <div className="mt-5 max-w-[960px]">
          {items.length === 0 ? (
            <EmptyState
              icon={Activity}
              title={filter ? "No events of this kind yet" : "Waiting for the first events"}
              body="Events appear as the scheduler starts, pauses, moves and completes tasks. If nothing arrives, check that the simulated clock is running."
              action={filter ? <Button onClick={() => set({ kind: null })}>Show all events</Button> : undefined}
            />
          ) : (
            <ol aria-live="polite" className="flex flex-col">
              {items.map((it, i) => {
                const anim = it.fresh && !reduced ? "animate-rise" : "";
                if (it.type === "alert") {
                  const v = severity[effectiveSeverity(it.a)] ?? severity.info;
                  const I = v.icon;
                  return (
                    <li key={it.key} className={cn("relative grid grid-cols-[22px_1fr_auto] gap-3 pb-4", anim)}>
                      {i < items.length - 1 && <span aria-hidden className="absolute bottom-0 left-[10px] top-6 w-0.5 bg-line" />}
                      <span className={cn("grid h-[22px] w-[22px] place-items-center rounded-full", toneText[v.tone as Tone])} style={{ background: toneAlpha(v.tone as Tone, 0.15) }}>
                        <I aria-hidden className="h-3 w-3" />
                      </span>
                      <button type="button" className="min-w-0 text-left text-sm" onClick={() => (it.a.siteId ? set({ site: it.a.siteId }) : it.a.jobId && nav(`/ops/tasks?job=${it.a.jobId}`))}>
                        <span className="font-medium">{it.a.message}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                          <Bell aria-hidden className="h-3 w-3" />
                          {`${v.label} alert, ${alertKind[it.a.kind] ?? it.a.kind}${it.a.acknowledged ? ", acknowledged" : ""}`}
                        </span>
                      </button>
                      <time dateTime={it.time} className="whitespace-nowrap text-xs tnum text-ink-3">
                        {time.dayTime(it.time)}
                      </time>
                    </li>
                  );
                }
                const e = it.e;
                const v = eventKind[e.kind] ?? eventKind.ready;
                const I = v.icon;
                const where = e.kind === "migrated" && e.fromSite && e.toSite && e.fromSite !== e.toSite ? `${siteName(e.fromSite)} to ${siteName(e.toSite)}` : null;
                return (
                  <li key={it.key} className={cn("relative grid grid-cols-[22px_1fr_auto] gap-3 pb-4", anim)}>
                    {i < items.length - 1 && <span aria-hidden className="absolute bottom-0 left-[10px] top-6 w-0.5 bg-line" />}
                    <span className={cn("grid h-[22px] w-[22px] place-items-center rounded-full", toneText[v.tone])} style={{ background: toneAlpha(v.tone, 0.15) }}>
                      <I aria-hidden className="h-3 w-3" />
                    </span>
                    <button type="button" className="min-w-0 text-left text-sm" onClick={() => set({ task: e.taskId })}>
                      <span className="font-medium">{v.label}</span> <span className="font-mono text-xs text-ink">{e.taskId}</span>{" "}
                      <span className="text-ink-2">{eventDetail(e)}</span>
                      <span className="mt-0.5 block text-xs text-ink-3">{where ? `Moved between sites: ${where}` : `Job ${e.jobId}`}</span>
                    </button>
                    <time dateTime={it.time} className="whitespace-nowrap text-xs tnum text-ink-3">
                      {time.dayTime(it.time)}
                    </time>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </Card>
    </OpsPage>
  );
}
