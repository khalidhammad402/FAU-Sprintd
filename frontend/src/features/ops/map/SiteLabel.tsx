/**
 * SiteMarker3D, DOM part: a card at the top of each column (reference image) with the host-type glyph inside
 * a ring that shows servers running over total, the site name, servers and coverage of the last 15 min.
 * Positioned every frame by FleetMap (transform only).
 */
import { forwardRef, useEffect, useRef, useState } from "react";
import type { Site } from "@/api/types";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";
import { hostType } from "@/lib/terms";
import { useMotion } from "@/lib/motion";
import { HostGlyph, siteStatus, toneText, toneVar, type Tone } from "@/design-system";
import type { View } from "./layers";

type Props = { site: Site; view: View; selected: boolean; dimmed: boolean; onSelect: () => void; onHover: (on: boolean) => void };

export const SiteLabel = forwardRef<HTMLDivElement, Props>(function SiteLabel({ site, view, selected, dimmed, onSelect, onHover }, ref) {
  const v = siteStatus[site.status] ?? siteStatus.covered;
  const tone = (view === "servers" ? "idle" : v.tone) as Tone;
  const R = 15,
    C = 2 * Math.PI * R;
  const frac = site.serversTotal ? site.serversRunning / site.serversTotal : 0;
  const cov = site.demandKwh > 0 ? (100 * site.deliveredKwh) / site.demandKwh : null;
  const { reduced } = useMotion();
  // ring sweep 400 ms, then one soft ping when running/total changes
  const [ping, setPing] = useState(0);
  const first = useRef(true);
  const key = `${site.serversRunning}/${site.serversTotal}`;
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (!reduced) setPing((p) => p + 1);
  }, [key, reduced]);
  const ht = hostType(site.type);
  return (
    <div ref={ref} className="pointer-events-auto absolute left-0 top-0 will-change-transform" style={{ opacity: 0 }}>
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
        aria-pressed={selected}
        aria-label={`${site.name}, ${ht.label}. ${v.label}. Heat demand ${num(site.demandKwh, 2)} kilowatt hours in the last 15 minutes. ${site.serversRunning} of ${site.serversTotal} servers running. Tank ${num((100 * site.tankKwh) / site.tankCapacityKwh, 0)} percent.`}
        className={cn(
          "flex items-center gap-2.5 rounded-ctl border bg-surface/95 py-1.5 pl-1.5 pr-3 text-left shadow-card transition-[opacity,border-color] duration-300",
          selected ? "border-ink/50" : "border-line-strong hover:border-ink-3",
          dimmed && "opacity-55",
          site.status === "unmet" && !reduced && "animate-breathe",
        )}
      >
        <span className="relative grid h-9 w-9 shrink-0 place-items-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0" aria-hidden>
            <circle cx="18" cy="18" r={R} fill="none" stroke="rgb(var(--surface-3))" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r={R}
              fill="none"
              stroke={toneVar[tone]}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - frac)}
              transform="rotate(-90 18 18)"
              style={{ transition: "stroke-dashoffset 400ms cubic-bezier(0.23,1,0.32,1), stroke 300ms" }}
            />
          </svg>
          {view === "servers" ? <span className="relative text-2xs font-semibold tnum">{key}</span> : <HostGlyph icon={ht.icon} className={cn("relative h-4 w-4", toneText[tone])} />}
          {ping > 0 && <span key={ping} aria-hidden className="absolute inset-0 rounded-full border" style={{ borderColor: toneVar[tone], animation: "ping1 900ms cubic-bezier(0.23,1,0.32,1) 400ms 1 both" }} />}
        </span>
        <span className="min-w-0">
          <span className="block max-w-[170px] truncate text-[12.5px] font-semibold leading-tight text-ink">{site.name}</span>
          <span className="mt-0.5 flex items-center gap-2 text-2xs leading-tight text-ink-2 tnum">
            {view === "status" ? (
              <span className={cn("inline-flex items-center gap-1 font-semibold", toneText[v.tone])}>
                <v.icon aria-hidden className="h-3 w-3" />
                {v.label}
              </span>
            ) : (
              <>
                <span>
                  {site.serversRunning} / {site.serversTotal} srv
                </span>
                <span aria-hidden className="h-2.5 w-px bg-line-strong" />
                <span>{cov == null ? "– cov" : `${num(cov, 0)} % cov`}</span>
              </>
            )}
          </span>
        </span>
      </button>
    </div>
  );
});
