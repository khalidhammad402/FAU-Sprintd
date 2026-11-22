import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { ChevronLeft, Cpu, Activity, Server as ServerIcon } from "lucide-react";
import { useAgents, useServer, useServerTimeline, useTasks } from "@/api/queries";
import { useChannels } from "@/live/LiveProvider";
import { useLive, useNow } from "@/live/store";
import { kw, num } from "@/lib/format";
import { time } from "@/lib/time";
import { Button, CheckDraw, Drawer, DrawerClose, EmptyState, eventDetail, HeatPulse, OriginBadge, ProgressBar, RackBar, SimpleBars, Skeleton, StatusChip, Timeline } from "@/design-system";
import { useLiveSites, useOpsParams } from "../hooks";
import { Section } from "./panels";

/** Server Drawer: utilisation, per-task progress, LIVE or SIMULATED, CPU and heartbeat when live, lifecycle. */
export default function ServerDrawer({ id }: { id: string }) {
  const { get, set, closeDrawers } = useOpsParams();
  useChannels([`server:${id}`]);
  const q = useServer(id);
  const pushed = useLive((s) => s.servers[id]);
  const srv = pushed ?? q.data;
  const { sites } = useLiveSites();
  const site = sites.find((s) => s.id === srv?.siteId);
  const agents = useAgents();
  const agent = agents.data?.items.find((a) => a.serverId === id);
  const live = !!srv?.live || !!agent?.online;
  const now = useNow();
  const from = now ? time.addMinutes(now, -1440) : null;
  const tl = useServerTimeline(id, from ? from.slice(0, 13) + ":00:00.000Z" : null);
  const tasks = useTasks({ serverId: id });
  const events = useLive(useShallow((s) => s.events.filter((e) => e.toServer === id || e.fromServer === id).slice(0, 14)));
  const fullTasks = useMemo(() => new Map((tasks.data?.items ?? []).map((t) => [t.id, t])), [tasks.data]);

  const head = (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-ctl bg-surface-3 text-heat-ink">
            <ServerIcon aria-hidden className="h-5 w-5" />
          </span>
          <div>
            <p className="font-mono text-2xs text-ink-3">{`Server · ${srv ? kw(srv.capacityKw, 1) : ""} rack`}</p>
            <h2 className="font-mono text-lg font-semibold">{id}</h2>
            <p className="text-xs text-ink-2">{site?.name ?? srv?.siteId}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {get("site") && (
            <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={() => set({ server: null })}>
              Site
            </Button>
          )}
          <DrawerClose onClose={closeDrawers} />
        </div>
      </div>
      {srv && (
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusChip kind="server" value={srv.status === "offline" ? "offline" : srv.tasks.length ? "working" : "idle"} />
          <OriginBadge live={live} />
        </div>
      )}
    </div>
  );

  if (!srv)
    return (
      <Drawer label={`Server ${id}`} onClose={closeDrawers} head={head}>
        {q.isPending ? <Skeleton className="h-40" /> : <EmptyState compact title="This server does not exist" body="Pick a server from a site." />}
      </Drawer>
    );
  const util = srv.capacityKw ? (100 * srv.loadKw) / srv.capacityKw : 0;
  const hb = agent?.lastSeen ?? srv.lastHeartbeat;
  return (
    <Drawer label={`Server ${id}`} onClose={closeDrawers} head={head}>
      <Section title="Rack utilisation" sub="last 15 min">
        <p className="mb-2 flex items-baseline gap-2">
          <span className="text-xl font-light tnum">{num(util, 0)}</span>
          <span className="text-sm text-ink-3">%</span>
          <span className="text-sm text-ink-2 tnum">
            {num(srv.loadKw, 2)} of {num(srv.capacityKw, 1)} kW
          </span>
        </p>
        <RackBar capacityKw={srv.capacityKw} loadKw={srv.loadKw} offline={srv.status === "offline"} tasks={srv.tasks} label="Load by task" />
        <div className="mt-2">
          <HeatPulse on={srv.loadKw > 0} load={util / 100} label={srv.loadKw > 0 ? `${num(srv.loadKw * 0.25 * 0.8, 3)} kWh of heat per 15 min into the tank` : "No heat: server idle"} />
        </div>
      </Section>

      <Section title={live ? "Measured on the laptop agent" : "Device data"}>
        {live ? (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-card border border-line bg-surface-2 p-3">
              <p className="flex items-center gap-1.5 text-xs text-ink-2">
                <Cpu aria-hidden className="h-3.5 w-3.5 text-heat-ink" />
                CPU
              </p>
              <p className="text-lg font-light tnum">{num(agent?.cpuPct ?? srv.cpuPct, 0)} %</p>
              <p className="text-2xs text-ink-3">{agent?.host ?? "agent"}</p>
            </div>
            <div className="rounded-card border border-line bg-surface-2 p-3">
              <p className="flex items-center gap-1.5 text-xs text-ink-2">
                <Activity aria-hidden className="h-3.5 w-3.5 text-ok-ink" />
                Heartbeat
              </p>
              <p className="text-lg font-light tnum">{agent?.secondsSinceSeen != null ? `${num(agent.secondsSinceSeen, 0)} s ago` : hb ? time.hm(hb) : "–"}</p>
              <p className="text-2xs text-ink-3">MQTT agent</p>
            </div>
          </div>
        ) : (
          <p className="rounded-card border border-dashed border-line-strong p-3 text-sm text-ink-2">
            {srv.status === "offline"
              ? "Offline: no heartbeat. Its tasks were moved to other servers."
              : "Simulated server. CPU and heartbeat come only from LIVE servers, which run a real process on a laptop agent."}
          </p>
        )}
      </Section>

      <Section title="Tasks on this server" sub={`${srv.tasks.length} running in the last slot`}>
        {srv.tasks.length === 0 ? (
          <p className="text-sm text-ink-3">{srv.status === "offline" ? "Offline. Nothing can run here." : "Idle. The scheduler places work here when the site needs heat."}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {srv.tasks.map((t) => (
              <button key={t.id} type="button" onClick={() => set({ task: t.id })} className="flex flex-col gap-2 rounded-card border border-line bg-surface-2 p-3 text-left hover:border-line-strong">
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-mono font-semibold">{t.id}</span> <span className="text-ink-2">{t.name}</span>
                  </span>
                  {t.progressPct >= 100 ? <CheckDraw /> : <StatusChip kind="task" value={fullTasks.get(t.id)?.state ?? "running"} size="sm" />}
                </span>
                <span className="flex items-center gap-3">
                  <ProgressBar value={t.progressPct} running={t.progressPct < 100} tone={t.progressPct >= 100 ? "ok" : "heat"} label={`${t.id} progress`} />
                  <span className="w-24 text-right text-xs tnum text-ink-2">
                    {num(t.progressPct, 0)} % · {kw(t.powerKw, 2)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="Load, last 24 h" sub="hourly average">
        {tl.isPending ? <Skeleton className="h-32" /> : <SimpleBars data={(tl.data ?? []).map((r) => ({ x: time.hm(r.time), v: r.loadKw }))} unit="kW" color="rgb(var(--heat))" label="Average load" height={130} />}
      </Section>

      <Section title="Lifecycle on this server" sub="live, since this page opened">
        <Timeline
          items={events.map((e) => ({ key: e.key, time: e.time, kind: e.kind, title: `${e.kind[0].toUpperCase()}${e.kind.slice(1)} · ${e.taskId}`, detail: eventDetail(e), isNew: Date.now() - e.receivedAt < 2000 }))}
          empty="No task events on this server yet."
        />
      </Section>
    </Drawer>
  );
}
