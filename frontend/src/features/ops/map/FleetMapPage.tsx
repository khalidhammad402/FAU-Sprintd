/**
 * Fleet Map (Operations home, reference image): KPI cards, view toggles and legend, the 3D map of Basel,
 * map controls, the chain line, and a "View as list" table alternative.
 */
import { useMemo, useRef, useState } from "react";
import { ArrowRight, Box, CheckCircle2, Compass, Droplet, Flame, List, LocateFixed, Map as MapIcon, Minus, Plus, Server, Shuffle, Sparkles, WifiOff, Wind, AlertOctagon } from "lucide-react";
import { useTheme } from "@/app/theme";
import { useMotion } from "@/lib/motion";
import { terms, hostType } from "@/lib/terms";
import { num } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useLive } from "@/live/store";
import { DataTable, EmptyState, ErrorState, HostGlyph, IconButton, OriginBadge, Segmented, Skeleton, StatusChip, type Column } from "@/design-system";
import type { Site } from "@/api/types";
import { useLiveSites, useOpsParams } from "../hooks";
import { FleetMap, type FleetMapHandle } from "./FleetMap";
import { KpiStrip } from "./KpiStrip";
import type { View } from "./layers";

const VIEWS = [
  { value: "demand" as const, label: "Heat Demand", icon: Flame },
  { value: "status" as const, label: "Status", icon: CheckCircle2 },
  { value: "servers" as const, label: "Servers", icon: Server },
  { value: "arcs" as const, label: "Arcs", icon: Shuffle },
];
const LEGEND = [
  { label: "Covered", icon: CheckCircle2, cls: "text-ok-ink" },
  { label: "Tank low", icon: Droplet, cls: "text-tank-ink" },
  { label: "Dumping", icon: Wind, cls: "text-dump-ink" },
  { label: "Backup heat", icon: AlertOctagon, cls: "text-critical-ink" },
  { label: "Offline", icon: WifiOff, cls: "text-idle-ink" },
];

