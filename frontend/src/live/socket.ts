/**
 * Reconnecting WebSocket for /api/v1/ws. Backoff 500 ms doubling to 8 s with jitter, resubscribes every
 * channel after a reconnect, exposes its state and the next-retry time for the banner. Malformed messages
 * are logged and ignored. The mock replay implements the same Transport interface.
 */
import { parseLooseJson } from "@/lib/json";
import type { WsMessage } from "@/api/types";

export type ConnState = "idle" | "connecting" | "open" | "reconnecting" | "closed";
export type ConnInfo = { state: ConnState; nextRetryAt: number | null; attempts: number; lastMessageAt: number | null };

export interface Transport {
  connect(): void;
  close(): void;
  subscribe(channels: string[]): void;
  unsubscribe(channels: string[]): void;
  onMessage(fn: (m: WsMessage) => void): () => void;
  onState(fn: (s: ConnInfo) => void): () => void;
  /** force an immediate retry (banner "Retry now") */
  retryNow(): void;
}

export class LiveSocket implements Transport {
  private ws: WebSocket | null = null;
  private channels = new Map<string, number>(); // ref-counted subscriptions
  private msgSubs = new Set<(m: WsMessage) => void>();
  private stateSubs = new Set<(s: ConnInfo) => void>();
  private info: ConnInfo = { state: "idle", nextRetryAt: null, attempts: 0, lastMessageAt: null };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closedByUser = false;

  constructor(
    private url: string,
    private token: string,
  ) {}

  private set(p: Partial<ConnInfo>) {
    this.info = { ...this.info, ...p };
    this.stateSubs.forEach((f) => f(this.info));
  }

  connect() {
    this.closedByUser = false;
    if (this.ws && this.ws.readyState <= 1) return;
    this.set({ state: this.info.attempts ? "reconnecting" : "connecting", nextRetryAt: null });
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${this.url}?token=${encodeURIComponent(this.token)}`);
    } catch {
      return this.scheduleRetry();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.set({ state: "open", attempts: 0, nextRetryAt: null });
      if (this.channels.size) this.send({ action: "subscribe", channels: [...this.channels.keys()] });
      this.pingTimer = setInterval(() => this.send({ action: "ping" }), 20000);
    };
    ws.onmessage = (ev) => {
      this.info.lastMessageAt = Date.now();
      let m: WsMessage;
      try {
        m = parseLooseJson<WsMessage>(String(ev.data));
      } catch (e) {
        console.warn("[ws] malformed message ignored", e);
        return;
      }
      if (!m || typeof m !== "object" || typeof m.type !== "string") return;
      if (m.type === "pong" || m.type === "subscribed" || m.type === "unsubscribed") return;
      this.msgSubs.forEach((f) => {
        try {
          f(m);
        } catch (e) {
          console.warn("[ws] handler failed for", m.type, e);
        }
      });
    };
    ws.onclose = (ev) => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.ws = null;
      if (this.closedByUser) return this.set({ state: "closed" });
      if (ev.code === 4401) return this.set({ state: "closed" }); // bad token: the REST 401 handler logs out
      this.scheduleRetry();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleRetry() {
    const attempts = this.info.attempts + 1;
    const base = Math.min(8000, 500 * 2 ** (attempts - 1));
    const delay = Math.round(base * (0.8 + Math.random() * 0.4));
    this.set({ state: "reconnecting", attempts, nextRetryAt: Date.now() + delay });
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  retryNow() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.connect();
  }

  close() {
    this.closedByUser = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.set({ state: "closed", nextRetryAt: null });
  }

  private send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  subscribe(channels: string[]) {
    const fresh = channels.filter((c) => {
      const n = this.channels.get(c) ?? 0;
      this.channels.set(c, n + 1);
      return n === 0;
    });
    if (fresh.length) this.send({ action: "subscribe", channels: fresh });
  }

  unsubscribe(channels: string[]) {
    const gone = channels.filter((c) => {
      const n = (this.channels.get(c) ?? 0) - 1;
      if (n <= 0) this.channels.delete(c);
      else this.channels.set(c, n);
      return n <= 0;
    });
    if (gone.length) this.send({ action: "unsubscribe", channels: gone });
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
