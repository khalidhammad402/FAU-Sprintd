import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ListChecks, Pause, Play, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api/adapters";
import { ApiError } from "@/api/client";
import { qk, useCustomers, useJob, useTask } from "@/api/queries";
import type { Task } from "@/api/types";
import { useChannels } from "@/live/LiveProvider";
import { useLive, useNow } from "@/live/store";
import { kw, num } from "@/lib/format";
import { tierOf } from "@/lib/tiers";
import { time } from "@/lib/time";
import { Button, ConfirmDialog, Drawer, DrawerClose, EmptyState, eventDetail, ProgressBar, Skeleton, StatusChip, TaskChain, TaskGraph, Timeline } from "@/design-system";
import { useLiveSites, useOpsParams } from "../hooks";
import { Section } from "./panels";

type Action = "pause" | "resume" | "cancel";
const COPY: Record<Action, { title: string; body: string; label: string }> = {
  pause: { title: "Pause this task?", body: "It stops producing heat and keeps its progress. It stays paused until an operator resumes it. Its deadline does not move.", label: "Pause task" },
  resume: { title: "Resume this task?", body: "The scheduler may run it again from the next slot.", label: "Resume task" },
  cancel: { title: "Cancel this task?", body: "It stops and cannot be resumed. Tasks that depend on it will not start.", label: "Cancel task" },
};

