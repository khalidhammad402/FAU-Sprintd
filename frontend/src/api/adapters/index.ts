/** One function per backend endpoint (paths verified against docs/BACKEND_HANDOFF.md section 8). */
import { z } from "zod";
import { request } from "../client";
import * as T from "../types";

const arr = <S extends z.ZodTypeAny>(s: S) => z.array(s);

export const authApi = {
  login: (username: string, password: string) => request("/auth/login", T.LoginResponse, { method: "POST", body: { username, password } }),
  me: () => request("/auth/me", T.User),
};

export const metaApi = { meta: () => request("/meta", T.Meta), health: () => request("/health", null) };

type Range = { from?: string | null; to?: string | null };
export type Resolution = "15m" | "1h" | "1d" | "1mo";

export const adminApi = {
  mapSites: () => request("/admin/map/sites", null),
  kpis: (r: Range & { siteId?: string } = {}) =>
    request("/admin/kpis", T.Kpis, { query: { scope: r.siteId ? "site" : undefined, siteId: r.siteId, from: r.from, to: r.to } }),
  sites: () => request("/admin/sites", arr(T.Site)),
  /** Can fail with 500 when today's KPIs contain Infinity (FRONTEND_GAPS.md #2): use sites() for the header. */
  site: (id: string) => request(`/admin/sites/${id}`, T.Site.extend({ today: T.Kpis.optional() })),
  siteTimeline: (id: string, r: Range & { resolution?: Resolution } = {}) =>
    request(`/admin/sites/${id}/timeline`, arr(T.SlotReading), { query: { resolution: r.resolution ?? "15m", from: r.from, to: r.to } }),
  siteServers: (id: string) => request(`/admin/sites/${id}/servers`, arr(T.Server)),
  servers: () => request("/admin/servers", arr(T.Server)),
  server: (id: string) => request(`/admin/servers/${id}`, T.Server),
  serverTimeline: (id: string, r: Range & { resolution?: Resolution } = {}) =>
    request(`/admin/servers/${id}/timeline`, arr(T.ServerTimelineRow), { query: { resolution: r.resolution ?? "1h", from: r.from, to: r.to } }),
  jobs: (q: { status?: string; customerId?: string; priority?: string; limit?: number; cursor?: string } = {}) =>
    request("/admin/jobs", T.page(T.Job), { query: { limit: 100, ...q } }),
  job: (id: string) => request(`/admin/jobs/${id}`, T.Job),
  tasks: (q: { state?: string; jobId?: string; siteId?: string; serverId?: string; limit?: number; cursor?: string } = {}) =>
    request("/admin/tasks", T.page(T.Task), { query: { limit: 200, ...q } }),
  task: (id: string) => request(`/admin/tasks/${id}`, T.Task),
  taskAction: (id: string, action: "pause" | "resume" | "cancel") => request(`/admin/tasks/${id}/${action}`, T.Task, { method: "POST" }),
  taskTypes: () => request("/admin/task-types", arr(T.TaskType)),
  customers: () => request("/admin/customers", arr(T.Customer)),
  customer: (id: string) => request(`/admin/customers/${id}`, T.Customer.extend({ jobList: T.page(T.Job).optional() })),
  scheduler: () => request("/admin/scheduler", T.Scheduler),
  putScheduler: (body: T.SchedulerUpdateBody) => request("/admin/scheduler", T.Scheduler, { method: "PUT", body }),
  jump: (body: T.JumpBody) => request("/admin/scheduler/jump", T.Scheduler, { method: "POST", body }),
  reset: () => request("/admin/scheduler/reset", T.Scheduler, { method: "POST" }),
  agents: () => request("/admin/live/agents", T.Agents),
  results: (algorithm: "greedy" | "mpc") => request("/admin/results", T.Results, { query: { algorithm } }),
  resultsTimeline: (siteId: string, resolution: Resolution = "1mo") => request("/admin/results/timeline", arr(T.SlotReading), { query: { siteId, resolution } }),
  assumptions: () => request("/admin/assumptions", arr(T.Assumption)),
  simulations: () => request("/admin/simulations", arr(T.Simulation)),
  startSimulation: (algorithm: "greedy" | "mpc") => request("/admin/simulations", T.Simulation, { method: "POST", body: { algorithm } }),
  compareSimulations: (runIds: string[]) => request("/admin/simulations/compare", null, { query: { runIds: runIds.join(",") } }),
  events: (q: { severity?: string; siteId?: string; limit?: number; cursor?: string } = {}) =>
    request("/admin/events", T.page(T.Alert), { query: { limit: 100, ...q } }),
  ackEvent: (id: number, acknowledged = true) => request(`/admin/events/${id}`, T.Alert, { method: "PATCH", body: { acknowledged } }),
  pricing: () => request("/admin/settings/pricing", T.Pricing),
  putPricing: (body: T.PricingUpdateBody) => request("/admin/settings/pricing", T.Pricing, { method: "PUT", body }),
};

export const customerApi = {
  overview: () => request("/customer/overview", T.CustomerOverview),
  jobs: (q: { status?: string; limit?: number; cursor?: string } = {}) => request("/customer/jobs", T.page(T.Job), { query: { limit: 100, ...q } }),
  job: (id: string) => request(`/customer/jobs/${id}`, T.Job),
  jobTasks: (id: string) => request(`/customer/jobs/${id}/tasks`, arr(T.Task)),
  jobResults: (id: string) => request(`/customer/jobs/${id}/results`, T.JobResults),
  submit: (body: T.JobSubmitBody) => request("/customer/jobs", T.Job, { method: "POST", body }),
  cancel: (id: string) => request(`/customer/jobs/${id}/cancel`, T.Job, { method: "POST" }),
  usage: () => request("/customer/usage", arr(T.UsageRow)),
  invoices: () => request("/customer/invoices", arr(T.Invoice)),
  impact: () => request("/customer/impact", T.Impact),
  apiKeys: () => request("/customer/api-keys", arr(T.ApiKey)),
  createApiKey: () => request("/customer/api-keys", T.ApiKey, { method: "POST" }),
  deleteApiKey: (id: string) => request(`/customer/api-keys/${id}`, null, { method: "DELETE" }),
};

/** Host Portal. Backend role and paths keep the name site_owner and /site/*. */
export const hostApi = {
  sites: () => request("/site/sites", arr(T.HostSite)),
  overview: (id: string) => request(`/site/sites/${id}/overview`, T.HostOverview),
  energy: (id: string, period: "day" | "week" | "month" | "year", date?: string) =>
    request(`/site/sites/${id}/energy`, arr(T.EnergyBucket), { query: { period, date } }),
  savings: (id: string) => request(`/site/sites/${id}/savings`, T.Savings),
  servers: (id: string) => request(`/site/sites/${id}/servers`, arr(T.HostServer)),
  notifications: () => request("/site/notifications", arr(T.Notification)),
  markRead: (id: number, read = true) => request(`/site/notifications/${id}`, T.Notification, { method: "PATCH", body: { read } }),
};
