/** Panels shared by the Site/Server drawers and the Site/Server Details pages. */
import { useMemo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { Activity, AlertOctagon, Wind } from "lucide-react";
import { useServers, useSiteServers, useSiteTimeline, useTasks } from "@/api/queries";
import type { Server, Site, SlotReading, Task } from "@/api/types";
import { cn } from "@/lib/cn";
import { kw, num } from "@/lib/format";
import { hostType } from "@/lib/terms";
import { time } from "@/lib/time";
import { useLive, useNow } from "@/live/store";
import {
  AlertCard,
  DonutGauge,
  EmptyState,
  eventDetail,
  HeatFlowChart,
  HeatPulse,
  HostGlyph,
  OriginBadge,
  ProgressBar,
  QueryState,
  RackBar,
  Segmented,
  siteStatus,
  Skeleton,
  StackedBars,
  StatusChip,
  TaskChain,
  Timeline,
  toneText,
  type Tone,
} from "@/design-system";

export function Section({ title, sub, right, children, className }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("mt-6 first:mt-0", className)}>
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {sub && <p className="text-xs text-ink-3">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function SiteHeader({ site, live, right }: { site: Site; live: boolean; right?: ReactNode }) {
  const v = siteStatus[site.status] ?? siteStatus.covered;
  const ht = hostType(site.type);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-ctl bg-surface-3", toneText[v.tone as Tone])}>
            <HostGlyph icon={ht.icon} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-2xs text-ink-3">{`Host business · ${site.id}`}</p>
            <h2 className="truncate text-lg font-semibold tracking-tight">{site.name}</h2>
            <p className="text-xs text-ink-2">{ht.label}</p>
          </div>
        </div>
        {right}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusChip kind="site" value={site.status} />
        <OriginBadge live={live} />
      </div>
    </div>
  );
}

/** REST timeline (15 min, last 24 h) with live readings appended, de-duplicated by time */
export function useSiteSeries(siteId: string) {
  const now = useNow();
  const from = now ? time.addMinutes(time.startOfDay(now) ?? now, -1440) : null;
  const q = useSiteTimeline(siteId, from ? from.slice(0, 13) + ":00:00.000Z" : null, "15m");
  const live = useLive((s) => s.readings[siteId]);
  const rows = useMemo(() => {
    const m = new Map<string, SlotReading>();
    (q.data ?? []).forEach((r) => m.set(new Date(r.time).toISOString(), r));
    (live ?? []).forEach((r) => m.set(new Date(r.time).toISOString(), r));
    return [...m.values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  }, [q.data, live]);
  return { rows, q };
}

export function HeatFlowPanel({ siteId, height = 190 }: { siteId: string; height?: number }) {
  const [range, setRange] = useState(24);
  const { rows, q } = useSiteSeries(siteId);
  const shown = rows.slice(-range);
  const last = rows[rows.length - 1];
  return (
    <Section
      title="Heat flow"
      sub={last ? `Last 15 minutes: demand ${num(last.demandKwh, 2)} kWh, server heat ${num(last.producedKwh, 2)} kWh` : undefined}
      right={<Segmented size="sm" label="Time range" value={range} onChange={setRange} options={[{ value: 12, label: "3 h" }, { value: 24, label: "6 h" }, { value: 96, label: "24 h" }]} />}
    >
      {q.isPending ? <Skeleton className="h-44" /> : <HeatFlowChart rows={shown} height={height} />}
    </Section>
  );
}

export function TankPanel({ site }: { site: Site }) {
  const pct = site.tankCapacityKwh ? (100 * site.tankKwh) / site.tankCapacityKwh : 0;
  const tone: Tone = site.status === "dumping" ? "dump" : site.status === "unmet" ? "critical" : "tank";
  const util = site.capacityKw ? site.loadKw / site.capacityKw : 0;
  return (
    <Section title="Thermal tank" sub="now">
      <div className={cn("flex items-center gap-5", site.status === "offline" && "stale")}>
        <DonutGauge variant="tank" tone={tone} value={site.tankKwh} max={site.tankCapacityKwh} size={124} label={`Tank ${Math.round(pct)} percent full`}>
          <span>
            <span className="block text-xl font-light tnum">
              {num(pct, 0)}
              <span className="text-xs text-ink-3"> %</span>
            </span>
            <span className="block text-2xs text-ink-2 tnum">
              {num(site.tankKwh, 1)} / {num(site.tankCapacityKwh, 0)} kWh
            </span>
          </span>
        </DonutGauge>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <HeatPulse on={site.loadKw > 0 && site.status !== "offline"} load={util} />
          <p className="text-sm">
            <b className="font-semibold tnum">{kw(site.loadKw, 2)}</b> <span className="text-ink-2">of {kw(site.capacityKw, 0)} compute is heating the tank</span>
          </p>
          <p className="text-xs text-ink-3">{siteStatus[site.status]?.text}</p>
        </div>
      </div>
    </Section>
  );
}

/** Servers of a site: REST list with server.status pushes applied */
export function useSiteServerList(siteId: string) {
  const q = useSiteServers(siteId);
  const live = useLive((s) => s.servers);
  const list = useMemo(() => (q.data ?? []).map((s) => live[s.id] ?? s), [q.data, live]);
  return { list, q };
}

export function RackPanel({ siteId, onServer, pausedBy }: { siteId: string; onServer?: (id: string) => void; pausedBy?: Record<string, Task[]> }) {
  const { list, q } = useSiteServerList(siteId);
  return (
    <Section title="Server racks" sub="load by running task, kW">
      <QueryState query={q} skeleton={<Skeleton className="h-24" />} empty={<p className="text-sm text-ink-3">No servers at this site.</p>}>
        {() => (
          <div className="flex flex-col">
            {list.map((s) => (
              <RackBar
                key={s.id}
                capacityKw={s.capacityKw}
                loadKw={s.loadKw}
                offline={s.status === "offline"}
                tasks={[...s.tasks, ...(pausedBy?.[s.id] ?? []).map((t) => ({ ...t, paused: true }))]}
                onClick={onServer ? () => onServer(s.id) : undefined}
                label={
                  <>
                    {s.id}
                    <OriginBadge live={s.live} />
                  </>
                }
              />
            ))}
          </div>
        )}
      </QueryState>
    </Section>
  );
}

export function TodayCounters({ siteId }: { siteId: string }) {
  const { rows } = useSiteSeries(siteId);
  const now = useNow();
  const start = time.startOfDay(now);
  const today = rows.filter((r) => start && Date.parse(r.time) >= Date.parse(start));
  const dumped = today.reduce((a, r) => a + r.dumpedKwh, 0),
    unmet = today.reduce((a, r) => a + r.unmetKwh, 0);
  return (
    <div className="mt-6 grid grid-cols-2 gap-2.5">
      {[
        { label: "Heat dumped", v: dumped, I: Wind, cls: "text-dump-ink" },
        { label: "Unmet, from backup", v: unmet, I: AlertOctagon, cls: "text-critical-ink" },
      ].map((c) => (
        <div key={c.label} className="rounded-card border border-line bg-surface-2 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-xs text-ink-2">
            <c.I aria-hidden className={cn("h-3.5 w-3.5", c.cls)} />
            {c.label}
          </p>
          <p className="mt-1 text-lg font-light tnum">
            {num(c.v, 2)} <span className="text-xs text-ink-3">kWh</span>
          </p>
          <p className="text-2xs text-ink-3">today</p>
        </div>
      ))}
    </div>
  );
}

export function SiteAlerts({ siteId }: { siteId: string }) {
  const alerts = useLive(useShallow((s) => s.alerts.filter((a) => a.siteId === siteId).slice(0, 3)));
  const now = useNow();
  return (
    <Section title="Recent alerts">
      {alerts.length ? <div className="flex flex-col gap-2">{alerts.map((a) => <AlertCard key={a.id} alert={a} now={now} />)}</div> : <p className="text-sm text-ink-3">No alerts for this site.</p>}
    </Section>
  );
}

export function ServerCard({ s, onClick, nowMs }: { s: Server; onClick?: () => void; nowMs: number }) {
  const state = s.status === "offline" ? "offline" : s.tasks.length ? "working" : "idle";
  const hb = s.lastHeartbeat ? Math.max(0, Math.round((nowMs - Date.parse(s.lastHeartbeat)) / 1000)) : null;
  return (
    <button type="button" onClick={onClick} className="flex w-full flex-col gap-2.5 rounded-card border border-line bg-surface-2 p-3.5 text-left transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold">{s.id}</span>
        <span className="flex items-center gap-1.5">
          <StatusChip kind="server" value={state} size="sm" />
          <OriginBadge live={s.live} />
        </span>
      </div>
      <RackBar capacityKw={s.capacityKw} loadKw={s.loadKw} offline={s.status === "offline"} tasks={s.tasks} label={`${num(s.capacityKw, 1)} kW rack`} />
      <div className="flex items-center justify-between text-xs text-ink-2">
        <span>{s.tasks.length} running</span>
        <span className="inline-flex items-center gap-1.5">
          <Activity aria-hidden className="h-3 w-3" />
          {s.live ? (hb == null ? "no heartbeat yet" : `heartbeat ${hb} s ago`) : "simulated, no heartbeat"}
        </span>
      </div>
    </button>
  );
}

export function ServerGrid({ siteId, onServer }: { siteId: string; onServer: (id: string) => void }) {
  const { list, q } = useSiteServerList(siteId);
  const nowMs = Date.now();
  return (
    <QueryState query={q} skeleton={<Skeleton className="h-40" />} empty={<EmptyState compact title="No servers here" body="Servers appear when a rack is installed at this site." />}>
      {() => (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {list.map((s) => (
            <ServerCard key={s.id} s={s} nowMs={nowMs} onClick={() => onServer(s.id)} />
          ))}
        </div>
      )}
    </QueryState>
  );
}

export function SiteJobs({ siteId, onTask }: { siteId: string; onTask: (id: string) => void }) {
  const running = useTasks({ siteId, state: "running" });
  const paused = useTasks({ siteId, state: "paused" });
  const tasks = [...(running.data?.items ?? []), ...(paused.data?.items ?? [])];
  return (
    <QueryState
      query={running}
      skeleton={<Skeleton className="h-40" />}
      empty={<EmptyState compact title="No tasks placed here" body="The scheduler places work here when this site needs heat." />}
      isEmpty={() => tasks.length === 0}
    >
      {() => (
        <div className="flex flex-col gap-2.5">
          {tasks.map((t) => (
            <button key={t.id} type="button" onClick={() => onTask(t.id)} className="flex flex-col gap-2.5 rounded-card border border-line bg-surface-2 p-3.5 text-left hover:border-line-strong">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-sm font-semibold">{t.id}</span> <span className="text-sm text-ink-2">{t.name}</span>
                </span>
                <StatusChip kind="task" value={t.state} size="sm" />
              </div>
              <TaskChain task={t} compact />
              <div className="flex items-center gap-3">
                <ProgressBar value={t.progressPct} running={t.state === "running"} tone={t.state === "paused" ? "dump" : "heat"} label={`${t.id} progress`} />
                <span className="w-10 text-right text-xs tnum">{num(t.progressPct, 0)} %</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </QueryState>
  );
}

export function SiteHistory({ siteId }: { siteId: string }) {
  const now = useNow();
  const from = now ? time.addMinutes(time.startOfDay(now) ?? now, -13 * 1440) : null;
  const days = useSiteTimeline(siteId, from ? from.slice(0, 13) + ":00:00.000Z" : null, "1d");
  const servers = useServers();
  const ids = new Set((servers.data ?? []).filter((s) => s.siteId === siteId).map((s) => s.id));
  const events = useLive(useShallow((s) => s.events.filter((e) => (e.toServer && ids.has(e.toServer)) || (e.fromServer && ids.has(e.fromServer))).slice(0, 15)));
  const rows = (days.data ?? []).map((d) => ({ ...d, coverage: d.demandKwh ? (100 * d.deliveredKwh) / d.demandKwh : 0 }));
  return (
    <div className="flex flex-col gap-6">
      <QueryState query={days} skeleton={<Skeleton className="h-44" />}>
        {() => (
          <>
            <StackedBars data={rows} xLabel={(r) => time.day(r.time).split(" ").slice(1).join(" ")} series={[{ key: "coverage", label: "Heat coverage", tone: "ok" }]} unit="%" title="Heat coverage per day, %" height={150} decimals={0} />
            <StackedBars data={rows} xLabel={(r) => time.day(r.time).split(" ").slice(1).join(" ")} series={[{ key: "dumpedKwh", label: "Heat dumped", tone: "dump" }]} unit="kWh" title="Heat dumped per day, kWh" height={150} />
          </>
        )}
      </QueryState>
      <Section title="Events at this site" sub="task lifecycle, live">
        <Timeline items={events.map((e) => ({ key: e.key, time: e.time, kind: e.kind, title: `${e.kind[0].toUpperCase()}${e.kind.slice(1)} · ${e.taskId}`, detail: eventDetail(e) }))} empty="No task events at this site since this page opened." />
      </Section>
    </div>
  );
}
