/**
 * Fleet map of Basel: MapLibre GL with real OSM vector tiles and 3D buildings, deck.gl interleaved for
 * site columns, migration arcs, heat pulses and ripples, DOM cards for site labels.
 * Offline-safe: remote tiles -> bundled Basel tiles -> blank navy grid (the map never shows broken).
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { WebMercatorViewport } from "@deck.gl/core";
import type { Site } from "@/api/types";
import type { Theme } from "@/app/theme";
import { useMotion } from "@/lib/motion";
import { buildStyle, type TileSource } from "./style";
import { buildLayers, elevationOf, zoomScale, STATUS_RGB, type ArcAnim, type Pulse, type Ripple, type View } from "./layers";
import { SiteLabel } from "./SiteLabel";
import { HoverCard } from "./HoverCard";

export type FleetMapHandle = { zoomIn: () => void; zoomOut: () => void; resetNorth: () => void; locate: () => void; toggle3d: () => boolean };
type Props = {
  sites: Site[];
  view: View;
  selected: string | null;
  onSelect: (id: string | null) => void;
  theme: Theme;
  migrations: { key: string; fromSite: string; toSite: string; receivedAt: number }[];
  slot: number | null;
  intro: boolean;
  onIntroDone?: () => void;
  padRight: number;
  onCenter?: (c: { lat: number; lon: number }) => void;
};

const BASEL = { lon: 7.5978, lat: 47.5614 };
const FLEET_PITCH = 55,
  FLEET_BEARING = -18;

export const FleetMap = forwardRef<FleetMapHandle, Props>(function FleetMap({ sites, view, selected, onSelect, theme, migrations, slot, intro, onIntroDone, padRight, onCenter }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const labels = useRef<Record<string, HTMLDivElement | null>>({});
  const [source, setSource] = useState<TileSource | "blank">("remote");
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const { reduced } = useMotion();
  const is3d = useRef(true);

  // animation state (refs: changes every frame)
  const anim = useRef({ rise: {} as Record<string, number>, introStart: 0, pulses: [] as Pulse[], arcs: [] as ArcAnim[], ripples: [] as Ripple[], raf: 0, lastStatus: {} as Record<string, string> });
  const latest = useRef({ sites, view, selected, hover, theme, reduced });
  latest.current = { sites, view, selected, hover, theme, reduced };
  const byId = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  /* ---------- camera ---------- */
  const fleetCamera = (pad = padRight) => {
    const m = mapRef.current;
    if (!m || !latest.current.sites.length) return null;
    const lons = latest.current.sites.map((s) => s.lon),
      lats = latest.current.sites.map((s) => s.lat);
    const cam = m.cameraForBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: { top: 120, bottom: 56, left: 80, right: 80 + pad }, bearing: FLEET_BEARING, pitch: is3d.current ? FLEET_PITCH : 0 },
    );
    return cam ? { ...cam, zoom: Math.min(cam.zoom ?? 13.5, 14.6), bearing: FLEET_BEARING, pitch: is3d.current ? FLEET_PITCH : 0 } : null;
  };
  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn({ duration: 260 }),
    zoomOut: () => mapRef.current?.zoomOut({ duration: 260 }),
    resetNorth: () => mapRef.current?.easeTo({ bearing: 0, duration: 500 }),
    locate: () => {
      const c = fleetCamera();
      if (c) mapRef.current?.easeTo({ ...c, duration: 700 });
    },
    toggle3d: () => {
      is3d.current = !is3d.current;
      mapRef.current?.easeTo({ pitch: is3d.current ? (selected ? 60 : FLEET_PITCH) : 0, duration: 600 });
      return is3d.current;
    },
  }));

  /* ---------- deck layers + label placement ---------- */
  const render = (now = performance.now()) => {
    const m = mapRef.current,
      o = overlay.current,
      L = latest.current;
    if (!m || !o) return;
    const a = anim.current;
    if (a.introStart) {
      L.sites.forEach((s, i) => (a.rise[s.id] = Math.max(0, Math.min(1, (now - a.introStart - 900 - i * 60) / 650))));
    }
    o.setProps({ layers: buildLayers({ sites: L.sites, view: L.view, selected: L.selected, hover: L.hover, now, rise: a.rise, pulses: a.pulses, arcs: a.arcs, ripples: a.ripples, reduced: L.reduced, theme: L.theme, zoom: m.getZoom() }) });
    placeLabels();
  };
  const placeLabels = () => {
    const m = mapRef.current;
    if (!m || !box.current) return;
    const c = m.getCenter();
    const vp = new WebMercatorViewport({
      width: box.current.clientWidth,
      height: box.current.clientHeight,
      longitude: c.lng,
      latitude: c.lat,
      zoom: m.getZoom(),
      pitch: m.getPitch(),
      bearing: m.getBearing(),
      padding: m.getPadding(),
    });
    const L = latest.current;
    const maxDemand = Math.max(0.05, ...L.sites.map((s) => s.demandKwh));
    const placed: { x: number; y: number; w: number }[] = [];
    [...L.sites]
      .map((s) => ({ s, base: vp.project([s.lon, s.lat, 0]) }))
      .sort((p, q) => q.base[1] - p.base[1])
      .forEach(({ s }) => {
        const el = labels.current[s.id];
        if (!el) return;
        const rise = anim.current.rise[s.id] ?? 1;
        const [x, y] = vp.project([s.lon, s.lat, elevationOf(s, maxDemand, L.view) * zoomScale(m.getZoom()) * (1 - Math.pow(1 - rise, 3)) + 30]);
        const w = el.offsetWidth || 180;
        // try right, left, then shifted up or down, so cards never cover each other
        const hits = (cx: number, cy: number) => placed.some((p) => Math.abs(p.y - cy) < 48 && cx < p.x + p.w + 6 && cx + w + 6 > p.x);
        const options: [number, number][] = [
          [x + 14, y],
          [x - 14 - w, y],
          [x + 14, y - 52],
          [x - 14 - w, y - 52],
          [x + 14, y + 52],
          [x - 14 - w, y + 52],
        ];
        const [px, py] = options.find(([cx, cy]) => !hits(cx, cy)) ?? options[0];
        const right = px > x;
        placed.push({ x: px, y: py, w });
        el.style.transform = `translate(${Math.round(px)}px, ${Math.round(py - 22)}px)`;
        el.style.opacity = String(Math.min(1, rise * 1.6));
        el.style.zIndex = String(1000 + Math.round(y));
        el.dataset.side = right ? "right" : "left";
      });
  };
  const loop = () => {
    const a = anim.current,
      now = performance.now();
    a.pulses = a.pulses.filter((p) => now - p.start < 1700);
    a.ripples = a.ripples.filter((r) => now - r.start < 950);
    a.arcs = a.arcs.filter((x) => now - x.start < 14000);
    if (a.introStart && now - a.introStart > 900 + latest.current.sites.length * 60 + 700) {
      a.introStart = 0;
      latest.current.sites.forEach((s) => (a.rise[s.id] = 1));
      onIntroDone?.();
    }
    render(now);
    const breathing = latest.current.sites.some((s) => s.status === "unmet" || s.status === "dumping") && !latest.current.reduced;
    const busy = a.introStart || a.pulses.length || a.ripples.length || a.arcs.some((x) => now - x.start < 900) || breathing || a.arcs.length;
    a.raf = busy && !document.hidden ? requestAnimationFrame(loop) : 0;
  };
  const kick = () => {
    if (!anim.current.raf) anim.current.raf = requestAnimationFrame(loop);
  };

  /* ---------- map lifecycle ---------- */
  const srcRef = useRef<TileSource | "blank">("remote");
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onCenterRef = useRef(onCenter);
  onCenterRef.current = onCenter;
  useEffect(() => {
    if (!box.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      style: buildStyle(theme, "remote"),
      center: [BASEL.lon, BASEL.lat],
      zoom: intro && !reduced ? 11.2 : 13.4,
      pitch: intro && !reduced ? 0 : FLEET_PITCH,
      bearing: intro && !reduced ? -60 : FLEET_BEARING,
      maxPitch: 70,
      minZoom: 10.5,
      maxZoom: 17.5,
      maxBounds: [
        [7.4, 47.45],
        [7.8, 47.68],
      ],
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = m;
    const o = new MapboxOverlay({
      interleaved: true,
      layers: [],
      onHover: (info) => setHover(info.layer?.id === "columns" ? ((info.object as Site | undefined)?.id ?? null) : null),
      onClick: (info) => {
        if (info.layer?.id === "columns" && info.object) onSelectRef.current((info.object as Site).id);
      },
      getCursor: ({ isHovering, isDragging }) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab"),
    });
    overlay.current = o;
    m.addControl(o);
    let fallbackTimer = 0;
    const toLocal = () => {
      if (srcRef.current !== "remote") return;
      srcRef.current = "local";
      setSource("local");
      m.setStyle(buildStyle(latest.current.theme, "local"));
    };
    m.on("load", () => {
      setReady(true);
      box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      fallbackTimer = window.setTimeout(() => !m.isSourceLoaded("osm") && toLocal(), 4000);
      const cam = fleetCamera(0);
      if (intro && !reduced && cam) {
        anim.current.introStart = performance.now() + 600;
        latest.current.sites.forEach((s) => (anim.current.rise[s.id] = 0));
        m.flyTo({ ...cam, duration: 2600, curve: 1.3, essential: false });
        kick();
      } else if (cam) m.jumpTo(cam);
      render();
    });
    m.on("error", (e) => {
      const err = e as unknown as { sourceId?: string; error?: { status?: number; message?: string } };
      if (srcRef.current === "remote" && (err.sourceId === "osm" || /fetch|tile|style/i.test(err.error?.message ?? ""))) toLocal();
      else if (srcRef.current === "local" && err.sourceId === "osm") {
        srcRef.current = "blank";
        setSource("blank");
      }
    });
    m.on("render", placeLabels);
    m.on("zoom", () => render());
    m.on("moveend", () => {
      const c = m.getCenter();
      onCenterRef.current?.({ lat: c.lat, lon: c.lng });
    });
    const a = anim.current;
    const onVis = () => !document.hidden && kick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(fallbackTimer);
      cancelAnimationFrame(a.raf);
      a.raf = 0;
      document.removeEventListener("visibilitychange", onVis);
      m.remove();
      mapRef.current = null;
      overlay.current = null;
    };
    // the map is created once; later prop changes are applied by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // theme switch keeps the tile source that works
  const firstTheme = useRef(true);
  useEffect(() => {
    if (firstTheme.current) return void (firstTheme.current = false);
    const m = mapRef.current;
    if (!m || srcRef.current === "blank") return;
    m.setStyle(buildStyle(theme, srcRef.current as TileSource));
    m.once("style.load", () => render());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // data events -> one-shot animations
  useEffect(() => {
    const a = anim.current,
      now = performance.now();
    sites.forEach((s) => {
      const prev = a.lastStatus[s.id];
      if (prev && prev !== s.status && !reduced) a.ripples.push({ siteId: s.id, start: now, color: STATUS_RGB[s.status] ?? STATUS_RGB.covered });
      a.lastStatus[s.id] = s.status;
    });
    render();
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, view, selected, hover, reduced]);
  useEffect(() => {
    if (slot == null || reduced) return;
    const now = performance.now();
    latest.current.sites.filter((s) => s.loadKw > 0 && s.status !== "offline").forEach((s, i) => anim.current.pulses.push({ siteId: s.id, start: now + i * 90 }));
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);
  const seenArcs = useRef(new Set<string>());
  useEffect(() => {
    const now = performance.now();
    migrations.forEach((mg) => {
      if (seenArcs.current.has(mg.key)) return;
      seenArcs.current.add(mg.key);
      const a = byId.get(mg.fromSite),
        b = byId.get(mg.toSite);
      if (!a || !b || now - mg.receivedAt > 12000) return;
      anim.current.arcs.push({ key: mg.key, from: [a.lon, a.lat], to: [b.lon, b.lat], start: reduced ? now - 900 : now + Math.random() * 300 });
    });
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migrations]);

  // selection: ease the camera to the site with a slight tilt (700 ms ease-out), or back to the fleet
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    const s = selected ? byId.get(selected) : null;
    const dur = reduced ? 0 : 700;
    if (s) m.easeTo({ center: [s.lon, s.lat], zoom: Math.max(15.2, m.getZoom()), pitch: is3d.current ? 60 : 0, padding: { right: padRight, top: 80, left: 0, bottom: 0 }, duration: dur, easing: (k) => 1 - Math.pow(1 - k, 3) });
    else {
      const c = fleetCamera();
      if (c) m.easeTo({ ...c, padding: { right: 0, top: 0, left: 0, bottom: 0 }, duration: dur });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ready]);

  const hovered = hover ? byId.get(hover) : null;
  return (
    <div className="absolute inset-0 overflow-hidden bg-bg" aria-label="Fleet map of Basel">
      {/* blank navy grid under everything: what is left if no tiles load at all */}
      <div aria-hidden className="absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(rgb(var(--line)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--line)) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <div ref={box} className={source === "blank" ? "absolute inset-0 opacity-0" : "absolute inset-0"} role="application" aria-label="Interactive 3D map. Drag to pan, scroll to zoom, right-drag to rotate. Sites are listed as buttons on the map and in the list view." />
      <div className="pointer-events-none absolute inset-0">
        {sites.map((s) => (
          <SiteLabel
            key={s.id}
            ref={(el) => {
              labels.current[s.id] = el;
            }}
            site={s}
            view={view}
            selected={selected === s.id}
            dimmed={!!selected && selected !== s.id}
            onSelect={() => onSelect(selected === s.id ? null : s.id)}
            onHover={(on) => setHover(on ? s.id : null)}
          />
        ))}
      </div>
      {hovered && <HoverCard site={hovered} labelEl={labels.current[hovered.id]} />}
      {source !== "remote" && (
        <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-line bg-surface/90 px-3 py-1 text-2xs text-ink-3">
          {source === "local" ? "Offline map: bundled Basel tiles" : "Map tiles unavailable: sites shown on a blank grid"}
        </p>
      )}
    </div>
  );
});

