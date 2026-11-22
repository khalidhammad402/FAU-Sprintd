/**
 * Pure logic of the Submit Job form: validation that mirrors JobSubmit / TaskSpec (api/schemas.py),
 * dependency cycle detection, the longest dependency chain, and the cost estimate.
 * No React here, so every rule is unit-tested (jobForm.test.ts).
 */
import type { JobSubmitBody, UsageRow } from "@/api/types";
import { isPriority, priorities, type Priority } from "@/lib/tiers";

export type TaskDraft = {
  key: string; // the taskId sent to the API, unique inside the job
  name: string;
  runtimeMin: number | "";
  powerKw: number | "";
  threads: number | "";
  interruptible: boolean;
  dependsOn: string[];
};

export type JobDraft = {
  name: string;
  priority: Priority;
  deadlineMode: "in" | "at";
  deadlineInMin: number | "";
  deadlineAt: string; // datetime-local value, Europe/Zurich simulated time
  tasks: TaskDraft[];
};

/**
 * Largest single task the current fleet can run. Every server in data/servers.csv is 1.0 kW and the API
 * does not expose server sizes to buyers (docs/gaps/compute.md), so this is an assumption.
 */
export const MAX_TASK_KW = 1.0;
export const ONE_GPU_KW = 0.122; // L4 board + host share, the backend's job-type catalogue

export const newTask = (i: number): TaskDraft => ({
  key: `T${i}`,
  name: `task ${i}`,
  runtimeMin: 30,
  powerKw: ONE_GPU_KW,
  threads: 1,
  interruptible: true,
  dependsOn: [],
});

/** Returns one dependency cycle as a list of task keys (first key repeated at the end), or null. */
export function findCycle(tasks: Pick<TaskDraft, "key" | "dependsOn">[]): string[] | null {
  const deps = new Map(tasks.map((t) => [t.key, t.dependsOn]));
  const state = new Map<string, 1 | 2>(); // 1 = on the current path, 2 = done
  const path: string[] = [];
  const visit = (k: string): string[] | null => {
    if (state.get(k) === 2) return null;
    if (state.get(k) === 1) return [...path.slice(path.indexOf(k)), k];
    state.set(k, 1);
    path.push(k);
    for (const d of deps.get(k) ?? []) {
      if (!deps.has(d)) continue;
      const c = visit(d);
      if (c) return c;
    }
    path.pop();
    state.set(k, 2);
    return null;
  };
  for (const t of tasks) {
    const c = visit(t.key);
    if (c) return c;
  }
  return null;
}

/** Minutes along the longest dependency chain: the earliest the whole job can finish once it starts. */
export function longestChainMin(tasks: Pick<TaskDraft, "key" | "dependsOn" | "runtimeMin">[]): number {
  if (findCycle(tasks)) return NaN;
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const memo = new Map<string, number>();
  const end = (k: string): number => {
    if (memo.has(k)) return memo.get(k)!;
    const t = byKey.get(k)!;
    const start = Math.max(0, ...t.dependsOn.filter((d) => byKey.has(d)).map(end));
    const v = start + (Number(t.runtimeMin) || 0);
    memo.set(k, v);
    return v;
  };
  return tasks.length ? Math.max(...tasks.map((t) => end(t.key))) : 0;
}

/** Full-load server-hours of the job: Σ runtime (h) × power (kW) for 1 kW servers, the backend's billing unit. */
export const serverHours = (tasks: Pick<TaskDraft, "runtimeMin" | "powerKw">[]) => tasks.reduce((a, t) => a + ((Number(t.runtimeMin) || 0) / 60) * (Number(t.powerKw) || 0), 0);

export type Rate = { chfPerServerHour: number | null; basis: "billed" | "between tiers" | "none" };

/**
 * Price per tier. The price list (/admin/settings/pricing) is operator-only, so the estimate uses the rate
 * this buyer was actually billed per tier (/customer/usage: cost ÷ server-hours). A tier without usage gets the
 * midpoint of the other two, labelled as such. This is an estimate, not a quote.
 */
export function ratesFromUsage(usage: UsageRow[] | undefined): Record<Priority, Rate> {
  const sum = new Map<string, { h: number; c: number }>();
  (usage ?? []).forEach((u) => {
    const s = sum.get(u.priority) ?? { h: 0, c: 0 };
    s.h += u.serverHours;
    s.c += u.costChf;
    sum.set(u.priority, s);
  });
  const billed = (p: Priority): number | null => {
    const s = sum.get(p);
    return s && s.h > 0 ? s.c / s.h : null;
  };
  const out = Object.fromEntries(priorities.map((p) => [p, { chfPerServerHour: billed(p), basis: billed(p) == null ? "none" : "billed" }])) as Record<Priority, Rate>;
  const c = out.critical.chfPerServerHour,
    f = out.flexible.chfPerServerHour;
  if (out.normal.chfPerServerHour == null && c != null && f != null) out.normal = { chfPerServerHour: (c + f) / 2, basis: "between tiers" };
  return out;
}

