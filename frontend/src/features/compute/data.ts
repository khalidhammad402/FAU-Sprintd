/** Data hooks of the Compute Portal: REST lists merged with live job.update pushes. */
import { useMemo } from "react";
import { useAuth } from "@/app/auth-store";
import { useCustomerJobs, useUsage } from "@/api/queries";
import type { Job } from "@/api/types";
import { useLive, useNow } from "@/live/store";
import { ratesFromUsage } from "./jobForm";

/**
 * The backend broadcasts every job.update on the shared `customer` channel (docs/gaps/compute.md #1),
 * so keep only this buyer's jobs before showing anything.
 */
export function useLiveOwnJobs(): Record<string, Job> {
  const me = useAuth((s) => s.user?.id);
  const all = useLive((s) => s.jobs);
  return useMemo(() => Object.fromEntries(Object.entries(all).filter(([, j]) => j.customerId === me)), [all, me]);
}

/** A job only counts as queued once its submission time has passed in simulated time. */
export const hasArrived = (j: Job, now: string | null) => !!now && Date.parse(j.submittedAt) <= Date.parse(now);

const rank: Record<string, number> = { running: 0, queued: 1, missed: 2, done: 3, cancelled: 4 };

/**
 * Jobs worth showing: everything running, queued jobs that have arrived, and the most recent finished ones.
 * The list endpoint pages oldest first and the year holds ~23,000 jobs, so the newest finished jobs come from
 * the last page (cursor = offset).
 */
export function useMyJobs() {
  const now = useNow();
  const running = useCustomerJobs({ status: "running", limit: 200 });
  const queued = useCustomerJobs({ status: "queued", limit: 200 });
  const missed = useCustomerJobs({ status: "missed", limit: 200 });
  const doneHead = useCustomerJobs({ status: "done", limit: 1 });
  const doneTotal = doneHead.data?.total ?? 0;
  const doneTail = useCustomerJobs(doneHead.data ? { status: "done", limit: 30, cursor: String(Math.max(0, doneTotal - 30)) } : { status: "done", limit: 1 });
  const live = useLiveOwnJobs();
  const jobs = useMemo(() => {
    const map = new Map<string, Job>();
    [running.data, queued.data, missed.data, doneTail.data].forEach((p) => p?.items.forEach((j) => map.set(j.id, j)));
    for (const j of Object.values(live)) {
      const prev = map.get(j.id);
      // a push is newer than the list, but never move progress backward
      map.set(j.id, prev ? { ...prev, ...j, progressPct: Math.max(prev.progressPct, j.progressPct) } : j);
    }
    return [...map.values()]
      .filter((j) => j.status !== "queued" || hasArrived(j, now))
      .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (a.status === "running" || a.status === "queued" ? a.deadline.localeCompare(b.deadline) : b.submittedAt.localeCompare(a.submittedAt)));
  }, [running.data, queued.data, missed.data, doneTail.data, live, now]);
  const notYetArrived = (queued.data?.items ?? []).filter((j) => !hasArrived(j, now)).length + Math.max(0, (queued.data?.total ?? 0) - (queued.data?.items.length ?? 0));
  return {
    jobs,
    notYetArrived,
    /** false until the first push tells us the simulated time */
    timeKnown: !!now,
    isPending: running.isPending && queued.isPending,
    isError: running.isError && queued.isError,
    error: running.error ?? queued.error,
    refetch: () => {
      void running.refetch();
      void queued.refetch();
      void doneTail.refetch();
    },
  };
}

/** Billed CHF per server-hour per tier, from this buyer's own usage */
export function useRates() {
  const usage = useUsage();
  return { rates: useMemo(() => ratesFromUsage(usage.data), [usage.data]), isPending: usage.isPending };
}
