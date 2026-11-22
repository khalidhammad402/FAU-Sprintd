/** Server Details: every rack in the fleet, grouped by site, plus the real laptop agents. */
import { Plug } from "lucide-react";
import { useAgents } from "@/api/queries";
import { Card, CardHeader, EmptyState, ErrorState, OriginBadge, ProgressBar, Skeleton, StatusChip } from "@/design-system";
import { num } from "@/lib/format";
import { hostType } from "@/lib/terms";
import { OpsPage } from "../OpsShell";
import { useLiveSites, useOpsParams } from "../hooks";
import { ServerGrid } from "../drawers/panels";

export default function ServersPage() {
  const { sites, isPending, isError, error, refetch } = useLiveSites();
  const agents = useAgents();
  const { set } = useOpsParams();
  return (
    <OpsPage title="Server Details" sub="Every rack in the fleet. LIVE servers run a real process on a laptop agent. All others are simulated by the scheduler model.">
      <Card className="mb-4 p-5">
        <CardHeader title="Live laptop agents" sub={`What really runs on each agent, measured on the device. MQTT: ${agents.data?.mqtt ?? "–"}`} right={<OriginBadge live />} />
        <div className="mt-4">
          {agents.isPending ? (
            <Skeleton className="h-20" />
          ) : !agents.data?.items.length ? (
            <EmptyState
              compact
              icon={Plug}
              title="No laptop connected"
              body={
                <>
                  Start an agent with <code className="font-mono text-xs">python -m live.agent --server-id H1-S1 --host &lt;ip&gt;</code>. Until then every server is SIMULATED.
                </>
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {agents.data.items.map((a) => (
                <button key={a.serverId} type="button" onClick={() => set({ server: a.serverId })} className="rounded-card border border-line bg-surface-2 p-3.5 text-left hover:border-line-strong">
                  <p className="flex items-center justify-between text-sm">
                    <span>
                      <b className="font-mono">{a.host ?? "agent"}</b> <span className="text-ink-2">as {a.serverId}</span>
                    </span>
                    <StatusChip kind="server" value={a.online ? "online" : "offline"} size="sm" />
                  </p>
                  <p className="mt-1 text-xs text-ink-3 tnum">
                    CPU {num(a.cpuPct, 0)} % · last seen {num(a.secondsSinceSeen, 0)} s ago
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {a.processes.map((p) => (
                      <div key={p.taskId} className="flex items-center gap-2 text-xs">
                        <span className="w-28 truncate font-mono">{p.taskId}</span>
                        <ProgressBar value={p.progressPct} running={p.state === "running"} tone={p.state === "paused" ? "dump" : "heat"} label={`${p.taskId} progress`} />
                        <span className="w-16 text-right tnum">{num(p.progressPct, 0)} %</span>
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>
      {isError && !sites.length ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="flex flex-col gap-4">
          {sites.map((s) => (
            <Card key={s.id} className="p-5">
              <CardHeader
                title={s.name}
                sub={`${hostType(s.type).label} · ${s.serversRunning} of ${s.serversTotal} servers running · ${num(s.loadKw, 2)} of ${num(s.capacityKw, 1)} kW`}
                right={<StatusChip kind="site" value={s.status} size="sm" />}
              />
              <div className="mt-4">
                <ServerGrid siteId={s.id} onServer={(id) => set({ server: id })} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </OpsPage>
  );
}