/** Task Drawer: chain, progress, placement, effective deadline and slack, dependencies, lifecycle, actions. */
export default function TaskDrawer({ id }: { id: string }) {
  const { set, closeDrawers } = useOpsParams();
  useChannels([`task:${id}`]);
  const q = useTask(id);
  const t = q.data;
  const job = useJob(t?.jobId);
  const customers = useCustomers();
  const { sites } = useLiveSites();
  const now = useNow();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const liveEvents = useLive(useShallow((s) => s.events.filter((e) => e.taskId === id)));

  // optimistic update with rollback
  const act = useMutation({
    mutationFn: (a: Action) => adminApi.taskAction(id, a),
    onMutate: async (a) => {
      setError(null);
      await qc.cancelQueries({ queryKey: qk.admin.task(id) });
      const prev = qc.getQueryData<Task>(qk.admin.task(id));
      if (prev) qc.setQueryData<Task>(qk.admin.task(id), { ...prev, state: a === "pause" ? "paused" : a === "cancel" ? "cancelled" : "ready", hold: a === "pause" });
      return { prev };
    },
    onError: (e, _a, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.admin.task(id), ctx.prev);
      setError(e instanceof ApiError ? e.message : "The action failed. Nothing was changed.");
    },
    onSettled: () => {
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: qk.admin.task(id) });
      void qc.invalidateQueries({ queryKey: ["admin", "tasks"] });
    },
  });

  const events = useMemo(() => {
    const rest = (t?.events ?? []).map((e, i) => ({ key: `r${i}`, time: e.time, kind: e.kind, detail: eventDetail(e), at: Date.parse(e.time) }));
    const restKeys = new Set(rest.map((e) => `${e.kind}@${e.at}`));
    const fresh = liveEvents
      .filter((e) => !restKeys.has(`${e.kind}@${Date.parse(e.time)}`))
      .map((e) => ({ key: e.key, time: e.time, kind: e.kind, detail: eventDetail(e), at: Date.parse(e.time), isNew: Date.now() - e.receivedAt < 2000 }));
    return [...rest, ...fresh].sort((a, b) => b.at - a.at);
  }, [t?.events, liveEvents]);

  const head = (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-ctl bg-surface-3 text-ink-2">
            <ListChecks aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-2xs text-ink-3">{`Task · ${id}`}</p>
            <h2 className="truncate text-lg font-semibold">{t?.name ?? "Task"}</h2>
            {job.data && <p className="truncate text-xs text-ink-2">{`${job.data.name} · ${customers.data?.find((c) => c.id === job.data!.customerId)?.name ?? job.data.customerId}`}</p>}
          </div>
        </div>
        <DrawerClose onClose={closeDrawers} />
      </div>
      {t && (
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusChip kind="task" value={t.state} label={t.hold && t.state === "paused" ? "Paused by operator" : undefined} />
          <span className="inline-flex h-6 items-center rounded-full border border-line-strong px-2.5 text-xs text-ink-2">{tierOf(t.priority).opsLabel}</span>
        </div>
      )}
    </div>
  );
  if (!t)
    return (
      <Drawer label={`Task ${id}`} onClose={closeDrawers} head={head}>
        {q.isPending ? <Skeleton className="h-40" /> : <EmptyState compact title="This task is not known" body="Finished tasks of a reset run are no longer listed." />}
      </Drawer>
    );

  const open = !["done", "missed", "cancelled"].includes(t.state);
  const remainingMin = t.runtimeMin * (1 - t.progressPct / 100);
  const estFinish = open && now ? time.addMinutes(now, remainingMin) : t.finished;
  const slack = open && t.deadline && estFinish ? time.minutes(estFinish, t.deadline) : null;
  const site = sites.find((s) => s.id === t.siteId);
  return (
    <Drawer label={`Task ${id}`} onClose={closeDrawers} head={head}>
      <Section title="Progress">
        <TaskChain task={t} />
        {(t.state === "running" || t.state === "paused") && (
          <div className="mt-4 flex items-center gap-3">
            <ProgressBar size="lg" value={t.progressPct} running={t.state === "running"} tone={t.state === "paused" ? "dump" : "heat"} label="Task progress" />
            <span className="text-sm font-semibold tnum">{num(t.progressPct, 0)} %</span>
          </div>
        )}
      </Section>
      <Section title="Placement and deadline">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-xs text-ink-3">Site</dt>
          <dd className="text-right">
            {site ? (
              <button type="button" className="underline decoration-line-strong underline-offset-4 hover:decoration-ink" onClick={() => set({ task: null, server: null, site: site.id })}>
                {site.name}
              </button>
            ) : (
              <span className="text-ink-3">Not placed</span>
            )}
          </dd>
          <dt className="text-xs text-ink-3">Server</dt>
          <dd className="text-right font-mono">{t.serverId ? <button type="button" className="underline decoration-line-strong underline-offset-4" onClick={() => set({ task: null, server: t.serverId })}>{t.serverId}</button> : "–"}</dd>
          <dt className="text-xs text-ink-3">Power, runtime</dt>
          <dd className="text-right tnum">{`${kw(t.powerKw, 3)} · ${time.duration(t.runtimeMin)}`}</dd>
          <dt className="text-xs text-ink-3">Energy so far</dt>
          <dd className="text-right tnum">{`${num(t.energyKwh, 3)} kWh · ${num(t.heatDeliveredKwh, 3)} kWh heat`}</dd>
          <dt className="text-xs text-ink-3">Effective deadline</dt>
          <dd className="text-right tnum">{time.dayTime(t.deadline)}</dd>
          <dt className="text-xs text-ink-3">{open ? "Estimated finish" : "Finished"}</dt>
          <dd className="text-right tnum">{estFinish ? time.dayTime(estFinish) : "–"}</dd>
          <dt className="text-xs text-ink-3">Slack</dt>
          <dd className={slack != null && slack < 0 ? "text-right font-semibold text-critical-ink tnum" : slack != null && slack < 60 ? "text-right font-semibold text-dump-ink tnum" : "text-right tnum"}>
            {slack == null ? "–" : slack < 0 ? `late by ${time.duration(-slack)}` : time.duration(slack)}
          </dd>
          <dt className="text-xs text-ink-3">Interruptible</dt>
          <dd className="text-right">{t.interruptible ? "Yes, can pause or move" : "No, runs to the end"}</dd>
        </dl>
        <p className="mt-2 text-2xs text-ink-3">Estimated finish assumes the task keeps running from now (simulated time).</p>
      </Section>
      {job.data?.tasks && job.data.tasks.length > 1 && (
        <Section title={`Dependencies in ${job.data.id}`} sub={`${job.data.tasks.length} tasks`}>
          <TaskGraph tasks={job.data.tasks} selected={t.id} onSelect={(x) => set({ task: x.id })} />
        </Section>
      )}
      <Section title="Lifecycle">
        <Timeline showDay items={events} empty="Waiting for its dependencies. Nothing has happened yet." />
      </Section>
      {open && (
        <Section title="Actions">
          <div className="flex flex-wrap gap-2">
            {t.state === "paused" || t.hold ? (
              <Button icon={Play} onClick={() => setConfirm("resume")}>
                Resume
              </Button>
            ) : (
              <Button icon={Pause} disabled={!t.interruptible} title={t.interruptible ? undefined : "Not interruptible"} onClick={() => setConfirm("pause")}>
                Pause
              </Button>
            )}
            <Button variant="danger" icon={X} onClick={() => setConfirm("cancel")}>
              Cancel task
            </Button>
          </div>
          {!t.interruptible && <p className="mt-2 text-xs text-ink-3">Critical, non-interruptible work cannot be paused. It can only be cancelled.</p>}
          {error && (
            <p role="alert" className="mt-2 text-sm text-critical-ink">
              {error}
            </p>
          )}
        </Section>
      )}
      {confirm && (
        <ConfirmDialog
          open
          title={COPY[confirm].title}
          body={COPY[confirm].body}
          confirmLabel={COPY[confirm].label}
          danger={confirm === "cancel"}
          busy={act.isPending}
          onConfirm={() => act.mutate(confirm)}
          onOpenChange={(o) => !o && setConfirm(null)}
        />
      )}
    </Drawer>
  );
}
