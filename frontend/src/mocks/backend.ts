/**
 * Mock mode "backend": starts from real captured responses (fixtures/rest.json, `pnpm capture`) and replays
 * real recorded WebSocket messages (fixtures/replay.json), one slot per `slotSeconds`. The recording is one
 * simulated day; it loops with times shifted by a day, so the clock keeps moving forward.
 * MSW handlers read this state, so REST and socket agree while nothing runs on a server.
 */
import type { Alert, Job, Scheduler, Server, Site, Task, WsMessage } from "@/api/types";

type Rest = Record<string, unknown>;
type Replay = { recordedFrom: string; slots: number; roles: Record<string, { channels: string[]; messages: WsMessage[] }> };

const DAY = 86400000;
type Listener = (msgs: WsMessage[]) => void;

/** shift an ISO time that carries an offset ("…+02:00") by ms, keeping the offset text */
function shiftIso(s: string, ms: number) {
  if (!ms) return s;
  const m = /([+-]\d\d):(\d\d)$/.exec(s);
  const off = m ? (Number(m[1]) * 60 + Math.sign(Number(m[1]) || 1) * Number(m[2])) * 60000 : 0;
  const local = new Date(Date.parse(s) + ms + off).toISOString().slice(0, 19);
  return m ? `${local}${m[0]}` : new Date(Date.parse(s) + ms).toISOString();
}
const TIME_FIELDS = ["time", "currentTime", "submittedAt", "deadline", "estimatedFinish", "finished"];

class MockBackend {
  rest: Rest = {};
  private groups: WsMessage[][] = [];
  private idx = 0;
  private loop = 0;
  private dayOffset = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();
  ready: Promise<void>;

  clock!: Scheduler;
  sites = new Map<string, Site>();
  servers = new Map<string, Server>();
  tasks = new Map<string, Task>();
  jobs = new Map<string, Job>();
  alerts: Alert[] = [];
  kpiToday: Record<string, number> = {};
  todayYmd = "";
  hostBackup: Record<string, number> = {};
  apiKeys: { id: string; name: string; prefix: string; key?: string; createdAt: string }[] = [];
  pricing: Record<string, unknown> = {};
  simulations: { id: string; algorithm: string; status: string; startedAt: string; summary?: unknown }[] = [];

  constructor() {
    this.ready = this.load();
  }

