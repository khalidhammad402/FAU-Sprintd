/**
 * Basemap style for the fleet map: real OpenStreetMap vector tiles (OpenMapTiles schema) drawn in the
 * DigitalHeat palette, with real building heights extruded in 3D. Two sources:
 *   remote = OpenFreeMap (no key), local = the Basel tiles bundled in public/basemap (offline demo).
 * Map data © OpenStreetMap contributors.
 */
import type { StyleSpecification } from "maplibre-gl";
import type { Theme } from "@/app/theme";

export type TileSource = "remote" | "local";

const PALETTE = {
  dark: {
    bg: "#0A1524",
    land: "#0C1829",
    park: "#0D1D22",
    water: "#0F2843",
    waterLine: "#16365A",
    road: ["#33445E", "#2A3A52", "#223147", "#1B283B", "#16222F"],
    casing: "#0A1524",
    rail: "#2C3B53",
    building: "#15243A",
    buildingTop: 0.94,
    label: "#71839C",
    labelStrong: "#9AAAC0",
    halo: "#0A1524",
    waterLabel: "#4D78A8",
  },
  light: {
    bg: "#EEF1F5",
    land: "#ECEFF3",
    park: "#DFEBE1",
    water: "#C4D8EE",
    waterLine: "#A9C6E6",
    road: ["#FFFFFF", "#FFFFFF", "#FBFCFD", "#F6F8FA", "#F2F4F7"],
    casing: "#D5DCE5",
    rail: "#BAC4D1",
    building: "#D9DFE7",
    buildingTop: 0.9,
    label: "#6A788C",
    labelStrong: "#4B586B",
    halo: "#F4F6F9",
    waterLabel: "#4F7AAE",
  },
};

export function buildStyle(theme: Theme, source: TileSource): StyleSpecification {
  const c = PALETTE[theme];
  const local = source === "local";
  const origin = typeof location !== "undefined" ? location.origin : "";
  return {
    version: 8,
    name: `digitalheat-${theme}-${source}`,
    glyphs: local ? `${origin}/basemap/fonts/{fontstack}/{range}.pbf` : "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      osm: local
        ? { type: "vector", url: `${origin}/basemap/tiles.json`, attribution: "© OpenStreetMap contributors" }
        : { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © OpenStreetMap contributors' },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": c.bg } },
      { id: "landuse", type: "fill", source: "osm", "source-layer": "landuse", paint: { "fill-color": c.land, "fill-opacity": 0.8 } },
      {
        id: "park",
        type: "fill",
        source: "osm",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["grass", "wood", "farmland"]]],
        paint: { "fill-color": c.park, "fill-opacity": 0.85 },
      },
      { id: "park2", type: "fill", source: "osm", "source-layer": "park", paint: { "fill-color": c.park } },
      { id: "water", type: "fill", source: "osm", "source-layer": "water", paint: { "fill-color": c.water } },
      {
        id: "waterway",
        type: "line",
        source: "osm",
        "source-layer": "waterway",
        paint: { "line-color": c.waterLine, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 16, 3] },
      },
      ...roads(c),
      {
        id: "rail",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        filter: ["==", ["get", "class"], "rail"],
        paint: { "line-color": c.rail, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 16, 1.6], "line-dasharray": [3, 2] },
      },
      {
        id: "buildings-3d",
        type: "fill-extrusion",
        source: "osm",
        "source-layer": "building",
        minzoom: 12,
        paint: {
          "fill-extrusion-color": c.building,
          "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 12, 0, 12.6, ["coalesce", ["get", "render_height"], 8]],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": c.buildingTop,
          "fill-extrusion-vertical-gradient": true,
        },
      },
      {
        id: "water-name",
        type: "symbol",
        source: "osm",
        "source-layer": "water_name",
        layout: { "text-field": ["coalesce", ["get", "name:de"], ["get", "name"]], "text-font": ["Noto Sans Italic"], "text-size": 13, "symbol-placement": "line", "text-letter-spacing": 0.2 },
        paint: { "text-color": c.waterLabel, "text-halo-color": c.halo, "text-halo-width": 1 },
      },
      {
        id: "waterway-name",
        type: "symbol",
        source: "osm",
        "source-layer": "waterway",
        filter: ["==", ["get", "class"], "river"],
        layout: { "text-field": ["coalesce", ["get", "name:de"], ["get", "name"]], "text-font": ["Noto Sans Italic"], "text-size": 13, "symbol-placement": "line", "text-letter-spacing": 0.25 },
        paint: { "text-color": c.waterLabel, "text-halo-color": c.halo, "text-halo-width": 1 },
      },
      {
        id: "place-quarter",
        type: "symbol",
        source: "osm",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["suburb", "quarter", "neighbourhood"]]],
        minzoom: 13.2,
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11.5, "text-max-width": 8 },
        paint: { "text-color": c.label, "text-halo-color": c.halo, "text-halo-width": 1.2, "text-opacity": 0.85 },
      },
      {
        id: "place-town",
        type: "symbol",
        source: "osm",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
        maxzoom: 14,
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 10, 12, 14, 15] },
        paint: { "text-color": c.labelStrong, "text-halo-color": c.halo, "text-halo-width": 1.4 },
      },
    ],
  } as StyleSpecification;
}

function roads(c: (typeof PALETTE)["dark"]) {
  const classes: [string, string[], number, number][] = [
    ["motorway", ["motorway", "trunk"], 0, 2.4],
    ["primary", ["primary"], 1, 2],
    ["secondary", ["secondary", "tertiary"], 2, 1.5],
    ["minor", ["minor", "residential", "unclassified"], 3, 1],
    ["service", ["service", "track"], 4, 0.6],
  ];
  return classes.flatMap(([id, cls, i, w]) => [
    {
      id: `road-${id}-casing`,
      type: "line" as const,
      source: "osm",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", cls]],
      minzoom: i > 2 ? 13 : 10,
      layout: { "line-cap": "round" as const, "line-join": "round" as const },
      paint: { "line-color": c.casing, "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 11, w * 0.6 + 1, 17, w * 7 + 2] },
    },
    {
      id: `road-${id}`,
      type: "line" as const,
      source: "osm",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", cls]],
      minzoom: i > 2 ? 13 : 10,
      layout: { "line-cap": "round" as const, "line-join": "round" as const },
      paint: { "line-color": c.road[i], "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 11, w * 0.6, 17, w * 7] },
    },
  ]);
}
