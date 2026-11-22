/**
 * TanStack Query hooks. Keys are arrays starting with the area, so reconcile.ts can update or invalidate
 * whole areas after a socket event or a scheduler jump. Live data stays fresh through the socket, so
 * stale times are long and window-focus refetch is off.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, customerApi, hostApi, metaApi, type Resolution } from "../adapters";
import type { JobSubmitBody, PricingUpdateBody, SchedulerUpdateBody } from "../types";

export const qk = {
  meta: ["meta"] as const,
  admin: {
    all: ["admin"] as const,
    sites: ["admin", "sites"] as const,
    site: (id: string) => ["admin", "site", id] as const,
    siteTimeline: (id: string, from: string | null, res: Resolution) => ["admin", "siteTimeline", id, from, res] as const,
    siteServers: (id: string) => ["admin", "siteServers", id] as const,
    servers: ["admin", "servers"] as const,
    server: (id: string) => ["admin", "server", id] as const,
    serverTimeline: (id: string, from: string | null) => ["admin", "serverTimeline", id, from] as const,
    kpis: (from: string | null, to: string | null, siteId?: string) => ["admin", "kpis", from, to, siteId ?? "fleet"] as const,
    tasks: (q: object) => ["admin", "tasks", q] as const,
    task: (id: string) => ["admin", "task", id] as const,
    jobs: (q: object) => ["admin", "jobs", q] as const,
    job: (id: string) => ["admin", "job", id] as const,
    customers: ["admin", "customers"] as const,
    customer: (id: string) => ["admin", "customer", id] as const,
    scheduler: ["admin", "scheduler"] as const,
    agents: ["admin", "agents"] as const,
    results: (a: string) => ["admin", "results", a] as const,
    resultsTimeline: (id: string) => ["admin", "resultsTimeline", id] as const,
    assumptions: ["admin", "assumptions"] as const,
    simulations: ["admin", "simulations"] as const,
    events: ["admin", "events"] as const,
    pricing: ["admin", "pricing"] as const,
    taskTypes: ["admin", "taskTypes"] as const,
  },
  customer: {
    all: ["customer"] as const,
    overview: ["customer", "overview"] as const,
    jobs: (q: object) => ["customer", "jobs", q] as const,
    job: (id: string) => ["customer", "job", id] as const,
    jobTasks: (id: string) => ["customer", "jobTasks", id] as const,
    usage: ["customer", "usage"] as const,
    invoices: ["customer", "invoices"] as const,
    impact: ["customer", "impact"] as const,
    apiKeys: ["customer", "apiKeys"] as const,
  },
  host: {
    all: ["host"] as const,
    sites: ["host", "sites"] as const,
    overview: (id: string) => ["host", "overview", id] as const,
    energy: (id: string, p: string) => ["host", "energy", id, p] as const,
    savings: (id: string) => ["host", "savings", id] as const,
    servers: (id: string) => ["host", "servers", id] as const,
    notifications: ["host", "notifications"] as const,
  },
};

const on = (v: unknown) => v !== undefined && v !== null && v !== "";

export const useMeta = () => useQuery({ queryKey: qk.meta, queryFn: metaApi.meta, staleTime: Infinity });

/* ---------- admin ---------- */
export const useSites = () => useQuery({ queryKey: qk.admin.sites, queryFn: adminApi.sites });
export const useSite = (id?: string) => useQuery({ queryKey: qk.admin.site(id!), queryFn: () => adminApi.site(id!), enabled: on(id), retry: 0 });
export const useSiteTimeline = (id: string | undefined, from: string | null, resolution: Resolution = "15m") =>
  useQuery({ queryKey: qk.admin.siteTimeline(id!, from, resolution), queryFn: () => adminApi.siteTimeline(id!, { from, resolution }), enabled: on(id), placeholderData: keepPreviousData });
export const useSiteServers = (id?: string) => useQuery({ queryKey: qk.admin.siteServers(id!), queryFn: () => adminApi.siteServers(id!), enabled: on(id) });
export const useServers = () => useQuery({ queryKey: qk.admin.servers, queryFn: adminApi.servers });
export const useServer = (id?: string) => useQuery({ queryKey: qk.admin.server(id!), queryFn: () => adminApi.server(id!), enabled: on(id) });
export const useServerTimeline = (id: string | undefined, from: string | null) =>
  useQuery({ queryKey: qk.admin.serverTimeline(id!, from), queryFn: () => adminApi.serverTimeline(id!, { from }), enabled: on(id) });
export const useKpis = (from: string | null, to: string | null = null, opts: { siteId?: string; enabled?: boolean } = {}) =>
  useQuery({
    queryKey: qk.admin.kpis(from, to, opts.siteId),
    queryFn: () => adminApi.kpis({ from, to, siteId: opts.siteId }),
    enabled: opts.enabled ?? true,
    placeholderData: keepPreviousData,
  });
export const useTasks = (q: Parameters<typeof adminApi.tasks>[0] = {}) =>
  useQuery({ queryKey: qk.admin.tasks(q), queryFn: () => adminApi.tasks(q), placeholderData: keepPreviousData });
