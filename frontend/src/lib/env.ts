/** Runtime configuration. The presenter can override it from the Shift+D settings sheet (kept in sessionStorage). */
export type DemoMode = "live" | "mock";

const OVERRIDE_KEY = "dh.runtime";
type Override = Partial<{ apiBase: string; wsBase: string; mode: DemoMode }>;

function readOverride(): Override {
  try {
    return JSON.parse(sessionStorage.getItem(OVERRIDE_KEY) ?? "{}") as Override;
  } catch {
    return {};
  }
}

export function setRuntimeOverride(next: Override | null) {
  if (next === null) sessionStorage.removeItem(OVERRIDE_KEY);
  else sessionStorage.setItem(OVERRIDE_KEY, JSON.stringify({ ...readOverride(), ...next }));
}

const o = readOverride();
// default: the address the page came from; pnpm dev and pnpm lan forward /api to the backend
const apiBase = (o.apiBase ?? import.meta.env.VITE_API_BASE ?? `${location.origin}/api/v1`).replace(/\/$/, "");

export const env = {
  apiBase,
  wsBase: o.wsBase ?? import.meta.env.VITE_WS_BASE ?? apiBase.replace(/^http/, "ws") + "/ws",
  mode: (o.mode ?? (import.meta.env.VITE_DEMO_MODE as DemoMode | undefined) ?? "live") as DemoMode,
};
export const isMock = env.mode === "mock";
