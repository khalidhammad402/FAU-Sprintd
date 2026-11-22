/** Site Details: one host business at a time. Same panels as the Site Drawer, laid out wide. */
import { useNavigate } from "react-router-dom";
import { MapPinned } from "lucide-react";
import { Button, Card, EmptyState, ErrorState, HostGlyph, KpiTile, ProgressBar, Skeleton, StatusChip, siteStatus, toneText, type Tone } from "@/design-system";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";
import { hostType } from "@/lib/terms";
import { time } from "@/lib/time";
import { useLive, useNow } from "@/live/store";
import { OpsPage } from "../OpsShell";
import { useLiveSites, useOpsParams } from "../hooks";
import { HeatFlowPanel, RackPanel, ServerGrid, SiteHeader, SiteHistory, TankPanel, useSiteSeries } from "../drawers/panels";

export default function SitesPage() {
  const { sites, isPending, isError, error, refetch } = useLiveSites();
  const { get, set } = useOpsParams();
  const id = get("id") ?? sites[0]?.id;
  const site = sites.find((s) => s.id === id);
  const nav = useNavigate();
  const servers = useLive((s) => s.servers);
  return (
    <OpsPage title="Site Details" sub="One host business at a time: heat flow, tank, racks and history.">
      {isError && !sites.length ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : !site ? (
        <EmptyState title="No sites yet" body="Sites appear once a host business is connected." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <nav aria-label="Sites" className="flex flex-col gap-2">
            {sites.map((s) => {
              const v = siteStatus[s.status] ?? siteStatus.covered;
              const pct = s.tankCapacityKwh ? (100 * s.tankKwh) / s.tankCapacityKwh : 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-current={s.id === id ? "true" : undefined}
                  onClick={() => set({ id: s.id })}
                  className={cn("flex flex-col gap-2 rounded-card border p-3 text-left transition-colors", s.id === id ? "border-tank/60 bg-tank/10" : "border-line bg-surface hover:border-line-strong")}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <HostGlyph icon={hostType(s.type).icon} className={cn("h-4 w-4 shrink-0", toneText[v.tone as Tone])} />
                      <span className="truncate text-sm font-semibold">{s.name}</span>
                    </span>
                    <StatusChip kind="site" value={s.status} size="sm" />
                  </span>
                  <span className="flex items-center gap-2">
                    <ProgressBar value={pct} tone="tank" label={`${s.name} tank level`} key={`${s.id}-${Math.round(pct)}`} />
                    <span className="w-20 text-right text-xs text-ink-2 tnum">tank {num(pct, 0)} %</span>
                  </span>
                </button>
              );
            })}
          </nav>
          <div key={site.id} className="flex min-w-0 animate-rise flex-col gap-4">
            <Card className="p-5">
              <SiteHeader
                site={site}
                live={Object.values(servers).some((x) => x.siteId === site.id && x.live)}
                right={
                  <Button size="sm" icon={MapPinned} onClick={() => nav(`/ops?site=${site.id}`)}>
                    Show on map
                  </Button>
                }
              />
              <TodayTiles siteId={site.id} />
            </Card>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="p-5">
                <HeatFlowPanel siteId={site.id} height={240} />
              </Card>
              <Card className="p-5">
                <TankPanel site={site} />
                <RackPanel siteId={site.id} onServer={(s) => set({ server: s })} />
              </Card>
            </div>
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Servers</h3>
              <ServerGrid siteId={site.id} onServer={(s) => set({ server: s })} />
            </Card>
            <Card className="p-5">
              <SiteHistory siteId={site.id} />
            </Card>
          </div>
        </div>
      )}
    </OpsPage>
  );
}

function TodayTiles({ siteId }: { siteId: string }) {
  const { rows, q } = useSiteSeries(siteId);
  const now = useNow();
  const start = time.startOfDay(now);
  const today = rows.filter((r) => start && Date.parse(r.time) >= Date.parse(start));
  const s = (k: "demandKwh" | "deliveredKwh" | "dumpedKwh" | "unmetKwh") => today.reduce((a, r) => a + r[k], 0);
  const dem = s("demandKwh");
  return (
    <div className="mt-5 grid grid-cols-4 gap-4 border-t border-line pt-4 max-md:grid-cols-2">
      <KpiTile label="Heat coverage" tone="ok" value={dem ? (100 * s("deliveredKwh")) / dem : null} unit="%" decimals={1} period="today" loading={q.isPending} />
      <KpiTile label="Heat demand" tone="tank" value={dem} unit="kWh" decimals={2} period="today" loading={q.isPending} />
      <KpiTile label="Heat dumped" tone="dump" value={s("dumpedKwh")} unit="kWh" decimals={2} period="today" loading={q.isPending} />
      <KpiTile label="Backup heat" tone="critical" value={s("unmetKwh")} unit="kWh" decimals={2} period="today" loading={q.isPending} />
    </div>
  );
}
