/**
 * deck.gl layers of the fleet map. Every animated layer is driven by a data event:
 *   slot.tick      -> column height tween (500 ms) and one heat pulse rising through working columns (1.6 s)
 *   status change  -> colour crossfade (300 ms) and one ripple at the column base (900 ms)
 *   task.migrated  -> arc draws in 900 ms with a bead at its head, then fades
 *   dumping        -> slow amber shimmer on the column cap while the state lasts
 *   unmet          -> red base glow breathing at 2.4 s while the state lasts
 */
import { ColumnLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { Site, SiteStatus } from "@/api/types";

export type View = "demand" | "status" | "servers" | "arcs";
type RGB = [number, number, number];

export const STATUS_RGB: Record<SiteStatus, RGB> = {
  covered: [52, 211, 153],
  tank_low: [59, 130, 246],
  dumping: [251, 191, 36],
  unmet: [240, 82, 82],
  offline: [148, 163, 184],
};
const HEAT: RGB = [255, 122, 26];
const ARC: RGB = [127, 178, 255];
const IDLE: RGB = [120, 136, 158];

export type ArcAnim = { key: string; from: [number, number]; to: [number, number]; start: number };
export type Ripple = { siteId: string; start: number; color: RGB };
export type Pulse = { siteId: string; start: number };

export type LayerInput = {
  sites: Site[];
  view: View;
  selected: string | null;
  hover: string | null;
  now: number;
  rise: Record<string, number>; // 0..1 per site (intro)
  pulses: Pulse[];
  arcs: ArcAnim[];
  ripples: Ripple[];
  reduced: boolean;
  theme: "dark" | "light";
  /** map zoom: columns shrink when the camera comes close, so a site never fills the screen */
  zoom: number;
};

export const zoomScale = (zoom: number) => Math.max(0.22, Math.min(1.25, Math.pow(2, 13.4 - zoom)));

/** Column height in metres: heat demand of the last 15 min, scaled to the fleet's maximum. */
export function elevationOf(s: Site, maxDemand: number, view: View) {
  if (s.status === "offline") return 60;
  if (view === "status") return 420;
  const f = Math.pow(Math.max(0, s.demandKwh) / Math.max(maxDemand, 1e-6), 0.7);
  return 140 + 1100 * f;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** sampled 3D arc between two sites, height proportional to distance */
export function arcPath(a: [number, number], b: [number, number], n = 48): [number, number, number][] {
  const dx = (b[0] - a[0]) * 75000,
    dy = (b[1] - a[1]) * 111000;
  const h = Math.max(220, Math.hypot(dx, dy) * 0.32);
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 40 + h * 4 * t * (1 - t)];
  });
}

