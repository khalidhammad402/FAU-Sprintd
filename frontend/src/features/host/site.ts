/** Selected site (kept in ?site= when the user has several) and the live-merged overview. */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useHostOverview, useHostSites } from "@/api/queries";
import { useLive } from "@/live/store";

export function useHostSite() {
  const sites = useHostSites();
  const [params, setParams] = useSearchParams();
  const list = sites.data ?? [];
  const wanted = params.get("site");
  const site = list.find((s) => s.id === wanted) ?? list[0] ?? null;
  const select = (id: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("site", id);
      return n;
    });
  /** query string to keep on navigation links when the user has several sites */
  const search = list.length > 1 && site ? `?site=${site.id}` : "";
  return { sites, list, site, siteId: site?.id, select, search };
}

/** REST overview with the latest live reading (overview.update) on top, so the tank moves every slot. */
export function useLiveOverview(siteId: string | undefined) {
  const q = useHostOverview(siteId);
  const live = useLive((s) => (siteId ? s.hostReadings[siteId] : undefined));
  const merged = useMemo(() => {
    if (!q.data) return undefined;
    if (!live) return q.data;
    return { ...q.data, tankKwh: live.tankKwh, serversWorking: live.serversRunning ?? q.data.serversWorking, serversTotal: live.serversTotal ?? q.data.serversTotal };
  }, [q.data, live]);
  return { ...q, data: merged, live };
}
