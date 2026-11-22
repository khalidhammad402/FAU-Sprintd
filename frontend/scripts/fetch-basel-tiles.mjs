#!/usr/bin/env node
/**
 * Download the OpenStreetMap vector tiles (OpenFreeMap, OpenMapTiles schema) and the label glyphs that cover
 * Basel-Stadt, so the fleet map works offline on the demo hotspot. Writes public/basemap/.
 * Map data © OpenStreetMap contributors (ODbL), tiles by OpenFreeMap. Re-run to refresh.
 *
 *   node scripts/fetch-basel-tiles.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "basemap");
const BBOX = { w: 7.535, s: 47.515, e: 7.705, n: 47.615 }; // Basel-Stadt incl. Riehen
const ZOOMS = [10, 11, 12, 13, 14];
const FONTS = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"];
const RANGES = ["0-255", "256-511", "8192-8447"];

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);

async function get(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: { "user-agent": "digitalheat-frontend-offline-cache" } });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 404 || r.status === 204) return null;
    await new Promise((res) => setTimeout(res, 800 * (i + 1)));
  }
  throw new Error(`failed ${url}`);
}

const tj = JSON.parse((await get("https://tiles.openfreemap.org/planet")).toString());
const template = tj.tiles[0];
let n = 0,
  bytes = 0;
for (const z of ZOOMS) {
  for (let x = lon2x(BBOX.w, z); x <= lon2x(BBOX.e, z); x++)
    for (let y = lat2y(BBOX.n, z); y <= lat2y(BBOX.s, z); y++) {
      const buf = await get(template.replace("{z}", z).replace("{x}", x).replace("{y}", y));
      if (!buf) continue;
      const p = join(OUT, "tiles", String(z), String(x), `${y}.pbf`);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, buf);
      n++;
      bytes += buf.length;
    }
  process.stdout.write(`z${z} `);
}
for (const f of FONTS)
  for (const r of RANGES) {
    const buf = await get(`https://tiles.openfreemap.org/fonts/${encodeURIComponent(f)}/${r}.pbf`);
    if (!buf) continue;
    const p = join(OUT, "fonts", f, `${r}.pbf`);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, buf);
  }
await writeFile(
  join(OUT, "tiles.json"),
  JSON.stringify({ tilejson: "3.0.0", tiles: ["/basemap/tiles/{z}/{x}/{y}.pbf"], minzoom: 10, maxzoom: 14, bounds: [BBOX.w, BBOX.s, BBOX.e, BBOX.n], attribution: tj.attribution ?? "© OpenStreetMap contributors" }),
);
console.log(`\n${n} tiles, ${(bytes / 1024 / 1024).toFixed(1)} MB, fonts ${FONTS.length * RANGES.length} files -> ${OUT}`);