export const useTask = (id?: string) => useQuery({ queryKey: qk.admin.task(id!), queryFn: () => adminApi.task(id!), enabled: on(id) });
export const useJobs = (q: Parameters<typeof adminApi.jobs>[0] = {}) => useQuery({ queryKey: qk.admin.jobs(q), queryFn: () => adminApi.jobs(q), placeholderData: keepPreviousData });
export const useJob = (id?: string) => useQuery({ queryKey: qk.admin.job(id!), queryFn: () => adminApi.job(id!), enabled: on(id) });
export const useCustomers = () => useQuery({ queryKey: qk.admin.customers, queryFn: adminApi.customers });
export const useCustomer = (id?: string) => useQuery({ queryKey: qk.admin.customer(id!), queryFn: () => adminApi.customer(id!), enabled: on(id) });
export const useScheduler = () => useQuery({ queryKey: qk.admin.scheduler, queryFn: adminApi.scheduler });
export const useAgents = () => useQuery({ queryKey: qk.admin.agents, queryFn: adminApi.agents, refetchInterval: 5000 });
export const useResults = (a: "greedy" | "mpc") => useQuery({ queryKey: qk.admin.results(a), queryFn: () => adminApi.results(a), staleTime: Infinity, retry: 0 });
export const useResultsTimeline = (id?: string) =>
  useQuery({ queryKey: qk.admin.resultsTimeline(id!), queryFn: () => adminApi.resultsTimeline(id!, "1mo"), enabled: on(id), staleTime: Infinity });
export const useAssumptions = () => useQuery({ queryKey: qk.admin.assumptions, queryFn: adminApi.assumptions, staleTime: Infinity });
export const useSimulations = () => useQuery({ queryKey: qk.admin.simulations, queryFn: adminApi.simulations });
export const useEvents = () => useQuery({ queryKey: qk.admin.events, queryFn: () => adminApi.events({ limit: 100 }) });
export const usePricing = () => useQuery({ queryKey: qk.admin.pricing, queryFn: adminApi.pricing });
export const useTaskTypes = () => useQuery({ queryKey: qk.admin.taskTypes, queryFn: adminApi.taskTypes, staleTime: Infinity });

export function useSchedulerMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: qk.admin.scheduler });
  return {
    update: useMutation({ mutationFn: (b: SchedulerUpdateBody) => adminApi.putScheduler(b), onSuccess: (s) => qc.setQueryData(qk.admin.scheduler, s) }),
    jump: useMutation({ mutationFn: (to: string) => adminApi.jump({ to }), onSuccess: done }),
    reset: useMutation({ mutationFn: () => adminApi.reset(), onSuccess: () => qc.invalidateQueries() }),
  };
}
export function usePricingMutation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: PricingUpdateBody) => adminApi.putPricing(b), onSuccess: (p) => qc.setQueryData(qk.admin.pricing, p) });
}

/* ---------- customer ---------- */
export const useCustomerOverview = () => useQuery({ queryKey: qk.customer.overview, queryFn: customerApi.overview });
export const useCustomerJobs = (q: Parameters<typeof customerApi.jobs>[0] = {}) =>
  useQuery({ queryKey: qk.customer.jobs(q), queryFn: () => customerApi.jobs(q), placeholderData: keepPreviousData });
export const useCustomerJob = (id?: string) => useQuery({ queryKey: qk.customer.job(id!), queryFn: () => customerApi.job(id!), enabled: on(id) });
export const useCustomerJobTasks = (id?: string) => useQuery({ queryKey: qk.customer.jobTasks(id!), queryFn: () => customerApi.jobTasks(id!), enabled: on(id) });
export const useUsage = () => useQuery({ queryKey: qk.customer.usage, queryFn: customerApi.usage });
export const useInvoices = () => useQuery({ queryKey: qk.customer.invoices, queryFn: customerApi.invoices });
export const useImpact = () => useQuery({ queryKey: qk.customer.impact, queryFn: customerApi.impact });
export const useApiKeys = () => useQuery({ queryKey: qk.customer.apiKeys, queryFn: customerApi.apiKeys });
export function useCustomerMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: qk.customer.all });
  return {
    submit: useMutation({ mutationFn: (b: JobSubmitBody) => customerApi.submit(b), onSuccess: refresh }),
    cancel: useMutation({ mutationFn: (id: string) => customerApi.cancel(id), onSuccess: refresh }),
    createKey: useMutation({ mutationFn: () => customerApi.createApiKey(), onSuccess: () => qc.invalidateQueries({ queryKey: qk.customer.apiKeys }) }),
    deleteKey: useMutation({ mutationFn: (id: string) => customerApi.deleteApiKey(id), onSuccess: () => qc.invalidateQueries({ queryKey: qk.customer.apiKeys }) }),
  };
}

/* ---------- host ---------- */
export const useHostSites = () => useQuery({ queryKey: qk.host.sites, queryFn: hostApi.sites, staleTime: Infinity });
export const useHostOverview = (id?: string) => useQuery({ queryKey: qk.host.overview(id!), queryFn: () => hostApi.overview(id!), enabled: on(id) });
export const useHostEnergy = (id: string | undefined, period: "day" | "week" | "month" | "year") =>
  useQuery({ queryKey: qk.host.energy(id!, period), queryFn: () => hostApi.energy(id!, period), enabled: on(id), placeholderData: keepPreviousData });
export const useHostSavings = (id?: string) => useQuery({ queryKey: qk.host.savings(id!), queryFn: () => hostApi.savings(id!), enabled: on(id) });
export const useHostServers = (id?: string) => useQuery({ queryKey: qk.host.servers(id!), queryFn: () => hostApi.servers(id!), enabled: on(id) });
export const useNotifications = () => useQuery({ queryKey: qk.host.notifications, queryFn: hostApi.notifications });
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, read }: { id: number; read: boolean }) => hostApi.markRead(id, read), onSuccess: () => qc.invalidateQueries({ queryKey: qk.host.notifications }) });
}
