/**
 * MSW handlers for mock mode. Every answer is a real captured response or is derived from the replay
 * (src/mocks/backend.ts). Unknown routes answer 404 with the backend's error envelope.
 */
import { http, HttpResponse, type HttpHandler, type JsonBodyType } from "msw";
import type { Job, Site, Task } from "@/api/types";
import { mockBackend } from "./backend";

const API = "*/api/v1";
const USERS: Record<string, { role: string; name: string; sites?: string[] }> = {
  admin: { role: "admin", name: "DigitalHeat Admin" },
  acme: { role: "customer", name: "ACME AI" },
  globex: { role: "customer", name: "Globex" },
  h1owner: { role: "site_owner", name: "Hallenbad Gundeli", sites: ["H1"] },
  h2owner: { role: "site_owner", name: "Wohnblock Matthäus", sites: ["H2"] },
  farm1owner: { role: "site_owner", name: "Hof Schönbühl", sites: ["FARM1"] },
  hotel1owner: { role: "site_owner", name: "Hotel Rheinufer", sites: ["HOTEL1"] },
  hotel2owner: { role: "site_owner", name: "Messehotel Rosental", sites: ["HOTEL2"] },
  hotelgroup: { role: "site_owner", name: "Hotel group", sites: ["HOTEL1", "HOTEL2"] },
};

