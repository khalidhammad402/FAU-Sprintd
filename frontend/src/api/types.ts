/**
 * Response contracts. docs/openapi.json types request bodies only (every response is `{}`), so these zod
 * schemas are written from real captured responses (src/mocks/fixtures/rest.json) and BACKEND_HANDOFF.md.
 * Request bodies come from the generated src/api/schema.ts.
 * Unknown extra fields pass through. Numbers may be null where the backend sends Infinity/NaN.
 */
import { z } from "zod";
import type { components } from "./schema";

const n = z.number().nullable();
const iso = z.string();

export type JobSubmitBody = components["schemas"]["JobSubmit"];
export type TaskSpecBody = components["schemas"]["TaskSpec"];
export type SchedulerUpdateBody = components["schemas"]["SchedulerUpdate"];
export type JumpBody = components["schemas"]["JumpRequest"];
export type PricingUpdateBody = components["schemas"]["PricingUpdate"];

export const User = z.object({ id: z.string(), role: z.enum(["admin", "customer", "site_owner"]), name: z.string() }).passthrough();
export type User = z.infer<typeof User>;
export const LoginResponse = z.object({ token: z.string(), user: User });

export const Meta = z
  .object({
    name: z.string(),
    periodStart: iso,
    periodEnd: iso,
    slotMinutes: z.number(),
    slotsTotal: z.number(),
    sites: z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), lat: z.number(), lon: z.number() })),
    serversTotal: z.number(),
    mapCenter: z.object({ lat: z.number(), lon: z.number(), pitch: z.number(), zoom: z.number() }),
  })
  .passthrough();
export type Meta = z.infer<typeof Meta>;

export const SiteStatus = z.enum(["covered", "tank_low", "unmet", "dumping", "offline"]);
export type SiteStatus = z.infer<typeof SiteStatus>;

/** One 15-min reading of a site (slot.tick, timeline rows) */
export const SlotReading = z
  .object({
    siteId: z.string().optional(),
    time: iso,
    demandKwh: z.number(),
    producedKwh: z.number(),
    deliveredKwh: z.number(),
    dumpedKwh: z.number(),
    unmetKwh: z.number(),
    tankKwh: z.number(),
    loadKw: z.number(),
    capacityKw: z.number(),
  })
  .passthrough();
export type SlotReading = z.infer<typeof SlotReading>;

export const Site = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    lat: z.number(),
    lon: z.number(),
    buildingHeightM: z.number(),
    tankCapacityKwh: z.number(),
    owner: z.string(),
    status: SiteStatus.catch("covered"),
    demandKwh: z.number(),
    producedKwh: z.number(),
    deliveredKwh: z.number(),
    dumpedKwh: z.number(),
    unmetKwh: z.number(),
    tankKwh: z.number(),
    loadKw: z.number(),
    capacityKw: z.number(),
    serversRunning: z.number(),
    serversTotal: z.number(),
  })
  .passthrough();
export type Site = z.infer<typeof Site>;

export const Kpis = z
  .object({
    coveragePct: n,
    demandKwh: n,
    deliveredKwh: n,
    dumpedKwh: n,
    unmetKwh: n,
    utilisationPct: n,
    loadFactorPct: n,
    serverRunningH: n,
    tasksRunning: n,
    electricityKwh: n,
    electricityCostChf: n,
    heatValueChf: n,
    computeIncomeChf: n,
    marginChf: n,
    serverHoursSold: n,
    breakEvenChfPerServerHour: n,
    avgComputePriceChfPerServerHour: n.optional(),
    maxElectricityPriceChfPerKwh: n.optional(),
    jobsTotal: n.optional(),
    jobsDone: n.optional(),
    jobsMissed: n.optional(),
    missedDeadlinesPct: n.optional(),
  })
  .partial()
  .passthrough();
export type Kpis = z.infer<typeof Kpis>;

export const ServerTask = z
  .object({ id: z.string(), name: z.string(), jobId: z.string(), powerKw: z.number(), priority: z.string(), filler: z.boolean(), progressPct: z.number() })
  .passthrough();
export const Server = z
  .object({
    id: z.string(),
    siteId: z.string(),
    capacityKw: z.number(),
    status: z.enum(["online", "offline"]).catch("online"),
    live: z.boolean(),
    loadKw: z.number(),
    cpuPct: n,
    lastHeartbeat: iso.nullable(),
    tasks: z.array(ServerTask).default([]),
  })
  .passthrough();
export type Server = z.infer<typeof Server>;
export type ServerTask = z.infer<typeof ServerTask>;

export const TaskEvent = z
  .object({ time: iso, kind: z.string(), fromServerId: z.string().nullable().optional(), toServerId: z.string().nullable().optional() })
  .passthrough();
