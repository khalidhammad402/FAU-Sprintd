/**
 * Pure helpers for the task explorer. The task list does not carry the customer, so it is resolved from
 * the job (when the job is loaded) or from the job-type catalogue (/admin/task-types): every catalogue task
 * name is unique to one job type and one customer ("train worker 4" -> finetune -> globex).
 */
import type { Job, Task, TaskType } from "@/api/types";
import { time } from "@/lib/time";

export type Bucket = "running" | "paused" | "queued" | "done" | "missed" | "cancelled";

export const bucketOf = (state: string): Bucket =>
  state === "waiting" || state === "ready" ? "queued" : (["running", "paused", "done", "missed", "cancelled"].includes(state) ? state : "queued") as Bucket;

export const isOpen = (state: string) => !["done", "missed", "cancelled"].includes(state);

/** "train worker 4" -> "train worker" */
export const stripIndex = (name: string) => name.replace(/\s+\d+$/, "").trim();

export type TypeInfo = { customer: string; typeId: string; typeName: string };

export function taskNameIndex(types: TaskType[] | undefined): Map<string, TypeInfo> {
  const m = new Map<string, TypeInfo>();
  types?.forEach((t) => t.tasks.forEach((x) => m.set(x.name, { customer: t.customer, typeId: t.id, typeName: t.name })));
  return m;
}

export function customerOfTask(t: Pick<Task, "jobId" | "name">, jobs: Map<string, Job>, idx: Map<string, TypeInfo>): string | null {
  return jobs.get(t.jobId)?.customerId ?? idx.get(stripIndex(t.name))?.customer ?? null;
}

/**
 * Minutes of slack: deadline minus (now + remaining runtime). Negative = late.
 * null for finished tasks or when the deadline or the clock is unknown.
 */
export function slackMin(t: Pick<Task, "state" | "deadline" | "runtimeMin" | "progressPct">, now: string | null): number | null {
  if (!isOpen(t.state) || !t.deadline || !now) return null;
  const remaining = t.runtimeMin * (1 - Math.min(100, Math.max(0, t.progressPct)) / 100);
  return Math.round(time.minutes(now, t.deadline) - remaining);
}

export type RiskLevel = "late" | "risk" | "ok" | null;
export const riskOf = (slack: number | null): RiskLevel => (slack == null ? null : slack < 0 ? "late" : slack < 60 ? "risk" : "ok");

/** Optimistic result of an operator action on a task (the backend answers with the real task). */
export function applyAction(t: Task, action: "pause" | "resume" | "cancel"): Task {
  if (action === "pause") return { ...t, state: "paused", hold: true };
  if (action === "resume") return { ...t, state: t.serverId ? "running" : "ready", hold: false };
  return { ...t, state: "cancelled", hold: false };
}

export function canAct(t: Pick<Task, "state" | "interruptible" | "hold">, action: "pause" | "resume" | "cancel") {
  if (!isOpen(t.state)) return false;
  if (action === "pause") return t.interruptible && t.state !== "paused" && !t.hold;
  if (action === "resume") return t.state === "paused" || t.hold;
  return true;
}