export function buildLayers(p: LayerInput): Layer[] {
  const { sites, view, selected, hover, now, rise, reduced, theme } = p;
  const zs = zoomScale(p.zoom);
  const maxDemand = Math.max(0.05, ...sites.map((s) => s.demandKwh));
  const dim = (id: string) => (selected && selected !== id ? 0.55 : 1) * (view === "arcs" ? 0.45 : 1);
  const colorOf = (s: Site): RGB => (view === "servers" ? IDLE : STATUS_RGB[s.status] ?? STATUS_RGB.covered);
  const breathe = reduced ? 0.6 : 0.45 + 0.35 * (0.5 + 0.5 * Math.sin((now / 2400) * 2 * Math.PI));
  const shimmer = reduced ? 0.5 : 0.5 + 0.5 * Math.sin((now / 3200) * 2 * Math.PI);
  const layers: Layer[] = [];

  // ground glow: three soft discs, intensity follows demand; breathing while backup heat is needed
  [3.4, 2.3, 1.5].forEach((r, i) =>
    layers.push(
      new ScatterplotLayer<Site>({
        id: `glow-${i}`,
        data: sites,
        getPosition: (s) => [s.lon, s.lat],
        getRadius: (s) => 70 * r * (s.id === selected ? 1.15 : 1),
        getFillColor: (s) => {
          if (s.status === "offline") return [0, 0, 0, 0];
          const f = 0.35 + 0.65 * Math.pow(s.demandKwh / maxDemand, 0.6);
          const a = (s.status === "unmet" ? breathe * 2 : f) * (view === "status" ? 1.6 : 1) * (rise[s.id] ?? 1) * dim(s.id);
          return [...colorOf(s), Math.round(Math.min(255, (theme === "dark" ? 38 : 30) * a * (i + 1) * 0.6))] as [number, number, number, number];
        },
        radiusUnits: "meters",
        updateTriggers: { getFillColor: [view, selected, Math.round(breathe * 20), maxDemand], getRadius: [selected] },
        transitions: { getFillColor: 300 },
        parameters: { depthWriteEnabled: false },
      }),
    ),
  );

  // base ring: status colour, dashed feel for offline via lower alpha
  layers.push(
    new ScatterplotLayer<Site>({
      id: "base-ring",
      data: sites,
      getPosition: (s) => [s.lon, s.lat],
      getRadius: (s) => (s.id === selected || s.id === hover ? 120 : 95),
      stroked: true,
      filled: false,
      lineWidthUnits: "pixels",
      getLineWidth: (s) => (s.id === selected ? 2.5 : 1.5),
      getLineColor: (s) => [...colorOf(s), Math.round(230 * dim(s.id) * (s.status === "offline" ? 0.6 : 1))] as [number, number, number, number],
      radiusUnits: "meters",
      updateTriggers: { getLineColor: [view, selected], getRadius: [selected, hover], getLineWidth: [selected] },
      transitions: { getLineColor: 300, getRadius: 200 },
    }),
  );

  // site columns
  layers.push(
    new ColumnLayer<Site>({
      id: "columns",
      data: sites,
      diskResolution: 28,
      radius: 62 * Math.pow(zs, 0.55),
      elevationScale: zs,
      extruded: true,
      pickable: true,
      getPosition: (s) => [s.lon, s.lat],
      getElevation: (s) => elevationOf(s, maxDemand, view) * easeOut(rise[s.id] ?? 1),
      getFillColor: (s) => {
        const c = colorOf(s);
        const a = (s.status === "offline" ? 120 : 235) * dim(s.id);
        return [...c, Math.round(a)] as [number, number, number, number];
      },
      material: { ambient: 0.55, diffuse: 0.6, shininess: 24, specularColor: [255, 255, 255] },
      updateTriggers: { getElevation: [view, maxDemand, JSON.stringify(rise)], getFillColor: [view, selected] },
      transitions: reduced ? {} : { getElevation: { duration: 500, easing: easeOut }, getFillColor: 300 },
    }),
  );

  // dumping: a slow amber shimmer band on the cap
  const dumping = sites.filter((s) => s.status === "dumping" && view !== "servers");
  if (dumping.length)
    layers.push(
      new ScatterplotLayer<Site>({
        id: "dump-shimmer",
        data: dumping,
        getPosition: (s) => [s.lon, s.lat, elevationOf(s, maxDemand, view) * zs * easeOut(rise[s.id] ?? 1) + 6 + 18 * shimmer],
        getRadius: (52 + 26 * shimmer) * Math.pow(zs, 0.55),
        stroked: true,
        filled: false,
        lineWidthUnits: "pixels",
        getLineWidth: 1.5,
        getLineColor: [251, 191, 36, Math.round(200 * (1 - shimmer) * 0.9)],
        radiusUnits: "meters",
        updateTriggers: { getPosition: [shimmer, view], getLineColor: [shimmer], getRadius: [shimmer] },
      }),
    );

  // heat pulse: an orange band rising through each working column, once per slot
  const pulseData = p.pulses
    .map((pl) => ({ pl, s: sites.find((x) => x.id === pl.siteId) }))
    .filter((x): x is { pl: Pulse; s: Site } => !!x.s && now - x.pl.start >= 0 && now - x.pl.start < 1600);
  if (pulseData.length && !reduced)
    layers.push(
      new ScatterplotLayer<{ pl: Pulse; s: Site }>({
        id: "heat-pulse",
        data: pulseData,
        getPosition: ({ pl, s }) => {
          const k = easeInOut(clamp01((now - pl.start) / 1600));
          return [s.lon, s.lat, 8 + (elevationOf(s, maxDemand, view) * zs - 8) * k];
        },
        getRadius: 54 * Math.pow(zs, 0.55),
        getFillColor: ({ pl }) => [...HEAT, Math.round(235 * Math.sin(Math.PI * clamp01((now - pl.start) / 1600)))] as [number, number, number, number],
        radiusUnits: "meters",
        updateTriggers: { getPosition: [now], getFillColor: [now] },
        parameters: { depthWriteEnabled: false },
      }),
    );

  // status ripple at the base, one shot
  const ripples = p.ripples.filter((r) => now - r.start < 900);
  if (ripples.length && !reduced)
    layers.push(
      new ScatterplotLayer<Ripple>({
        id: "ripples",
        data: ripples,
        getPosition: (r) => {
          const s = sites.find((x) => x.id === r.siteId);
          return s ? [s.lon, s.lat] : [0, 0];
        },
        getRadius: (r) => 100 + 380 * easeOut(clamp01((now - r.start) / 900)),
        stroked: true,
        filled: false,
        lineWidthUnits: "pixels",
        getLineWidth: 2,
        getLineColor: (r) => [...r.color, Math.round(220 * (1 - clamp01((now - r.start) / 900)))] as [number, number, number, number],
        radiusUnits: "meters",
        updateTriggers: { getRadius: [now], getLineColor: [now] },
      }),
    );

  // migration arcs: the path grows for 900 ms with a bead at its head, then a settled arc fades out
  const LIFE = 14000;
  const arcs = p.arcs.filter((a) => now - a.start < LIFE);
  if (arcs.length) {
    const emph = view === "arcs" ? 1 : 0.75;
    layers.push(
      new PathLayer<ArcAnim>({
        id: "arcs-settled",
        data: arcs.filter((a) => now - a.start >= 900 || reduced),
        getPath: (a) => arcPath(a.from, a.to),
        getColor: (a) => [...ARC, Math.round(200 * emph * (1 - clamp01((now - a.start - 9000) / (LIFE - 9000))))] as [number, number, number, number],
        getWidth: view === "arcs" ? 3 : 2,
        widthUnits: "pixels",
        jointRounded: true,
        capRounded: true,
        updateTriggers: { getColor: [Math.round(now / 100), view], getWidth: [view] },
        parameters: { depthWriteEnabled: false },
      }),
    );
    const drawing = reduced ? [] : arcs.filter((a) => now - a.start < 900);
    if (drawing.length) {
      const head = (a: ArcAnim) => Math.max(1, Math.round(easeOut(clamp01((now - a.start) / 900)) * 48));
      layers.push(
        new PathLayer<ArcAnim>({
          id: "arcs-drawing",
          data: drawing,
          getPath: (a) => arcPath(a.from, a.to).slice(0, head(a) + 1),
          getColor: [...ARC, 245],
          getWidth: 3,
          widthUnits: "pixels",
          capRounded: true,
          jointRounded: true,
          updateTriggers: { getPath: [now] },
          parameters: { depthWriteEnabled: false },
        }),
      );
      layers.push(
        new ScatterplotLayer<ArcAnim>({
          id: "arc-bead",
          data: drawing,
          getPosition: (a) => {
            const path = arcPath(a.from, a.to);
            return path[Math.min(path.length - 1, head(a))];
          },
          getRadius: 4.5,
          radiusUnits: "pixels",
          getFillColor: [...HEAT, 255],
          updateTriggers: { getPosition: [now] },
          parameters: { depthWriteEnabled: false },
        }),
      );
    }
  }
  return layers;
}