export const TaskState = z.enum(["waiting", "ready", "running", "paused", "done", "missed", "cancelled"]);
export type TaskState = z.infer<typeof TaskState>;
export const Task = z
  .object({
    id: z.string(),
    jobId: z.string(),
    name: z.string(),
    state: TaskState.catch("waiting"),
    priority: z.string(),
    runtimeMin: z.number(),
    powerKw: z.number(),
    threads: z.number().optional(),
    interruptible: z.boolean(),
    dependsOn: z.array(z.string()),
    arrival: iso.nullable(),
    deadline: iso.nullable(),
    siteId: z.string().nullable(),
    serverId: z.string().nullable(),
    progressPct: z.number(),
    energyKwh: z.number(),
    heatDeliveredKwh: z.number(),
    filler: z.boolean(),
    hold: z.boolean(),
    finished: iso.nullable(),
    events: z.array(TaskEvent).optional(),
  })
  .passthrough();
export type Task = z.infer<typeof Task>;
export type TaskEvent = z.infer<typeof TaskEvent>;

export const JobStatus = z.enum(["queued", "running", "done", "missed", "cancelled"]);
export type JobStatus = z.infer<typeof JobStatus>;
export const Job = z
  .object({
    id: z.string(),
    customerId: z.string(),
    name: z.string(),
    priority: z.string(),
    status: JobStatus.catch("queued"),
    submittedAt: iso,
    deadline: iso,
    estimatedFinish: iso.nullable(),
    progressPct: z.number(),
    costChf: z.number(),
    taskIds: z.array(z.string()),
    tasks: z.array(Task).optional(),
  })
  .passthrough();
export type Job = z.infer<typeof Job>;

export const page = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), nextCursor: z.string().nullable(), total: z.number() });
export type Page<T> = { items: T[]; nextCursor: string | null; total: number };

export const Scheduler = z
  .object({
    algorithm: z.string(),
    slotMinutes: z.number(),
    slotSeconds: z.number(),
    mode: z.enum(["live", "paused", "jumping", "stopped"]).catch("live"),
    paused: z.boolean(),
    slot: z.number(),
    slotsTotal: z.number(),
    currentTime: iso,
    periodStart: iso,
    periodEnd: iso,
    progressPct: z.number(),
    jumpTarget: iso.nullable(),
    mqtt: z.string(),
    liveServers: z.array(z.string()),
  })
  .passthrough();
export type Scheduler = z.infer<typeof Scheduler>;

export const Agent = z
  .object({
    serverId: z.string(),
    siteId: z.string().nullable(),
    host: z.string().nullable(),
    online: z.boolean(),
    cpuPct: n,
    lastSeen: iso.nullable(),
    secondsSinceSeen: n,
    processes: z.array(z.object({ taskId: z.string(), name: z.string().optional(), state: z.string(), progressPct: z.number() }).passthrough()).default([]),
  })
  .passthrough();
export const Agents = z.object({ mqtt: z.string(), items: z.array(Agent) });
export type Agent = z.infer<typeof Agent>;

export const Alert = z
  .object({
    id: z.number(),
    slot: z.number().optional(),
    time: iso,
    severity: z.enum(["info", "warning", "critical"]).catch("info"),
    kind: z.string(),
    siteId: z.string().nullable(),
    serverId: z.string().nullable(),
    jobId: z.string().nullable(),
    message: z.string(),
    acknowledged: z.boolean(),
  })
  .passthrough();
export type Alert = z.infer<typeof Alert>;

export const Customer = z.object({ id: z.string(), name: z.string(), jobs: z.number(), tasksRunning: z.number(), revenueChf: z.number() }).passthrough();
export type Customer = z.infer<typeof Customer>;

export const FleetResult = Kpis.extend({
  coveragePct: n,
  migrations: n.optional(),
  pauses: n.optional(),
  servers: n.optional(),
  sites: n.optional(),
  payOffStatement: z.string().optional(),
  missedTasksPctByPriority: z.record(z.number()).optional(),
}).passthrough();
export const Results = z.object({ algorithm: z.string(), generatedAt: iso.nullable().optional(), fleet: FleetResult, sites: z.array(z.record(z.unknown())).optional() }).passthrough();
export type Results = z.infer<typeof Results>;

export const Assumption = z.object({ area: z.string(), name: z.string(), value: z.string(), status: z.string(), source: z.string() }).passthrough();
export type Assumption = z.infer<typeof Assumption>;

export const Pricing = z
  .object({
    electricityChfPerKwh: z.number(),
    heatPumpCop: z.number(),
    heatValueChfPerKwh: z.number(),
    computeChfPerServerHour: z.object({ critical: z.number(), normal: z.number(), flexible: z.number() }),
    source: z.string(),
  })
  .passthrough();