export default function FleetMapPage() {
  const { sites, isPending, isError, error, refetch } = useLiveSites();
  const { get, set } = useOpsParams();
  const view = (get("view") as View | null) ?? "demand";
  const asList = get("list") === "1";
  const selected = get("site");
  const drawerOpen = !!(selected || get("server") || get("task"));
  const theme = useTheme((s) => s.theme);
  const migrations = useLive((s) => s.migrations);
  const slot = useLive((s) => s.clock?.slot ?? null);
  const liveServers = useLive((s) => s.servers);
  const { reduced } = useMotion();
  const mapRef = useRef<FleetMapHandle>(null);
  const [is3d, setIs3d] = useState(true);
  const [center, setCenter] = useState({ lat: 47.5596, lon: 7.5886 });
  const [intro] = useState(() => !reduced && !sessionStorage.getItem("dh.intro"));
  const [introRunning, setIntroRunning] = useState(intro);
  const siteIds = useMemo(() => sites.map((s) => s.id), [sites]);
  const endIntro = () => {
    sessionStorage.setItem("dh.intro", "1");
    setIntroRunning(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className={cn("shrink-0 px-5 pt-4", introRunning && "animate-rise")} style={introRunning ? { animationDelay: "1600ms" } : undefined}>
        <KpiStrip siteIds={siteIds} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Segmented label="Map view" value={view} onChange={(v) => set({ view: v === "demand" ? null : v })} options={VIEWS} />
          <span className="flex-1" />
          <ul aria-label="Status legend" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2 max-xl:hidden">
            {LEGEND.map((l) => (
              <li key={l.label} className="inline-flex items-center gap-1.5">
                <l.icon aria-hidden className={cn("h-3.5 w-3.5", l.cls)} />
                {l.label}
              </li>
            ))}
          </ul>
          <button
            type="button"
            aria-pressed={asList}
            onClick={() => set({ list: asList ? null : "1" })}
            className="inline-flex h-8 items-center gap-2 rounded-ctl border border-line-strong bg-surface px-3 text-xs font-medium hover:bg-surface-2"
          >
            {asList ? <MapIcon aria-hidden className="h-3.5 w-3.5" /> : <List aria-hidden className="h-3.5 w-3.5" />}
            {asList ? "Back to map" : "View as list"}
          </button>
        </div>
      </div>

      <div className="relative mt-3 min-h-[360px] flex-1 border-t border-line">
        {isError && !sites.length ? (
          <ErrorState error={error} title="The fleet could not be loaded" onRetry={refetch} />
        ) : isPending ? (
          <div className="grid h-full place-items-center" aria-busy="true">
            <div className="flex w-72 flex-col gap-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ) : !sites.length ? (
          <EmptyState icon={MapIcon} title="No sites in the fleet yet" body="Sites appear here once a host business is connected in data/sites.csv." />
        ) : asList ? (
          <SiteTable sites={sites} selected={selected} onSelect={(id) => set({ site: id })} liveIds={Object.values(liveServers).filter((x) => x.live).map((x) => x.siteId)} />
        ) : (
          <>
            <FleetMap
              ref={mapRef}
              sites={sites}
              view={view}
              selected={selected}
              onSelect={(id) => set({ site: id, tab: null, server: null, task: null })}
              theme={theme}
              migrations={migrations}
              slot={slot}
              intro={intro}
              onIntroDone={endIntro}
              padRight={drawerOpen ? 470 : 0}
              onCenter={(c) => setCenter(c)}
            />
            <div className="pointer-events-none absolute left-5 top-4">
              <p className="text-xl font-light tracking-wide text-ink">Basel</p>
              <p className="mt-0.5 font-mono text-2xs text-ink-3 tnum">
                {num(center.lat, 4)}° N&nbsp;&nbsp;{num(center.lon, 4)}° E
              </p>
            </div>
            <div role="group" aria-label="Map controls" className="absolute bottom-16 left-5 flex flex-col gap-0.5 rounded-card border border-line bg-surface p-1 shadow-card">
              <IconButton icon={Box} label={is3d ? "Flat view" : "3D view"} aria-pressed={is3d} onClick={() => setIs3d(mapRef.current?.toggle3d() ?? true)} />
              <IconButton icon={Plus} label="Zoom in" onClick={() => mapRef.current?.zoomIn()} />
              <IconButton icon={Minus} label="Zoom out" onClick={() => mapRef.current?.zoomOut()} />
              <IconButton icon={Compass} label="Reset north" onClick={() => mapRef.current?.resetNorth()} />
              <IconButton icon={LocateFixed} label="Show the whole fleet" onClick={() => mapRef.current?.locate()} />
            </div>
            <ChainBar hidden={drawerOpen} />
            {introRunning && (
              <button type="button" onClick={endIntro} className="absolute bottom-16 right-5 rounded-ctl border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium shadow-card hover:bg-surface-2">
                Skip intro
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ChainBar({ hidden }: { hidden: boolean }) {
  if (hidden) return null;
  return (
    <div aria-label="How DigitalHeat works" className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full border border-line bg-surface/95 px-4 py-2 text-xs text-ink-2 shadow-card max-lg:hidden">
      <Sparkles aria-hidden className="h-3.5 w-3.5 text-ok-ink" />
      {terms.chain.map((c, i) => (
        <span key={c} className="inline-flex items-center gap-3">
          <span className="font-medium text-ink first-letter:uppercase">{c}</span>
          {i < terms.chain.length - 1 && <ArrowRight aria-hidden className="h-3 w-3 text-ink-3" />}
        </span>
      ))}
    </div>
  );
}

function SiteTable({ sites, selected, onSelect, liveIds }: { sites: Site[]; selected: string | null; onSelect: (id: string) => void; liveIds: string[] }) {
  const cols: Column<Site>[] = [
    {
      key: "name",
      label: "Site",
      render: (s) => (
        <span className="inline-flex items-center gap-2 font-semibold">
          <HostGlyph icon={hostType(s.type).icon} className="h-4 w-4 text-ink-3" />
          {s.name}
        </span>
      ),
    },
    { key: "type", label: "Host type", render: (s) => hostType(s.type).label },
    { key: "status", label: "Status", render: (s) => <StatusChip kind="site" value={s.status} size="sm" /> },
    { key: "demandKwh", label: "Demand, last 15 min", num: true, render: (s) => `${num(s.demandKwh, 2)} kWh` },
    { key: "tank", label: "Tank", num: true, sortValue: (s) => s.tankKwh / s.tankCapacityKwh, render: (s) => `${num((100 * s.tankKwh) / s.tankCapacityKwh, 0)} %` },
    { key: "serversRunning", label: "Servers running", num: true, render: (s) => `${s.serversRunning} / ${s.serversTotal}` },
    { key: "loadKw", label: "Load", num: true, render: (s) => `${num(s.loadKw, 2)} kW` },
    { key: "origin", label: "Origin", sortable: false, render: (s) => <OriginBadge live={liveIds.includes(s.id)} /> },
  ];
  return (
    <div className="h-full overflow-auto p-5">
      <p className="mb-3 text-sm text-ink-2">Same data as the map. Select a row to open the site.</p>
      <DataTable caption="Sites of the fleet" columns={cols} rows={sites} rowKey={(s) => s.id} onRow={(s) => onSelect(s.id)} selectedKey={selected} maxHeight="none" />
    </div>
  );
}
