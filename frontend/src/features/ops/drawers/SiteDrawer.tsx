import { useAgents, useTasks } from "@/api/queries";
import { useChannels } from "@/live/LiveProvider";
import { useLive } from "@/live/store";
import { Drawer, DrawerClose, EmptyState, Tabs } from "@/design-system";
import type { Task } from "@/api/types";
import { useLiveSites, useOpsParams } from "../hooks";
import { HeatFlowPanel, RackPanel, ServerGrid, SiteAlerts, SiteHeader, SiteHistory, SiteJobs, TankPanel, TodayCounters } from "./panels";

/** Site Drawer: Overview, Servers, Jobs, History. State in the URL (?site=H1&tab=servers). */
export default function SiteDrawer({ id }: { id: string }) {
  const { get, set, closeDrawers } = useOpsParams();
  const { sites, isPending } = useLiveSites();
  const site = sites.find((s) => s.id === id);
  const tab = get("tab") ?? "overview";
  useChannels([`site:${id}`]);
  const agents = useAgents();
  const servers = useLive((s) => s.servers);
  const live = Object.values(servers).some((x) => x.siteId === id && x.live) || (agents.data?.items ?? []).some((a) => a.siteId === id && a.online);
  const paused = useTasks({ siteId: id, state: "paused" });
  const pausedBy: Record<string, Task[]> = {};
  (paused.data?.items ?? []).forEach((t) => t.serverId && (pausedBy[t.serverId] ??= []).push(t));

  if (!site)
    return (
      <Drawer label="Site" onClose={closeDrawers} head={<div className="flex justify-end"><DrawerClose onClose={closeDrawers} /></div>}>
        {isPending ? <p className="text-sm text-ink-3">Loading…</p> : <EmptyState compact title="This site does not exist" body="It may have been removed. Pick another site on the map." />}
      </Drawer>
    );
  return (
    <Drawer
      label={`Site ${site.name}`}
      onClose={closeDrawers}
      head={
        <>
          <SiteHeader site={site} live={live} right={<DrawerClose onClose={closeDrawers} />} />
          <div className="mt-3">
            <Tabs
              label="Site sections"
              value={tab}
              onChange={(t) => set({ tab: t === "overview" ? null : t })}
              tabs={[
                { value: "overview", label: "Overview" },
                { value: "servers", label: "Servers", count: site.serversTotal },
                { value: "jobs", label: "Jobs" },
                { value: "history", label: "History" },
              ]}
            />
          </div>
        </>
      }
    >
      <div key={tab} className="animate-rise">
        {tab === "overview" && (
          <>
            <HeatFlowPanel siteId={id} />
            <TankPanel site={site} />
            <RackPanel siteId={id} pausedBy={pausedBy} onServer={(s) => set({ server: s })} />
            <TodayCounters siteId={id} />
            <SiteAlerts siteId={id} />
          </>
        )}
        {tab === "servers" && <ServerGrid siteId={id} onServer={(s) => set({ server: s })} />}
        {tab === "jobs" && <SiteJobs siteId={id} onTask={(t) => set({ task: t })} />}
        {tab === "history" && <SiteHistory siteId={id} />}
      </div>
    </Drawer>
  );
}
