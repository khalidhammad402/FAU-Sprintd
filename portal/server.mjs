/**
 * DigitalHeat portal: one address on the local network for the pitch deck, the live dashboard and the walkthrough video.
 *
 *   node portal/server.mjs            (from the repo root, or `pnpm portal` in frontend/)
 *
 *   /            portal page with a QR code of its own LAN address
 *   /deck/       the pitch deck (static files from DH_DECK, default ../pitch-deck next to this repo)
 *   /dashboard   redirect to the dashboard on the same host (port DH_DASH_PORT, default 5173, started with `pnpm lan`)
 *   /video       the walkthrough video (docs/media), with range requests so phones can seek
 *   /info.json   LAN addresses and what is available; the deck reads it to draw its QR slide
 *
 * No dependencies: Node 18+ only.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const PORT = Number(process.env.DH_PORTAL_PORT ?? 8080);
const DASH_PORT = Number(process.env.DH_DASH_PORT ?? 5173);
const PUBLIC = join(HERE, "public");
const DECK = resolve(process.env.DH_DECK ?? join(REPO, "..", "pitch-deck"));
const VIDEO = join(REPO, "docs", "media", "DigitalHeat_walkthrough.mp4");
const THUMB = join(REPO, "docs", "media", "walkthrough-thumbnail.jpg");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

/** IPv4 addresses other devices can reach. Virtual adapters (WSL, Hyper-V, VirtualBox, VMware, Docker) go last. */
function lanAddresses() {
  const virtual = /vethernet|virtualbox|vmware|wsl|docker|hyper-v|loopback|tailscale|zerotier/i;
  const out = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      out.push({ name, address: a.address, virtual: virtual.test(name) });
    }
  }
  return out.sort((a, b) => Number(a.virtual) - Number(b.virtual));
}

function send(res, status, body, type = "text/plain; charset=utf-8", extra = {}) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache", ...extra });
  res.end(body);
}

/** Streams a file; honours Range so video seeking works on phones. */
function sendFile(req, res, file) {
  let st;
  try {
    st = statSync(file);
  } catch {
    return send(res, 404, "Not found");
  }
  if (st.isDirectory()) return send(res, 404, "Not found");
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const head = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, st.size - 1);
    if (start > end) return send(res, 416, "Range not satisfiable", undefined, { "Content-Range": `bytes */${st.size}` });
    res.writeHead(206, { ...head, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
    if (req.method === "HEAD") return res.end();
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...head, "Content-Length": st.size });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

/** Resolves a URL path inside a root folder; null if it tries to leave it. */
function inside(root, urlPath) {
  let p;
  try {
    p = normalize(join(root, decodeURIComponent(urlPath)));
  } catch {
    return null;
  }
  return p === root || p.startsWith(root + sep) ? p : null;
}

function hostOf(req) {
  const h = req.headers.host ?? `localhost:${PORT}`;
  return h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0];
}

const server = createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
  const url = new URL(req.url ?? "/", "http://x");
  const path = url.pathname;

  if (path === "/info.json") {
    const info = {
      port: PORT,
      dashboardPort: DASH_PORT,
      lan: lanAddresses(),
      deck: existsSync(join(DECK, "index.html")),
      video: existsSync(VIDEO),
    };
    // the deck may be opened from its own server (port 8765) and still wants the portal address for its QR slide
    return send(res, 200, JSON.stringify(info), TYPES[".json"], { "Access-Control-Allow-Origin": "*" });
  }
  if (path === "/dashboard" || path === "/dashboard/") {
    return send(res, 302, "", undefined, { Location: `http://${hostOf(req)}:${DASH_PORT}/login` });
  }
  if (path === "/deck") return send(res, 301, "", undefined, { Location: "/deck/" });
  if (path.startsWith("/deck/")) {
    const file = inside(DECK, path.endsWith("/") ? `${path.slice(5)}index.html` : path.slice(5));
    return file ? sendFile(req, res, file) : send(res, 403, "Forbidden");
  }
  if (path === "/video") return sendFile(req, res, VIDEO);
  if (path === "/video/thumbnail.jpg") return sendFile(req, res, THUMB);

  const file = inside(PUBLIC, path === "/" ? "/index.html" : path);
  return file ? sendFile(req, res, file) : send(res, 403, "Forbidden");
});

server.listen(PORT, "0.0.0.0", () => {
  const lan = lanAddresses();
  console.log("DigitalHeat portal");
  console.log(`  this laptop   http://localhost:${PORT}/`);
  for (const a of lan) console.log(`  network       http://${a.address}:${PORT}/   (${a.name}${a.virtual ? ", virtual adapter" : ""})`);
  console.log(`  deck          ${existsSync(join(DECK, "index.html")) ? DECK : `not found at ${DECK} (set DH_DECK)`}`);
  console.log(`  dashboard     port ${DASH_PORT} on the same host (start it with \`pnpm lan\` in frontend/)`);
});
server.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `Port ${PORT} is in use. Set DH_PORTAL_PORT to another port.` : e);
  process.exit(1);
});
