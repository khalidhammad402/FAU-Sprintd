/** Pause / resume / cancel with an optimistic update of every loaded task list and a rollback on error. */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api/adapters";
import type { Page, Task } from "@/api/types";
import { applyAction } from "./taskModel";

type Action = "pause" | "resume" | "cancel";
const TASKS = ["admin", "tasks"] as const;

export function useTaskAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ task, action }: { task: Task; action: Action }) => adminApi.taskAction(task.id, action),
    onMutate: async ({ task, action }) => {
      await qc.cancelQueries({ queryKey: TASKS });
      const snapshot = qc.getQueriesData<Page<Task>>({ queryKey: TASKS });
      const next = applyAction(task, action);
      qc.setQueriesData<Page<Task>>({ queryKey: TASKS }, (p) => (p?.items ? { ...p, items: p.items.map((t) => (t.id === task.id ? next : t)) } : p));
      qc.setQueryData(["admin", "task", task.id], (t: Task | undefined) => (t ? { ...t, ...next } : t));
      return { snapshot };
    },
    onError: (_e, { task }, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      void qc.invalidateQueries({ queryKey: ["admin", "task", task.id] });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: TASKS });
      void qc.invalidateQueries({ queryKey: ["admin", "jobs"] });
    },
  });
}

export const actionCopy: Record<Action, { title: (id: string) => string; body: string; confirm: string; danger?: boolean }> = {
  pause: {
    title: (id) => `Pause ${id}?`,
    body: "The task stops producing heat and keeps its progress. It stays paused until an operator resumes it. Its deadline does not move.",
    confirm: "Pause task",
  },
  resume: { title: (id) => `Resume ${id}?`, body: "The scheduler may run this task again from the next slot.", confirm: "Resume task" },
  cancel: {
    title: (id) => `Cancel ${id}?`,
    body: "The task stops and cannot be resumed. Work done so far is billed. Tasks that depend on it will not start.",
    confirm: "Cancel task",
    danger: true,
  },
};
