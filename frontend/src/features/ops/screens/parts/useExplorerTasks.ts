/**
 * The tasks the explorer shows. /admin/tasks is paginated and a simulated year holds ~110,000 tasks, so the
 * explorer loads everything open that matters now (running, paused, ready, the next waiting ones, missed) and
 * the most recent completed ones (last page of the done list).
 */
import { useMemo } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api/adapters";
import { qk, useTaskTypes } from "@/api/queries";
import type { Job, Task } from "@/api/types";
import { taskNameIndex } from "./taskModel";

const LISTS = [
  { state: "running", limit: 200 },
  { state: "paused", limit: 200 },
  { state: "ready", limit: 200 },
  { state: "missed", limit: 200 },
  { state: "cancelled", limit: 100 },
  { state: "waiting", limit: 100 },
] as const;

export function useExplorerTasks(jobId?: string | null) {
  const lists = useQueries({
    queries: LISTS.map((q) => ({ queryKey: qk.admin.tasks(q), queryFn: () => adminApi.tasks(q), placeholderData: keepPreviousData })),
  });
  const doneHead = useQuery({ queryKey: qk.admin.tasks({ state: "done", limit: 1 }), queryFn: () => adminApi.tasks({ state: "done", limit: 1 }) });
  const total = doneHead.data?.total;
  const doneQ = { state: "done", limit: 100, cursor: total != null ? String(Math.max(0, total - 100)) : undefined };
  const done = useQuery({ queryKey: qk.admin.tasks(doneQ), queryFn: () => adminApi.tasks(doneQ), enabled: total != null, placeholderData: keepPreviousData });
  const byJob = useQuery({ queryKey: qk.admin.tasks({ jobId, limit: 200 }), queryFn: () => adminApi.tasks({ jobId: jobId!, limit: 200 }), enabled: !!jobId });
  const types = useTaskTypes();

  const jobLists = useQueries({
    queries: (["running", "queued"] as const).map((status) => ({ queryKey: qk.admin.jobs({ status, limit: 300 }), queryFn: () => adminApi.jobs({ status, limit: 300 }) })),
  });

  // useQueries may hand back the same array object after a cache update, so key the memos on update times
  const listsAt = lists.map((q) => q.dataUpdatedAt).join();
  const jobsAt = jobLists.map((q) => q.dataUpdatedAt).join();
  const tasks = useMemo(() => {
    const m = new Map<string, Task>();
    [...lists.map((q) => q.data), done.data, byJob.data].forEach((p) => p?.items.forEach((t) => m.set(t.id, t)));
    return [...m.values()].filter((t) => !t.filler);
  }, [listsAt, done.data, byJob.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const jobs = useMemo(() => {
    const m = new Map<string, Job>();
    jobLists.forEach((q) => q.data?.items.forEach((j) => m.set(j.id, j)));
    return m;
  }, [jobsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = Object.fromEntries(LISTS.map((l, i) => [l.state, lists[i].data?.total ?? null])) as Record<string, number | null>;
  counts.done = total ?? null;
  const first = lists[0];
  return {
    tasks,
    jobs,
    typeIndex: useMemo(() => taskNameIndex(types.data), [types.data]),
    counts,
    isPending: first.isPending,
    isError: first.isError && !first.data,
    error: first.error,
    refetch: () => lists.forEach((q) => void q.refetch()),
  };
}
