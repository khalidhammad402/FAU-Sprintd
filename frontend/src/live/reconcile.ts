/**
 * Reconcile rule (blueprint): load a screen with REST, then apply socket events on top.
 * - Every event goes through an idempotent reducer in the live store (repeats after a reconnect are no-ops).
 * - Lists that the socket only partly covers are refetched once per slot (active queries only).
 * - When a jump or reset finishes, every REST collection is refetched: only a limited event history is pushed.
 */
import type { QueryClient } from "@tanstack/react-query";
import { qk } from "@/api/queries";
import type { Agent, Alert, Job, Scheduler, Server, Site, WsMessage, WsTaskEvent } from "@/api/types";
import { useLive, type SiteLive, type SlotKpi } from "./store";

type Ctx = { qc: QueryClient };

export function reconcile(m: WsMessage, { qc }: Ctx) {
  const live = useLive.getState();
  const d = m.data as Record<string, unknown>;
  switch (m.type) {
    case "clock.tick": {
      const next = d as unknown as Scheduler;
      const prev = live.clock;
      live.setClock(next);
      qc.setQueryData(qk.admin.scheduler, next);
      const jumped = prev && prev.mode === "jumping" && next.mode !== "jumping";
      const reset = prev && next.slot < prev.slot;
      if (jumped || reset) {
        live.bumpEpoch();
        void qc.invalidateQueries();
        return;
      }
      if (!prev || prev.slot !== next.slot) refreshPerSlot(qc);
      return;
    }
    case "slot.tick":
    case "overview.update": {
      const r = d as unknown as SiteLive;
      const channel = m.type === "overview.update" ? "host" : m.channel === "fleet" ? "fleet" : "site";
      live.applySlot(r, channel);
      if (channel !== "host") patchSiteList(qc, r);
      return;
    }
    case "kpi.update":
      live.applyKpi({ ...(d as object), time: m.time } as SlotKpi);
      return;
    case "server.status":
      live.applyServer(d as unknown as Server);
      qc.setQueryData<Server[]>(qk.admin.servers, (list) => list?.map((s) => (s.id === (d.id as string) ? (d as unknown as Server) : s)));
      qc.setQueryData(qk.admin.server(d.id as string), d);
      return;
    case "agents.update":
      live.setAgents(((d.items as Agent[]) ?? []).filter(Boolean));
      return;
    case "alert.raised":
      live.applyAlert(d as unknown as Alert);
      return;
    case "notification.new":
      void qc.invalidateQueries({ queryKey: qk.host.notifications });
      return;
    case "job.update": {
      const job = d as unknown as Job;
      live.applyJob(job);
      return;
    }
    default:
      if (m.type.startsWith("task.")) {
        const ev = d as unknown as WsTaskEvent;
        if (live.applyTaskEvent(ev)) {
          void qc.invalidateQueries({ queryKey: qk.admin.task(ev.taskId), refetchType: "active" });
        }
      }
  }
}

/**
 * Lists the socket does not fully describe are refetched after a slot, only if a screen shows them, and
 * throttled per endpoint: some backend calls take seconds late in the simulated year and hold the engine
 * lock (FRONTEND_GAPS.md), so a fast clock must not turn into a request storm. A running request is never
 * cancelled for a newer one (the backend would still finish the old one).
 */
const REFRESH: [string[], number][] = [
  [["admin", "kpis"], 8_000],
  [["admin", "tasks"], 8_000],
  [["admin", "events"], 8_000],
  [["admin", "siteServers"], 8_000],
  [["customer", "job"], 10_000],
  [["customer", "jobTasks"], 10_000],
  [["host", "servers"], 20_000],
  [["admin", "customers"], 30_000],
  [["admin", "jobs"], 45_000],
  [["customer", "jobs"], 45_000],
  [["customer", "overview"], 60_000],
  [["host", "overview"], 90_000],
];
const lastRefresh = new Map<string, number>();
function refreshPerSlot(qc: QueryClient) {
  const now = Date.now();
  for (const [queryKey, every] of REFRESH) {
    const k = queryKey.join("/");
    if (now - (lastRefresh.get(k) ?? 0) < every) continue;
    if (qc.isFetching({ queryKey }) > 0) continue;
    lastRefresh.set(k, now);
    void qc.invalidateQueries({ queryKey, refetchType: "active" }, { cancelRefetch: false });
  }
}

function patchSiteList(qc: QueryClient, r: SiteLive) {
  qc.setQueryData<Site[]>(qk.admin.sites, (list) =>
    list?.map((s) =>
      s.id === r.siteId
        ? {
            ...s,
            status: r.status,
            demandKwh: r.demandKwh,
            producedKwh: r.producedKwh,
            deliveredKwh: r.deliveredKwh,
            dumpedKwh: r.dumpedKwh,
            unmetKwh: r.unmetKwh,
            tankKwh: r.tankKwh,
            loadKw: r.loadKw,
            capacityKw: r.capacityKw,
            serversRunning: r.serversRunning,
            serversTotal: r.serversTotal,
          }
        : s,
    ),
  );
}
