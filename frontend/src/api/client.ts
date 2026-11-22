import type { z } from "zod";
import { env } from "@/lib/env";
import { parseLooseJson } from "@/lib/json";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let token: string | null = sessionStorage.getItem("dh.token");
let onUnauthorized: (() => void) | null = null;

export const auth = {
  get token() {
    return token;
  },
  set(t: string | null) {
    token = t;
    if (t) sessionStorage.setItem("dh.token", t);
    else sessionStorage.removeItem("dh.token");
  },
  onUnauthorized(fn: () => void) {
    onUnauthorized = fn;
  },
};

/** Last request round trip, shown in the connection diagnostics */
export const diagnostics = { lastLatencyMs: null as number | null, lastError: null as string | null };

type Opts = { method?: string; body?: unknown; query?: Record<string, string | number | boolean | null | undefined>; signal?: AbortSignal };

export async function request<S extends z.ZodTypeAny>(path: string, schema: S | null, opts: Opts = {}): Promise<z.infer<S>> {
  const qs = opts.query
    ? "?" +
      Object.entries(opts.query)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(env.apiBase + path + (qs === "?" ? "" : qs), {
      method: opts.method ?? "GET",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    diagnostics.lastError = "network";
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network", "The server could not be reached. Check that the backend is running and the API address is right.");
  }
  diagnostics.lastLatencyMs = Math.round(performance.now() - t0);
  const text = await res.text();
  const json = text ? parseLooseJson<Record<string, unknown>>(text) : null;
  if (!res.ok) {
    const err = (json?.error ?? {}) as { code?: string; message?: string; details?: { field: string; message: string }[] };
    diagnostics.lastError = `${res.status} ${err.code ?? ""}`;
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(res.status, err.code ?? "http_error", err.message ?? `Request failed (${res.status})`, err.details);
  }
  diagnostics.lastError = null;
  if (!schema) return json as z.infer<S>;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // never crash on a contract drift: log it and use the raw data
    console.warn(`[api] ${path} does not match its schema`, parsed.error.issues.slice(0, 3));
    return json as z.infer<S>;
  }
  return parsed.data;
}
