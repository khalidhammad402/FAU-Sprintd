/**
 * Live state pushed by the WebSocket. REST loads the initial state (TanStack Query); this store holds what
 * arrives on top: the scheduler clock, the latest reading per site, server status, task events, migrations
 * for map arcs, alerts and per-slot KPIs. Every reducer is idempotent: a repeated event changes nothing.
 */
import { create } from "zustand";
import type { Agent, Alert, Job, Kpis, Scheduler, Server, SiteStatus, SlotReading, WsTaskEvent } from "@/api/types";
import type { ConnInfo } from "./socket";

export type SiteLive = SlotReading & { siteId: string; slot: number; status: SiteStatus; serversRunning: number; serversTotal: number };
export type LiveTaskEvent = WsTaskEvent & { key: string; receivedAt: number };
export type Migration = { key: string; taskId: string; fromSite: string; toSite: string; time: string; receivedAt: number };
export type SlotKpi = Kpis & { time: string };

const CAP_EVENTS = 400;
const CAP_READINGS = 192; // two days of 15-min slots per site

type LiveState = {
  conn: ConnInfo;
  clock: Scheduler | null;
  /** simulated now for roles without the fleet clock (customer, host): derived from message times */
  simNow: string | null;
  sites: Record<string, SiteLive>;
  readings: Record<string, SlotReading[]>;
  servers: Record<string, Server>;
  slotKpis: SlotKpi[];
  events: LiveTaskEvent[];
  migrations: Migration[];
  alerts: Alert[];
  agents: Agent[];
  jobs: Record<string, Job>;
  hostReadings: Record<string, SiteLive>;
  seen: Set<string>;
  /** bumps when a jump or reset finished: screens refetch their REST collections */
  epoch: number;
};

type Actions = {
  setConn: (c: ConnInfo) => void;
  setClock: (c: Scheduler) => void;
  setSimNow: (t: string) => void;
  applySlot: (r: SiteLive, channel: "fleet" | "site" | "host") => void;
  applyServer: (s: Server) => void;
  applyKpi: (k: SlotKpi) => void;
  applyTaskEvent: (e: WsTaskEvent) => boolean;
  applyAlert: (a: Alert) => void;
  seedAlerts: (a: Alert[]) => void;
  ackAlert: (id: number, ack: boolean) => void;
  setAgents: (a: Agent[]) => void;
  applyJob: (j: Job) => void;
  bumpEpoch: () => void;
  reset: () => void;
};

const initial = (): LiveState => ({
  conn: { state: "idle", nextRetryAt: null, attempts: 0, lastMessageAt: null },
  clock: null,
  simNow: null,
  sites: {},
  readings: {},
  servers: {},
  slotKpis: [],
  events: [],
  migrations: [],
  alerts: [],
  agents: [],
  jobs: {},
  hostReadings: {},
  seen: new Set(),
  epoch: 0,
});

export const useLive = create<LiveState & Actions>()((set, get) => ({
  ...initial(),
  setConn: (conn) => set({ conn }),
  setClock: (clock) => set({ clock, simNow: clock.currentTime }),
  setSimNow: (t) => set((s) => (s.simNow && s.simNow >= t ? {} : { simNow: t })),
  applySlot: (r, channel) => {
    const key = `slot:${channel === "host" ? "h" : "f"}:${r.siteId}:${r.slot}`;
    const { seen } = get();
    if (seen.has(key)) return;
    seen.add(key);
    if (channel === "host") return set((s) => ({ hostReadings: { ...s.hostReadings, [r.siteId]: r } }));
    set((s) => {
      const prev = s.readings[r.siteId] ?? [];
      const rows = prev.length && prev[prev.length - 1].time === r.time ? prev : [...prev, r].slice(-CAP_READINGS);
      return { sites: { ...s.sites, [r.siteId]: r }, readings: { ...s.readings, [r.siteId]: rows } };
    });
  },
  applyServer: (srv) => set((s) => ({ servers: { ...s.servers, [srv.id]: srv } })),
  applyKpi: (k) => {
    const key = `kpi:${k.time}`;
    if (get().seen.has(key)) return;
    get().seen.add(key);
    set((s) => ({ slotKpis: [...s.slotKpis, k].slice(-CAP_READINGS) }));
  },
  applyTaskEvent: (e) => {
    const key = `${e.taskId}:${e.kind}:${e.slot}:${e.fromServer ?? ""}:${e.toServer ?? ""}`;
    const { seen } = get();
    if (seen.has(key)) return false;
    seen.add(key);
    const ev: LiveTaskEvent = { ...e, key, receivedAt: Date.now() };
    set((s) => {
      const next: Partial<LiveState> = { events: [ev, ...s.events].slice(0, CAP_EVENTS) };
      if (e.kind === "migrated" && e.fromSite && e.toSite && e.fromSite !== e.toSite) {
        next.migrations = [...s.migrations, { key, taskId: e.taskId, fromSite: e.fromSite, toSite: e.toSite, time: e.time, receivedAt: ev.receivedAt }].slice(-40);
      }
      return next;
    });
    return true;
  },
  applyAlert: (a) =>
    set((s) => (s.alerts.some((x) => x.id === a.id) ? {} : { alerts: [{ ...a, isNew: true } as Alert, ...s.alerts].slice(0, 200) })),
  seedAlerts: (list) =>
    set((s) => {
      const have = new Map(s.alerts.map((a) => [a.id, a]));
      list.forEach((a) => {
        const prev = have.get(a.id);
        have.set(a.id, prev ? { ...a, acknowledged: prev.acknowledged || a.acknowledged } : a);
      });
      return { alerts: [...have.values()].sort((x, y) => y.id - x.id).slice(0, 200) };
    }),
  ackAlert: (id, ack) => set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: ack, isNew: false } : a)) })),
  setAgents: (agents) => set({ agents }),
  applyJob: (j) => set((s) => ({ jobs: { ...s.jobs, [j.id]: j } })),
  bumpEpoch: () => set((s) => ({ epoch: s.epoch + 1, events: [], migrations: [], seen: new Set(), readings: {}, slotKpis: [] })),
  reset: () => set(initial()),
}));

/** The simulated "now". Never the browser clock. */
export const useNow = () => useLive((s) => s.clock?.currentTime ?? s.simNow ?? null);
