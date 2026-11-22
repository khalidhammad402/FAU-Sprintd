/** Shared data hooks of the Operations Console. */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { adminApi } from "@/api/adapters";
import { qk, useKpis, useSites } from "@/api/queries";
import type { Site, SlotReading } from "@/api/types";
import { time } from "@/lib/time";
import { useLive, useNow } from "@/live/store";

/** "Today so far" and the same window yesterday, so trends compare like with like. */
export function useTodayKpis() {
  const now = useNow();
  const start = time.startOfDay(now);
  const yStart = start ? time.addMinutes(start, -1440) : null;
  const yNow = now ? time.addMinutes(now, -1440) : null;
  const today = useKpis(start, null, { enabled: !!start });
  const prior = useKpis(yStart, yNow, { enabled: !!yStart });
  const runTotal = useKpis(null);
  return { today, prior, runTotal, start };
}

/** Sites from REST with the latest slot.tick applied on top. */
export function useLiveSites(): { sites: Site[]; isPending: boolean; isError: boolean; error: unknown; refetch: () => void } {
  const q = useSites();
  const live = useLive((s) => s.sites);
  const sites = useMemo(
    () =>
      (q.data ?? []).map((s) => {
        const r = live[s.id];
        return r ? { ...s, ...r, id: s.id, name: s.name, type: s.type, lat: s.lat, lon: s.lon, owner: s.owner, tankCapacityKwh: s.tankCapacityKwh, buildingHeightM: s.buildingHeightM } : s;
      }),
    [q.data, live],
  );
  return { sites, isPending: q.isPending, isError: q.isError, error: q.error, refetch: () => void q.refetch() };
}

/**
 * Fleet readings per hour of the simulated day: REST timelines (1h) plus live 15-min readings, summed over
 * sites. Feeds the KPI sparklines.
 */
export function useFleetHourly(siteIds: string[]) {
  const now = useNow();
  const start = time.startOfDay(now);
  const yStart = start ? time.addMinutes(start, -1440) : null;
  const results = useQueries({
    queries: siteIds.map((id) => ({
      queryKey: qk.admin.siteTimeline(id, yStart, "1h"),
      queryFn: () => adminApi.siteTimeline(id, { from: yStart, resolution: "1h" }),
      enabled: !!yStart,
      staleTime: 5 * 60_000,
    })),
  });
  const readings = useLive((s) => s.readings);
  return useMemo(() => {
    const byHour = new Map<string, { demand: number; delivered: number; dumped: number; unmet: number; load: number }>();
    const add = (r: SlotReading) => {
      if (!start || r.time < start) return;
      const h = r.time.slice(0, 13);
      const b = byHour.get(h) ?? { demand: 0, delivered: 0, dumped: 0, unmet: 0, load: 0 };
      b.demand += r.demandKwh;
      b.delivered += r.deliveredKwh;
      b.dumped += r.dumpedKwh;
      b.unmet += r.unmetKwh;
      b.load += r.loadKw;
      byHour.set(h, b);
    };
    const seen = new Set<string>();
    results.forEach((q, i) =>
      q.data?.forEach((r) => {
        seen.add(`${siteIds[i]}:${r.time.slice(0, 13)}`);
        add(r);
      }),
    );
    // live 15-min readings for hours the REST timeline did not have yet
    for (const [id, rows] of Object.entries(readings)) rows.forEach((r) => !seen.has(`${id}:${r.time.slice(0, 13)}`) && add(r));
    return [...byHour.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([h, v]) => ({ hour: h, ...v, coverage: v.demand ? (100 * v.delivered) / v.demand : null }));
  }, [results, readings, start, siteIds]);
}

/** Drawer and filter state live in the URL (?site=H1&tab=servers, ?server=H1-S1, ?task=J1-T1). */
export function useOpsParams() {
  const [params, setParams] = useSearchParams();
  const set = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        Object.entries(patch).forEach(([k, v]) => (v == null || v === "" ? n.delete(k) : n.set(k, v)));
        return n;
      },
      { replace: false },
    );
  return { params, get: (k: string) => params.get(k), set, closeDrawers: () => set({ site: null, tab: null, server: null, task: null }) };
}