export type Errors = Record<string, string>;

/** Field errors keyed like the backend's 422 details: "name", "deadline", "tasks", "tasks.0.runtimeMin" … */
export function validateJob(d: JobDraft, nowIso: string | null): Errors {
  const e: Errors = {};
  if (!d.name.trim()) e.name = "Give the job a name so you can find it later.";
  if (d.name.length > 120) e.name = "Keep the name under 120 characters.";
  if (!isPriority(d.priority)) e.priority = "Choose Priority, Standard or Flexible.";
  if (!d.tasks.length) e.tasks = "Add at least one task.";
  const keys = new Set<string>();
  d.tasks.forEach((t, i) => {
    const p = `tasks.${i}`;
    if (!t.key.trim()) e[`${p}.key`] = "Give the task an id.";
    else if (keys.has(t.key)) e[`${p}.key`] = `Id ${t.key} is used twice.`;
    keys.add(t.key);
    if (!(Number(t.runtimeMin) > 0)) e[`${p}.runtimeMin`] = "Runtime must be more than 0 minutes.";
    else if (Number(t.runtimeMin) > 7 * 24 * 60) e[`${p}.runtimeMin`] = "Split tasks longer than 7 days.";
    if (!(Number(t.powerKw) > 0)) e[`${p}.powerKw`] = "Power must be more than 0 kW.";
    else if (Number(t.powerKw) > MAX_TASK_KW) e[`${p}.powerKw`] = `The largest server runs ${MAX_TASK_KW} kW. Split the task.`;
    if (!(Number(t.threads) >= 1) || !Number.isInteger(Number(t.threads))) e[`${p}.threads`] = "Threads must be a whole number of 1 or more.";
    const unknown = t.dependsOn.filter((x) => !d.tasks.some((o) => o.key === x));
    if (unknown.length) e[`${p}.dependsOn`] = `Unknown task: ${unknown.join(", ")}.`;
    if (t.dependsOn.includes(t.key)) e[`${p}.dependsOn`] = "A task cannot wait for itself.";
  });
  const cycle = findCycle(d.tasks);
  if (cycle) e.tasks = `These tasks wait for each other in a circle: ${cycle.join(" → ")}. Remove one dependency.`;
  const chain = longestChainMin(d.tasks);
  const minutes = deadlineMinutes(d, nowIso);
  if (minutes == null || !(minutes > 0)) e.deadline = d.deadlineMode === "at" ? "Pick a deadline after the current simulated time." : "The deadline must be more than 0 minutes away.";
  else if (Number.isFinite(chain) && chain > minutes) e.deadline = `The tasks need at least ${Math.ceil(chain)} min one after the other. Allow more time.`;
  return e;
}

/** Minutes from the simulated now to the deadline */
export function deadlineMinutes(d: Pick<JobDraft, "deadlineMode" | "deadlineInMin" | "deadlineAt">, nowIso: string | null): number | null {
  if (d.deadlineMode === "in") return d.deadlineInMin === "" ? null : Number(d.deadlineInMin);
  if (!d.deadlineAt || !nowIso) return null;
  return (Date.parse(zurichLocalToIso(d.deadlineAt, nowIso)) - Date.parse(nowIso)) / 60000;
}

/** "2021-07-17T18:00" in Zurich -> ISO with the same offset as the simulated now ("+02:00") */
export function zurichLocalToIso(local: string, nowIso: string) {
  const off = /([+-]\d\d:\d\d|Z)$/.exec(nowIso)?.[1] ?? "+01:00";
  return `${local.length === 16 ? local + ":00" : local}${off === "Z" ? "+00:00" : off}`;
}

export function toSubmitBody(d: JobDraft, nowIso: string | null): JobSubmitBody {
  return {
    name: d.name.trim(),
    priority: d.priority,
    ...(d.deadlineMode === "in" ? { deadlineInMin: Number(d.deadlineInMin) } : { deadline: zurichLocalToIso(d.deadlineAt, nowIso ?? "") }),
    tasks: d.tasks.map((t) => ({
      taskId: t.key.trim(),
      name: t.name.trim() || t.key.trim(),
      runtimeMin: Number(t.runtimeMin),
      powerKw: Number(t.powerKw),
      threads: Number(t.threads),
      interruptible: t.interruptible,
      dependsOn: t.dependsOn,
    })),
  };
}

/** Map the backend's 422 field paths (snake or camel, dotted or bracketed) onto the form's keys */
export function errorsFromDetails(details: { field: string; message: string }[] | undefined): Errors {
  const e: Errors = {};
  (details ?? []).forEach(({ field, message }) => {
    const k = field
      .replace(/^body\./, "")
      .replace(/\[(\d+)\]/g, ".$1")
      .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
      .replace(/\.taskId$/, ".key");
    e[k] = message;
  });
  return e;
}
