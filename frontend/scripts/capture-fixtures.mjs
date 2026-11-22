#!/usr/bin/env node
/**
 * Capture real backend responses and WebSocket messages for mock mode.
 *
 *   DH_MQTT=0 uvicorn api.server:app --port 8000     (in the backend repo)
 *   node scripts/capture-fixtures.mjs [--to 2021-03-03T06:00:00] [--slots 96]
 *
 * Writes src/mocks/fixtures/rest.json (one real response per endpoint, keyed by
 * "METHOD path?query") and src/mocks/fixtures/replay.json (every WebSocket message
 * of N slots, per role). The backend clock is jumped forward, recorded, then paused.
 * Run it against a fresh backend: jumps only go forward.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const BASE = process.env.API ?? "http://localhost:8000/api/v1";
const WS = BASE.replace(/^http/, "ws") + "/ws";
const JUMP_TO = args.to ?? "2021-03-03T06:00:00";
const SLOTS = Number(args.slots ?? 96);
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "mocks", "fixtures");

const tokens = {};
async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return json;
}
// the backend writes Python floats as bare Infinity / NaN, which is not JSON (see docs/FRONTEND_GAPS.md)
const parseLoose = (text) => JSON.parse(text.replace(/(?<=[:[,]\s*)-?(Infinity|NaN)(?=\s*[,}\]])/g, "null"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rest = {};
async function snap(path, role) {
  try {
    rest[`GET ${path}`] = await call("GET", path, tokens[role]);
  } catch (e) {
    console.warn("skip", e.message);
  }
  return rest[`GET ${path}`];
}

async function main() {
  for (const u of ["admin", "acme", "globex", "h1owner", "hotel1owner", "hotelgroup"]) {
    const r = await call("POST", "/auth/login", null, { username: u, password: "demo" });
    tokens[u] = r.token;
    rest[`POST /auth/login#${u}`] = r;
  }

  // 1. move the clock to an interesting moment, then pause it
  await call("PUT", "/admin/scheduler", tokens.admin, { paused: false, slotSeconds: 10 });
  let sch = await call("GET", "/admin/scheduler", tokens.admin);
  if (new Date(sch.currentTime) < new Date(JUMP_TO + "+01:00")) {
    await call("POST", "/admin/scheduler/jump", tokens.admin, { to: JUMP_TO });
    process.stdout.write("jumping");
    do { await sleep(1500); process.stdout.write("."); sch = await call("GET", "/admin/scheduler", tokens.admin); } while (sch.mode === "jumping");
    console.log(" at", sch.currentTime);
  }
  await call("PUT", "/admin/scheduler", tokens.admin, { paused: true });

  // 2. REST snapshot
  await snap("/health"); await snap("/meta");
  for (const u of ["admin", "acme", "h1owner"]) rest[`GET /auth/me#${u}`] = await call("GET", "/auth/me", tokens[u]);
  const sites = await snap("/admin/sites", "admin");
  await snap("/admin/map/sites", "admin");
  await snap("/admin/kpis", "admin");
  const now = (await snap("/admin/scheduler", "admin")).currentTime;
  const dayAgo = new Date(new Date(now).getTime() - 24 * 3600e3).toISOString();
  const fortnight = new Date(new Date(now).getTime() - 14 * 24 * 3600e3).toISOString();
  // "today so far" and the same window yesterday: the KPI strip compares the two (no invented trends)
  const todayStart = now.slice(0, 10) + "T00:00:00" + now.slice(19);
  const yStart = new Date(new Date(todayStart).getTime() - 24 * 3600e3).toISOString();
  await snap(`/admin/kpis?from=${encodeURIComponent(todayStart)}`, "admin");
  await snap(`/admin/kpis?from=${encodeURIComponent(yStart)}&to=${encodeURIComponent(dayAgo)}`, "admin");
  for (const s of sites) await snap(`/admin/sites/${s.id}/timeline?resolution=1h&from=${encodeURIComponent(yStart)}`, "admin");
  for (const s of sites) {
    await snap(`/admin/kpis?scope=site&siteId=${s.id}`, "admin");
    await snap(`/admin/sites/${s.id}`, "admin");
    await snap(`/admin/sites/${s.id}/servers`, "admin");
    await snap(`/admin/sites/${s.id}/timeline?resolution=15m&from=${encodeURIComponent(dayAgo)}`, "admin");
    await snap(`/admin/sites/${s.id}/timeline?resolution=1d&from=${encodeURIComponent(fortnight)}`, "admin");
    await snap(`/admin/results/timeline?siteId=${s.id}&resolution=1mo`, "admin");
  }
  const servers = await snap("/admin/servers", "admin");
  for (const s of servers) {
    await snap(`/admin/servers/${s.id}`, "admin");
    await snap(`/admin/servers/${s.id}/timeline?resolution=1h&from=${encodeURIComponent(dayAgo)}`, "admin");
  }
  for (const st of ["running", "paused", "ready", "waiting", "done", "missed"]) await snap(`/admin/tasks?state=${st}&limit=200`, "admin");
  await snap("/admin/tasks?limit=50", "admin");
  const running = rest["GET /admin/tasks?state=running&limit=200"]?.items ?? [];
  const done = rest["GET /admin/tasks?state=done&limit=200"]?.items ?? [];
  const sampleTasks = [...running.slice(0, 40), ...done.slice(-20)];
  for (const t of sampleTasks) await snap(`/admin/tasks/${t.id}`, "admin");
  const jobIds = [...new Set(sampleTasks.map((t) => t.jobId))];
  for (const id of jobIds) await snap(`/admin/jobs/${id}`, "admin");
  for (const st of ["running", "queued", "done", "missed"]) await snap(`/admin/jobs?status=${st}&limit=100`, "admin");
  await snap("/admin/jobs?limit=50", "admin");
  await snap("/admin/task-types", "admin");
  const customers = await snap("/admin/customers", "admin");
  for (const c of customers ?? []) await snap(`/admin/customers/${c.id}`, "admin");
  await snap("/admin/live/agents", "admin");
  await snap("/admin/results?algorithm=greedy", "admin");
  await snap("/admin/results?algorithm=mpc", "admin");
  await snap("/admin/assumptions", "admin");
  await snap("/admin/datasets", "admin");
  await snap("/admin/simulations", "admin");
  await snap("/admin/events?limit=100", "admin");
  await snap("/admin/settings/pricing", "admin");

  for (const st of ["", "?status=running", "?status=queued", "?status=done"]) await snap(`/customer/jobs${st}${st ? "&" : "?"}limit=100`, "acme");
  await snap("/customer/overview", "acme");
  const myJobs = [...(rest["GET /customer/jobs?status=running&limit=100"]?.items ?? []), ...(rest["GET /customer/jobs?status=done&limit=100"]?.items ?? []).slice(-10)];
  for (const j of myJobs.slice(0, 30)) {
    await snap(`/customer/jobs/${j.id}`, "acme");
    await snap(`/customer/jobs/${j.id}/tasks`, "acme");
    await snap(`/customer/jobs/${j.id}/results`, "acme");
  }
  for (const p of ["usage", "invoices", "impact", "api-keys"]) await snap(`/customer/${p}`, "acme");

  await snap("/site/sites", "h1owner");
  await snap("/site/sites/H1/overview", "h1owner");
  for (const p of ["day", "week", "month", "year"]) await snap(`/site/sites/H1/energy?period=${p}`, "h1owner");
  await snap("/site/sites/H1/savings", "h1owner");
  await snap("/site/sites/H1/servers", "h1owner");
  await snap("/site/notifications", "h1owner");
  await snap("/site/sites", "hotelgroup");

  // 3. record WebSocket messages for N slots
  const replay = { recordedFrom: now, slots: SLOTS, roles: {} };
  const subs = {
    admin: ["fleet", ...sites.map((s) => `site:${s.id}`), ...servers.slice(0, 3).map((s) => `server:${s.id}`)],
    acme: ["customer"],
    h1owner: ["site-owner:H1"],
  };
  const sockets = Object.entries(subs).map(([role, channels]) => new Promise((resolve) => {
    const ws = new WebSocket(`${WS}?token=${tokens[role]}`);
    replay.roles[role] = { channels, messages: [] };
    ws.onopen = () => ws.send(JSON.stringify({ action: "subscribe", channels }));
    ws.onmessage = (ev) => { const m = parseLoose(ev.data); if (m.channel) replay.roles[role].messages.push(m); else if (m.type === "subscribed") resolve(ws); };
  }));
  const open = await Promise.all(sockets);
  await call("PUT", "/admin/scheduler", tokens.admin, { slotSeconds: 0.35, paused: false });
  process.stdout.write("recording");
  let ticks = 0;
  while (ticks < SLOTS) { await sleep(700); ticks = replay.roles.admin.messages.filter((m) => m.type === "clock.tick").length; process.stdout.write("."); }
  await call("PUT", "/admin/scheduler", tokens.admin, { paused: true, slotSeconds: 10 });
  await sleep(800);
  open.forEach((ws) => ws.close());
  console.log(" done:", Object.fromEntries(Object.entries(replay.roles).map(([r, v]) => [r, v.messages.length])));

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "rest.json"), JSON.stringify(rest));
  await writeFile(join(OUT, "replay.json"), JSON.stringify(replay));
  console.log("wrote", Object.keys(rest).length, "REST fixtures to", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