const err = (status: number, code: string, message: string) => HttpResponse.json({ error: { code, message } }, { status });
const who = (req: Request) => (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
const page = <T,>(items: T[], url: URL) => {
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const start = Number(url.searchParams.get("cursor") ?? 0);
  const slice = items.slice(start, start + limit);
  return { items: slice, nextCursor: start + limit < items.length ? String(start + limit) : null, total: items.length };
};
const be = mockBackend;
const fixture = (key: string) => be().rest[key] as JsonBodyType | undefined;
/** exact fixture for this request, else the first fixture with the same path */
function lookup(url: URL, method = "GET"): JsonBodyType | undefined {
  const path = url.pathname.replace(/^.*\/api\/v1/, "");
  const exact = fixture(`${method} ${path}${url.search}`);
  if (exact !== undefined) return exact;
  const key = Object.keys(be().rest).find((k) => k === `${method} ${path}` || k.startsWith(`${method} ${path}?`));
  return key ? (be().rest[key] as JsonBodyType) : undefined;
}

function siteToday(id: string, s: Site) {
  return { ...s, today: fixture(`GET /admin/kpis?scope=site&siteId=${id}`) ?? {} };
}

export const handlers: HttpHandler[] = [
  http.all(`${API}/*`, async () => {
    await be().ready;
  }),
  http.post(`${API}/auth/login`, async ({ request }) => {
    const b = (await request.json()) as { username?: string; password?: string };
    const u = USERS[b.username ?? ""];
    if (!u || b.password !== "demo") return err(401, "unauthorized", "Wrong user name or password");
    return HttpResponse.json({ token: b.username, user: { id: b.username, role: u.role, name: u.name } });
  }),
  http.all(`${API}/*`, ({ request }) => {
    const path = new URL(request.url).pathname;
    if (/\/(auth\/login|health|meta)$/.test(path)) return;
    if (!USERS[who(request)]) return err(401, "unauthorized", "login required: send Authorization: Bearer <token>");
  }),
  http.get(`${API}/auth/me`, ({ request }) => {
    const id = who(request);
    return HttpResponse.json({ id, role: USERS[id].role, name: USERS[id].name });
  }),

  /* ---------- operator ---------- */
  http.get(`${API}/admin/scheduler`, () => HttpResponse.json(be().clock)),
  http.put(`${API}/admin/scheduler`, async ({ request }) => {
    be().setScheduler((await request.json()) as object);
    return HttpResponse.json(be().clock);
  }),
  http.post(`${API}/admin/scheduler/jump`, async ({ request }) => {
    const b = (await request.json()) as { to?: string };
    if (!b.to || !be().jump(b.to)) return err(400, "bad_request", "jump goes forward only");
    return HttpResponse.json(be().clock);
  }),
  http.post(`${API}/admin/scheduler/reset`, () => {
    be().reset();
    return HttpResponse.json(be().clock);
  }),
  http.get(`${API}/admin/sites`, () => HttpResponse.json([...be().sites.values()])),
  http.get(`${API}/admin/map/sites`, () =>
    HttpResponse.json({
      type: "FeatureCollection",
      time: be().clock.currentTime,
      features: [...be().sites.values()].map((s) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: s })),
    }),
  ),
  http.get(`${API}/admin/sites/:id`, ({ params }) => {
    const s = be().sites.get(String(params.id));
    return s ? HttpResponse.json(siteToday(s.id, s)) : err(404, "not_found", `site ${params.id} not found`);
  }),
  http.get(`${API}/admin/servers`, () => HttpResponse.json([...be().servers.values()])),
  http.get(`${API}/admin/servers/:id`, ({ params }) => {
    const s = be().servers.get(String(params.id));
    return s ? HttpResponse.json(s) : err(404, "not_found", `server ${params.id} not found`);
  }),
  http.get(`${API}/admin/kpis`, ({ request }) => {
    const u = new URL(request.url);
    if (u.searchParams.get("siteId")) return HttpResponse.json(lookup(u) ?? {});
    if (u.searchParams.get("from") && !u.searchParams.get("to")) return HttpResponse.json({ ...(fixture("GET /admin/kpis") as object), ...be().kpiToday });
    if (u.searchParams.get("to")) return HttpResponse.json(Object.entries(be().rest).find(([k]) => /^GET \/admin\/kpis\?from=.*&to=/.test(k))?.[1] ?? {});
    return HttpResponse.json(fixture("GET /admin/kpis"));
  }),
  http.get(`${API}/admin/tasks`, ({ request }) => {
    const u = new URL(request.url);
    const q = Object.fromEntries(u.searchParams);
    const items = [...be().tasks.values()].filter(
      (t: Task) => (!q.state || t.state === q.state) && (!q.jobId || t.jobId === q.jobId) && (!q.siteId || t.siteId === q.siteId) && (!q.serverId || t.serverId === q.serverId),
    );
    return HttpResponse.json(page(items, u));
  }),
  http.get(`${API}/admin/tasks/:id`, ({ params }) => {
    const t = be().tasks.get(String(params.id));
    return t ? HttpResponse.json({ events: [], ...t }) : err(404, "not_found", `task ${params.id} not found`);
  }),
  http.post(`${API}/admin/tasks/:id/:action`, ({ params }) => {
    const t = be().tasks.get(String(params.id));
    if (!t) return err(404, "not_found", `task ${params.id} not found`);
    const a = String(params.action);
    if (!["pause", "resume", "cancel"].includes(a)) return err(400, "bad_request", "action must be pause, resume or cancel");
    if (a === "pause" && !t.interruptible) return err(409, "conflict", "task is not interruptible");
    const next = { ...t, hold: a === "pause", state: (a === "pause" ? "paused" : a === "cancel" ? "cancelled" : "ready") as Task["state"] };
    be().tasks.set(t.id, next);
    return HttpResponse.json(next);
  }),
  http.get(`${API}/admin/jobs`, ({ request }) => {
    const u = new URL(request.url);
    const q = Object.fromEntries(u.searchParams);
    const items = [...be().jobs.values()].filter((j: Job) => (!q.status || j.status === q.status) && (!q.customerId || j.customerId === q.customerId) && (!q.priority || j.priority === q.priority));
    return HttpResponse.json(page(items, u));
  }),
  http.get(`${API}/admin/jobs/:id`, ({ params }) => {
    const j = be().jobs.get(String(params.id));
    if (!j) return err(404, "not_found", `job ${params.id} not found`);
    return HttpResponse.json({ ...j, tasks: j.taskIds.map((id) => be().tasks.get(id)).filter(Boolean) });
  }),
  http.get(`${API}/admin/events`, ({ request }) => HttpResponse.json(page(be().alerts, new URL(request.url)))),
  http.patch(`${API}/admin/events/:id`, async ({ params, request }) => {
    const a = be().alerts.find((x) => x.id === Number(params.id));
    if (!a) return err(404, "not_found", `event ${params.id} not found`);
    a.acknowledged = ((await request.json()) as { acknowledged?: boolean }).acknowledged ?? true;
    return HttpResponse.json(a);
  }),
  http.get(`${API}/admin/settings/pricing`, () => HttpResponse.json(be().pricing)),
  http.put(`${API}/admin/settings/pricing`, async ({ request }) => {
    const b = (await request.json()) as Record<string, unknown>;
    const p = be().pricing as Record<string, unknown>;
    Object.assign(p, b);
    if (typeof b.electricityChfPerKwh === "number" || typeof b.heatPumpCop === "number") p.heatValueChfPerKwh = Number(p.electricityChfPerKwh) / Number(p.heatPumpCop);
    return HttpResponse.json(p);
  }),
  http.get(`${API}/admin/simulations`, () => HttpResponse.json(be().simulations)),
  http.post(`${API}/admin/simulations`, async ({ request }) => {
    const b = (await request.json()) as { algorithm?: string };
    const run: { id: string; algorithm: string; status: string; startedAt: string; summary?: unknown } = {
      id: `run-${be().simulations.length + 1}`,
      algorithm: b.algorithm ?? "greedy",
      status: "running",
      startedAt: be().clock.currentTime,
    };
    be().simulations.unshift(run);
    setTimeout(() => {
      run.status = "done";
      run.summary = (fixture(`GET /admin/results?algorithm=${run.algorithm}`) as { fleet?: unknown })?.fleet;
    }, 6000);
    return HttpResponse.json(run);
  }),

  /* ---------- compute buyer ---------- */
  http.get(`${API}/customer/jobs`, ({ request }) => {
    const u = new URL(request.url);
    const status = u.searchParams.get("status");
    const items = [...be().jobs.values()].filter((j) => j.customerId === who(request) && (!status || j.status === status));
    return HttpResponse.json(page(items, u));
  }),
  http.post(`${API}/customer/jobs`, async ({ request }) => {
    const b = (await request.json()) as { name?: string; priority?: string; deadlineInMin?: number; deadline?: string; tasks: { taskId?: string; runtimeMin: number }[] };
    if (!b.tasks?.length) return HttpResponse.json({ error: { code: "validation_error", message: "invalid request: tasks: List should have at least 1 item", details: [{ field: "tasks", message: "List should have at least 1 item" }] } }, { status: 422 });
    const now = be().clock.currentTime;
    const id = `J${90000 + be().jobs.size}-mock`;
    const job: Job = {
      id,
      customerId: who(request),
      name: b.name ?? "Job",
      priority: b.priority ?? "normal",
      status: "queued",
      submittedAt: now,
      deadline: b.deadline ?? new Date(Date.parse(now) + (b.deadlineInMin ?? 600) * 60000).toISOString(),
      estimatedFinish: new Date(Date.parse(now) + Math.max(...b.tasks.map((t) => t.runtimeMin)) * 60000).toISOString(),
      progressPct: 0,
      costChf: 0,
      taskIds: b.tasks.map((t, i) => `${id}-${t.taskId ?? `T${i + 1}`}`),
    };
    be().jobs.set(id, job);
    return HttpResponse.json(job);
  }),
  http.post(`${API}/customer/jobs/:id/cancel`, ({ params }) => {
    const j = be().jobs.get(String(params.id));
    if (!j) return err(404, "not_found", `job ${params.id} not found`);
    const next = { ...j, status: "cancelled" as const };
    be().jobs.set(j.id, next);
    return HttpResponse.json(next);
  }),
  http.get(`${API}/customer/jobs/:id`, ({ params, request }) => {
    const j = be().jobs.get(String(params.id));
    if (!j || j.customerId !== who(request)) return err(404, "not_found", `job ${params.id} not found`);
    return HttpResponse.json({ ...j, tasks: j.taskIds.map((id) => be().tasks.get(id)).filter(Boolean) });
  }),
  http.get(`${API}/customer/jobs/:id/tasks`, ({ params, request }) => {
    const u = new URL(request.url);
    const fix = lookup(u);
    if (fix) return HttpResponse.json(fix);
    const j = be().jobs.get(String(params.id));
    return HttpResponse.json(j ? j.taskIds.map((id) => be().tasks.get(id)).filter(Boolean) : []);
  }),
  http.get(`${API}/customer/api-keys`, () => HttpResponse.json(be().apiKeys.map(({ key: _key, ...k }) => k))),
  http.post(`${API}/customer/api-keys`, () => {
    const secret = `dh_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
    const k = { id: `key_${be().apiKeys.length + 1}`, name: "API key", prefix: secret.slice(0, 7), key: secret, createdAt: be().clock.currentTime };
    be().apiKeys.push(k);
    return HttpResponse.json(k);
  }),
  http.delete(`${API}/customer/api-keys/:id`, ({ params }) => {
    be().apiKeys = be().apiKeys.filter((k) => k.id !== params.id);
    return HttpResponse.json({ deleted: params.id });
  }),

  /* ---------- host (backend role site_owner) ---------- */
  http.get(`${API}/site/sites`, ({ request }) =>
    HttpResponse.json((USERS[who(request)].sites ?? []).map((id) => be().sites.get(id)).filter(Boolean).map((s) => ({ id: s!.id, name: s!.name, type: s!.type }))),
  ),
  http.get(`${API}/site/sites/:id/overview`, ({ params, request }) => {
    const id = String(params.id);
    if (!(USERS[who(request)].sites ?? []).includes(id)) return err(403, "forbidden", "not your site");
    const s = be().sites.get(id)!;
    const base = (fixture(`GET /site/sites/${id}/overview`) ?? fixture("GET /site/sites/H1/overview")) as Record<string, unknown>;
    const backup = be().hostBackup[id] ?? 0;
    return HttpResponse.json({
      ...base,
      tankKwh: s.tankKwh,
      tankCapacityKwh: s.tankCapacityKwh,
      serversWorking: s.serversRunning,
      serversTotal: s.serversTotal,
      backupHeatTodayKwh: Number(base.backupHeatTodayKwh ?? 0) + backup,
      statusMessage: backup > 0 ? `Backup heater used ${backup.toFixed(1)} kWh today` : base.statusMessage,
      time: be().clock.currentTime,
    });
  }),
  http.get(`${API}/site/notifications`, ({ request }) => {
    const mine = new Set(USERS[who(request)].sites ?? []);
    const fix = (fixture("GET /site/notifications") as { id: number }[]) ?? [];
    const live = be()
      .alerts.filter((a) => a.siteId && mine.has(a.siteId) && !fix.some((f) => f.id === a.id))
      .map((a) => ({ id: a.id, time: a.time, kind: a.kind, message: a.message, siteId: a.siteId, read: false }));
    return HttpResponse.json([...live, ...fix.filter((n) => mine.has((n as { siteId?: string }).siteId ?? ""))]);
  }),
  http.patch(`${API}/site/notifications/:id`, async ({ params, request }) => {
    const read = ((await request.json()) as { read?: boolean }).read ?? true;
    const list = (fixture("GET /site/notifications") as { id: number; read: boolean }[]) ?? [];
    const n = list.find((x) => x.id === Number(params.id));
    if (n) n.read = read;
    return HttpResponse.json(n ?? { id: Number(params.id), read });
  }),

  /* ---------- everything else: the captured response for this path ---------- */
  http.get(`${API}/*`, ({ request }) => {
    const v = lookup(new URL(request.url));
    return v === undefined ? err(404, "not_found", "no captured response for this request in mock mode") : HttpResponse.json(v);
  }),
];