export type Pricing = z.infer<typeof Pricing>;

export const TaskType = z
  .object({
    id: z.string(),
    name: z.string(),
    customer: z.string(),
    priority: z.string(),
    jobsPerDay: z.number(),
    deadlineH: z.number(),
    tasks: z.array(z.object({ name: z.string(), count: z.number(), runtimeMin: z.number(), powerKw: z.number(), interruptible: z.boolean() }).passthrough()),
    source: z.string(),
  })
  .passthrough();
export type TaskType = z.infer<typeof TaskType>;

export const ServerTimelineRow = z.object({ time: iso, loadKw: z.number(), capacityKw: z.number(), cpuPct: n }).passthrough();
export type ServerTimelineRow = z.infer<typeof ServerTimelineRow>;

export const Simulation = z.object({ id: z.string(), algorithm: z.string(), status: z.string() }).passthrough();
export type Simulation = z.infer<typeof Simulation>;

/* ----- customer ----- */
export const CustomerOverview = z
  .object({
    jobsRunning: z.number(),
    jobsQueued: z.number(),
    jobsDone: z.number(),
    jobsMissed: z.number(),
    jobsAtRisk: z.array(z.string()),
    spendMonthChf: z.number(),
    heatDeliveredKwh: z.number(),
  })
  .passthrough();
export type CustomerOverview = z.infer<typeof CustomerOverview>;
export const UsageRow = z.object({ month: iso, priority: z.string(), serverHours: z.number(), costChf: z.number() });
export type UsageRow = z.infer<typeof UsageRow>;
export const Invoice = z.object({ id: z.string(), month: iso, serverHours: z.number(), amountChf: z.number(), status: z.string() }).passthrough();
export type Invoice = z.infer<typeof Invoice>;
export const Impact = z.object({ heatDeliveredKwh: z.number(), heatReusedSharePct: n, sitesHeated: z.number(), note: z.string() }).passthrough();
export type Impact = z.infer<typeof Impact>;
export const ApiKey = z.object({ id: z.string() }).passthrough();
export type ApiKey = z.infer<typeof ApiKey> & Partial<{ name: string; prefix: string; key: string; createdAt: string; lastUsedAt: string }>;
export const JobResults = z
  .object({ jobId: z.string(), status: z.string(), results: z.array(z.object({ taskId: z.string(), state: z.string(), energyKwh: z.number(), heatKwh: z.number() }).passthrough()) })
  .passthrough();

/* ----- host (backend role site_owner) ----- */
export const HostSite = z.object({ id: z.string(), name: z.string(), type: z.string() }).passthrough();
export type HostSite = z.infer<typeof HostSite>;
export const HostOverview = z
  .object({
    serverHeatSharePctToday: z.number(),
    tankKwh: z.number(),
    tankCapacityKwh: z.number(),
    serversWorking: z.number(),
    serversTotal: z.number(),
    savingsMonthChf: z.number(),
    backupHeatTodayKwh: z.number(),
    statusMessage: z.string(),
    time: iso,
  })
  .passthrough();
export type HostOverview = z.infer<typeof HostOverview>;
export const EnergyBucket = z.object({ bucket: iso, demandKwh: z.number(), serverHeatKwh: z.number(), backupHeatKwh: z.number() });
export type EnergyBucket = z.infer<typeof EnergyBucket>;
export const Savings = z
  .object({ months: z.array(z.object({ month: iso, serverHeatKwh: z.number(), valueChf: z.number() })), totalChf: z.number(), explanation: z.string() })
  .passthrough();
export type Savings = z.infer<typeof Savings>;
export const HostServer = z.object({ name: z.string(), capacityKw: z.number(), status: z.string(), workKind: z.string().nullable() }).passthrough();
export type HostServer = z.infer<typeof HostServer>;
export const Notification = z.object({ id: z.number(), time: iso, kind: z.string(), message: z.string(), siteId: z.string().nullable(), read: z.boolean() }).passthrough();
export type Notification = z.infer<typeof Notification>;

/* ----- WebSocket ----- */
export type WsMessage = { type: string; channel: string; time: string; data: Record<string, unknown> };
/** task.* events on site:{id}, server:{id}, task:{id}, job:{id}; the fleet channel carries task.migrated with fromSite/toSite */
export type WsTaskEvent = {
  slot: number;
  time: string;
  kind: string;
  taskId: string;
  jobId: string;
  filler: boolean;
  fromServer: string | null;
  toServer: string | null;
  fromSite?: string | null;
  toSite?: string | null;
};