  private async load() {
    const [rest, replay] = await Promise.all([import("./fixtures/rest.json"), import("./fixtures/replay.json")]);
    this.rest = rest.default as Rest;
    const rp = replay.default as unknown as Replay;
    this.clock = { ...(this.rest["GET /admin/scheduler"] as Scheduler), slotSeconds: 5, paused: false, mode: "live" };
    (this.rest["GET /admin/sites"] as Site[]).forEach((s) => this.sites.set(s.id, { ...s }));
    (this.rest["GET /admin/servers"] as Server[]).forEach((s) => this.servers.set(s.id, { ...s }));
    for (const [k, v] of Object.entries(this.rest)) {
      if (/^GET \/admin\/tasks\?/.test(k)) (v as { items: Task[] }).items.forEach((t) => this.tasks.set(t.id, { ...t }));
      if (/^GET \/admin\/jobs\?/.test(k)) (v as { items: Job[] }).items.forEach((j) => this.jobs.set(j.id, { ...j }));
      if (/^GET \/customer\/jobs\?/.test(k)) (v as { items: Job[] }).items.forEach((j) => this.jobs.set(j.id, { ...j }));
    }
    for (const [k, v] of Object.entries(this.rest)) if (/^GET \/admin\/tasks\/[^?/]+$/.test(k)) this.tasks.set((v as Task).id, { ...(v as Task) });
    this.alerts = ((this.rest["GET /admin/events?limit=100"] as { items: Alert[] })?.items ?? []).map((a) => ({ ...a }));
    this.pricing = { ...(this.rest["GET /admin/settings/pricing"] as object) };
    const todayKey = Object.keys(this.rest).find((k) => /^GET \/admin\/kpis\?from=[^&]+$/.test(k));
    this.kpiToday = { ...((todayKey ? this.rest[todayKey] : {}) as Record<string, number>) };
    this.todayYmd = this.clock.currentTime.slice(0, 10);

    // one group per slot, each starting at a clock.tick
    const all = [...rp.roles.admin.messages, ...(rp.roles.acme?.messages ?? []).map((m) => ({ ...m, channel: "customer" }))];
    all.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.type === "clock.tick" ? -1 : b.type === "clock.tick" ? 1 : 0));
    for (const m of all) {
      if (m.type === "clock.tick" || !this.groups.length) this.groups.push([]);
      this.groups[this.groups.length - 1].push(m);
    }
    this.schedule();
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    if (this.clock.paused) return;
    this.timer = setTimeout(() => this.tick(), this.clock.slotSeconds * 1000);
  }

  private shift(m: WsMessage): WsMessage {
    const ms = this.loop * DAY + this.dayOffset * DAY;
    const data = { ...m.data } as Record<string, unknown>;
    for (const f of TIME_FIELDS) if (typeof data[f] === "string") data[f] = shiftIso(data[f] as string, ms);
    if (typeof data.slot === "number") data.slot = (data.slot as number) + (this.loop + this.dayOffset) * this.groups.length;
    return { ...m, time: shiftIso(m.time, ms), data };
  }

  tick() {
    if (!this.groups.length) return;
    const msgs = this.groups[this.idx].map((m) => this.shift(m));
    this.idx += 1;
    if (this.idx >= this.groups.length) {
      this.idx = 0;
      this.loop += 1;
    }
    msgs.forEach((m) => this.apply(m));
    this.listeners.forEach((f) => f(msgs));
    this.schedule();
  }

  /** keep REST answers in step with what the socket just said */
  private apply(m: WsMessage) {
    const d = m.data as Record<string, unknown>;
    if (m.type === "clock.tick") {
      this.clock = { ...this.clock, ...(d as Partial<Scheduler>), slotSeconds: this.clock.slotSeconds, paused: this.clock.paused, mode: this.clock.mode === "jumping" ? "live" : this.clock.mode };
      const ymd = this.clock.currentTime.slice(0, 10);
      if (ymd !== this.todayYmd) {
        this.todayYmd = ymd;
        this.kpiToday = {};
        this.hostBackup = {};
      }
    } else if (m.type === "slot.tick") {
      const s = this.sites.get(d.siteId as string);
      if (s) this.sites.set(s.id, { ...s, ...(d as object), id: s.id } as Site);
      this.hostBackup[d.siteId as string] = (this.hostBackup[d.siteId as string] ?? 0) + Number(d.unmetKwh ?? 0);
    } else if (m.type === "kpi.update") {
      for (const [k, v] of Object.entries(d)) if (typeof v === "number" && /Kwh|Chf|H$|Sold/.test(k)) this.kpiToday[k] = (this.kpiToday[k] ?? 0) + v;
      const k = this.kpiToday;
      k.coveragePct = k.demandKwh ? (100 * k.deliveredKwh) / k.demandKwh : 100;
      k.tasksRunning = Number(d.tasksRunning ?? k.tasksRunning ?? 0);
      k.utilisationPct = Number(d.utilisationPct ?? k.utilisationPct ?? 0);
      k.breakEvenChfPerServerHour = k.serverHoursSold ? ((k.electricityCostChf ?? 0) - (k.heatValueChf ?? 0)) / k.serverHoursSold : 0;
    } else if (m.type === "server.status") {
      this.servers.set(d.id as string, d as unknown as Server);
    } else if (m.type === "alert.raised") {
      if (!this.alerts.some((a) => a.id === d.id)) this.alerts.unshift(d as unknown as Alert);
    } else if (m.type === "job.update") {
      this.jobs.set(d.id as string, d as unknown as Job);
    } else if (m.type.startsWith("task.")) {
      const t = this.tasks.get(d.taskId as string);
      if (!t) return;
      const kind = d.kind as string;
      const state = { started: "running", resumed: "running", migrated: "running", paused: "paused", completed: "done", missed: "missed", cancelled: "cancelled", ready: "ready" }[kind];
      const server = (d.toServer as string | null) ?? t.serverId;
      this.tasks.set(t.id, {
        ...t,
        state: (state ?? t.state) as Task["state"],
        serverId: server,
        siteId: server ? (this.servers.get(server)?.siteId ?? t.siteId) : t.siteId,
        progressPct: kind === "completed" ? 100 : t.progressPct,
        finished: kind === "completed" ? (d.time as string) : t.finished,
        events: [...(t.events ?? []), { time: d.time as string, kind, fromServerId: (d.fromServer as string) ?? null, toServerId: (d.toServer as string) ?? null }],
      });
    }
  }

  setScheduler(p: Partial<Scheduler>) {
    this.clock = { ...this.clock, ...p, mode: p.paused === undefined ? this.clock.mode : p.paused ? "paused" : "live" };
    this.schedule();
  }

  jump(to: string) {
    const days = Math.ceil((Date.parse(to) - Date.parse(this.clock.currentTime)) / DAY);
    if (days <= 0) return false;
    this.clock = { ...this.clock, mode: "jumping", jumpTarget: to };
    setTimeout(() => {
      this.dayOffset += days;
      this.clock = { ...this.clock, mode: this.clock.paused ? "paused" : "live", jumpTarget: null };
      this.tick();
    }, 1800);
    return true;
  }

  reset() {
    this.idx = 0;
    this.loop = 0;
    this.dayOffset = 0;
    this.clock = { ...(this.rest["GET /admin/scheduler"] as Scheduler), slotSeconds: this.clock.slotSeconds, paused: false, mode: "live", slot: 0 };
    this.tick();
  }
}

let instance: MockBackend | null = null;
export const mockBackend = () => (instance ??= new MockBackend());
