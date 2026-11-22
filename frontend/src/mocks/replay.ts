/**
 * Mock WebSocket. Same interface as LiveSocket; it delivers the replayed backend messages for the channels
 * this user subscribed. Channels that were not recorded are derived from recorded ones exactly as the backend
 * builds them (api/server.py build_messages): site-owner:{id} from slot.tick + alert.raised, task:{id} and
 * job:{id} from the task events on site:{id}.
 */
import type { User, WsMessage } from "@/api/types";
import type { ConnInfo, Transport } from "@/live/socket";
import { mockBackend } from "./backend";

export class MockTransport implements Transport {
  private channels = new Map<string, number>();
  private msgSubs = new Set<(m: WsMessage) => void>();
  private stateSubs = new Set<(s: ConnInfo) => void>();
  private info: ConnInfo = { state: "idle", nextRetryAt: null, attempts: 0, lastMessageAt: null };
  private off: (() => void) | null = null;

  constructor(private user: User) {}

  private set(p: Partial<ConnInfo>) {
    this.info = { ...this.info, ...p };
    this.stateSubs.forEach((f) => f(this.info));
  }

  connect() {
    this.set({ state: "connecting" });
    const be = mockBackend();
    void be.ready.then(() => {
      this.set({ state: "open" });
      this.off = be.on((msgs) => this.deliver(msgs));
    });
  }

  private deliver(msgs: WsMessage[]) {
    this.info.lastMessageAt = Date.now();
    const out: WsMessage[] = [];
    const has = (c: string) => this.channels.has(c);
    const admin = this.user.role === "admin";
    for (const m of msgs) {
      if (m.channel === "customer") {
        if (has("customer") && this.user.id === "acme") out.push(m);
        const jobId = (m.data as { id?: string }).id;
        if (jobId && has(`job:${jobId}`)) out.push({ ...m, channel: `job:${jobId}` });
        continue;
      }
      if (admin && has(m.channel)) out.push(m);
      const d = m.data as Record<string, unknown>;
      if (m.type === "slot.tick" && m.channel === "fleet") {
        if (has(`site-owner:${d.siteId}`)) out.push({ ...m, type: "overview.update", channel: `site-owner:${d.siteId}` });
        if (admin && has(`site:${d.siteId}`)) out.push({ ...m, channel: `site:${d.siteId}` });
      }
      if (m.type === "alert.raised" && d.siteId && has(`site-owner:${d.siteId}`)) out.push({ ...m, type: "notification.new", channel: `site-owner:${d.siteId}` });
      if (m.type.startsWith("task.") && m.channel.startsWith("site:")) {
        if (has(`task:${d.taskId}`)) out.push({ ...m, channel: `task:${d.taskId}` });
        if (has(`job:${d.jobId}`)) out.push({ ...m, channel: `job:${d.jobId}` });
      }
    }
    out.forEach((m) => this.msgSubs.forEach((f) => f(m)));
  }

  close() {
    this.off?.();
    this.set({ state: "closed" });
  }
  retryNow() {
    this.connect();
  }
  subscribe(channels: string[]) {
    channels.forEach((c) => this.channels.set(c, (this.channels.get(c) ?? 0) + 1));
  }
  unsubscribe(channels: string[]) {
    channels.forEach((c) => {
      const n = (this.channels.get(c) ?? 0) - 1;
      if (n <= 0) this.channels.delete(c);
      else this.channels.set(c, n);
    });
  }
  onMessage(fn: (m: WsMessage) => void) {
    this.msgSubs.add(fn);
    return () => void this.msgSubs.delete(fn);
  }
  onState(fn: (s: ConnInfo) => void) {
    this.stateSubs.add(fn);
    fn(this.info);
    return () => void this.stateSubs.delete(fn);
  }
}
