/** Hover tooltip: name, status, demand (last 15 min), servers running/total, tank %. */
import type { Site } from "@/api/types";
import { num } from "@/lib/format";
import { hostType } from "@/lib/terms";
import { OriginBadge, StatusChip } from "@/design-system";
import { useLive } from "@/live/store";

export function HoverCard({ site, labelEl }: { site: Site; labelEl: HTMLDivElement | null | undefined }) {
  const live = useLive((s) => Object.values(s.servers).some((x) => x.siteId === site.id && x.live));
  if (!labelEl) return null;
  const t = labelEl.style.transform; // follow the label card, sit just below it
  return (
    <div role="tooltip" className="pointer-events-none absolute left-0 top-0 z-[5000] w-[260px] animate-rise" style={{ transform: `${t} translateY(52px)` }}>
      <div className="rounded-card border border-line-strong bg-surface p-3 text-xs shadow-pop">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{site.name}</span>
          <OriginBadge live={live} />
        </div>
        <div className="mb-2 mt-1.5 flex items-center gap-2">
          <StatusChip kind="site" value={site.status} size="sm" />
          <span className="text-ink-3">{hostType(site.type).label}</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-ink-3">Heat demand</dt>
          <dd className="text-right tnum">{num(site.demandKwh, 2)} kWh, last 15 min</dd>
          <dt className="text-ink-3">Servers</dt>
          <dd className="text-right tnum">
            {site.serversRunning} / {site.serversTotal} running
          </dd>
          <dt className="text-ink-3">Tank</dt>
          <dd className="text-right tnum">
            {num((100 * site.tankKwh) / site.tankCapacityKwh, 0)} % ({num(site.tankKwh, 1)} / {num(site.tankCapacityKwh, 0)} kWh)
          </dd>
        </dl>
      </div>
    </div>
  );
}
