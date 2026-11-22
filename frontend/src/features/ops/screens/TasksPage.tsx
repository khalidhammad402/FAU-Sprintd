/** Jobs and Tasks: filterable task explorer. Row opens the task drawer (?task=). Pause, resume, cancel with confirm. */
import { useMemo, useState } from "react";
import { AlertTriangle, AlertOctagon, ChevronsUp, ChevronUp, ListChecks, Pause, Play, Shuffle, X } from "lucide-react";
import { useCustomers, useSites } from "@/api/queries";
import type { Task } from "@/api/types";
import { Button, ConfirmDialog, DataTable, EmptyState, FilterChips, IconButton, ProgressBar, Skeleton, StatusChip, TaskChain, type Column } from "@/design-system";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";
import { time } from "@/lib/time";
import { tierOf } from "@/lib/tiers";
import { useLive, useNow } from "@/live/store";
import { OpsPage } from "../OpsShell";
import { useOpsParams } from "../hooks";
import { bucketOf, canAct, customerOfTask, riskOf, slackMin, type Bucket } from "./parts/taskModel";
import { useExplorerTasks } from "./parts/useExplorerTasks";
import { actionCopy, useTaskAction } from "./parts/useTaskAction";

type Row = Task & { customer: string | null; bucket: Bucket; slack: number | null };
type Action = "pause" | "resume" | "cancel";
const prioIcon = { critical: ChevronsUp, normal: ChevronUp, flexible: Shuffle } as const;
const STATUS: [Bucket, string][] = [
  ["running", "Running"],
  ["paused", "Paused"],
  ["queued", "Queued"],
  ["done", "Complete"],
  ["missed", "Missed"],
  ["cancelled", "Cancelled"],
];

function Slack({ v }: { v: number | null }) {
  const r = riskOf(v);
  if (v == null) return <span className="text-ink-3">–</span>;
  if (r === "ok") return <span className="text-ink-2">{time.duration(v)}</span>;
  const I = r === "late" ? AlertOctagon : AlertTriangle;
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", r === "late" ? "text-critical-ink" : "text-dump-ink")}>
      <I aria-hidden className="h-3.5 w-3.5" />
      {r === "late" ? `late ${time.duration(-v)}` : time.duration(v)}
    </span>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="mb-4 flex gap-2">
        {[90, 70, 110, 80, 96].map((w) => (
          <Skeleton key={w} className="h-7 rounded-full" />
        ))}
      </div>
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-line py-3">
          <Skeleton className="w-20" />
          <Skeleton className="w-48" />
          <Skeleton className="w-24" />
          <span className="flex-1" />
          <Skeleton className="w-32" />
        </div>
      ))}
    </div>
  );
}

export default function TasksPage() {
  const { get, set } = useOpsParams();
  const now = useNow();
  const epoch = useLive((s) => s.epoch);
  const job = get("job");
  const data = useExplorerTasks(job);
  const customers = useCustomers();
  const sites = useSites();
  const act = useTaskAction();
  const [confirm, setConfirm] = useState<{ task: Task; action: Action } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const f = { cust: get("fcust"), prio: get("fprio"), status: get("fstatus"), site: get("fsite") };

  const rows: Row[] = useMemo(
    () =>
      data.tasks
        .map((t) => ({ ...t, customer: customerOfTask(t, data.jobs, data.typeIndex), bucket: bucketOf(t.state), slack: slackMin(t, now) }))
        .filter(
          (t) =>
            (!job || t.jobId === job) && (!f.cust || t.customer === f.cust) && (!f.prio || t.priority === f.prio) && (!f.status || t.bucket === f.status) && (!f.site || t.siteId === f.site),
        ),
    // epoch: a jump or reset makes old rows meaningless
    [data.tasks, data.jobs, data.typeIndex, now, job, f.cust, f.prio, f.status, f.site, epoch], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const custName = (id: string | null) => customers.data?.find((c) => c.id === id)?.name ?? id ?? "–";
  const siteName = (id: string | null) => sites.data?.find((s) => s.id === id)?.name ?? id ?? "–";
  const count = (fn: (t: Row) => boolean) => data.tasks.map((t) => ({ ...t, bucket: bucketOf(t.state) }) as Row).filter(fn).length;

  const columns: Column<Row>[] = [
    {
      key: "id",
      label: "Task",
      render: (t) => (
        <span className="block leading-tight">
          <span className="block font-medium">{t.name}</span>
          <span className="font-mono text-2xs text-ink-3">{t.id}</span>
        </span>
      ),
    },
    { key: "customer", label: "Customer", sortValue: (t) => custName(t.customer), render: (t) => <span className="text-ink-2">{custName(t.customer)}</span> },
    {
      key: "priority",
      label: "Priority",
      render: (t) => {
        const I = prioIcon[t.priority as keyof typeof prioIcon] ?? ChevronUp;
        return (
          <span className="inline-flex items-center gap-1.5 text-ink-2">
            <I aria-hidden className="h-3.5 w-3.5" />
            {tierOf(t.priority).opsLabel}
          </span>
        );
      },
    },
    { key: "state", label: "Status", sortValue: (t) => t.bucket, render: (t) => <StatusChip kind="task" value={t.state} size="sm" label={t.hold && t.state === "paused" ? "Paused by operator" : undefined} /> },
    {
      key: "chain",
      label: "Lifecycle",
      sortable: false,
      width: "96px",
      render: (t) => (
        <span className="block w-24">
          <TaskChain task={t} compact />
        </span>
      ),
    },
    {
      key: "progressPct",
      label: "Progress",
      width: "110px",
      render: (t) => (
        <span className="flex items-center gap-2">
          <span className="w-14">
            <ProgressBar value={t.progressPct} running={t.state === "running"} tone={t.state === "done" ? "ok" : t.state === "paused" ? "dump" : t.state === "missed" ? "critical" : "heat"} label={`${t.id} progress`} />
          </span>
          <span className="tnum text-xs text-ink-2">{num(t.progressPct, 0)} %</span>
        </span>
      ),
    },
    { key: "siteId", label: "Site", sortValue: (t) => siteName(t.siteId), render: (t) => <span className="text-ink-2">{t.siteId ? siteName(t.siteId) : "Not placed"}</span> },
    { key: "deadline", label: "Deadline", num: true, render: (t) => <span className="text-ink-2">{time.dayTime(t.deadline).replace(/^\w+ /, "")}</span> },
    { key: "slack", label: "Slack", num: true, render: (t) => <Slack v={t.slack} /> },
    {
      key: "act",
      label: "Actions",
      sortable: false,
      render: (t) => (
        <span className="flex gap-0.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {canAct(t, "resume") ? (
            <IconButton size="sm" icon={Play} label={`Resume ${t.id}`} onClick={() => setConfirm({ task: t, action: "resume" })} />
          ) : (
            <IconButton size="sm" icon={Pause} label={t.interruptible ? `Pause ${t.id}` : `${t.id} cannot be paused`} disabled={!canAct(t, "pause")} className="disabled:opacity-30" onClick={() => setConfirm({ task: t, action: "pause" })} />
          )}
          <IconButton size="sm" icon={X} label={`Cancel ${t.id}`} disabled={!canAct(t, "cancel")} className="disabled:opacity-30" onClick={() => setConfirm({ task: t, action: "cancel" })} />
        </span>
      ),
    },
  ];

  const clear = () => set({ fcust: null, fprio: null, fstatus: null, fsite: null, job: null });
  const copy = confirm ? actionCopy[confirm.action] : null;
  return (
    <OpsPage
      title="Jobs and tasks"
      sub="Every task the scheduler knows: what runs where, its deadline and its slack. Select a row for the lifecycle, dependencies and actions."
      actions={<span className="text-xs tnum text-ink-3">{`${rows.length} shown. ${num(data.counts.waiting, 0)} waiting and ${num(data.counts.done, 0)} completed in this run.`}</span>}
    >
      {data.isPending ? (
        <TableSkeleton />
      ) : data.isError ? (
        <EmptyState icon={ListChecks} title="Tasks could not be loaded" body="The server did not answer. Nothing was changed." action={<Button onClick={data.refetch}>Try again</Button>} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-line bg-surface p-4">
            <FilterChips
              groups={[
                { label: "Customer", value: f.cust, onChange: (v) => set({ fcust: v }), options: (customers.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
                { label: "Priority", value: f.prio, onChange: (v) => set({ fprio: v }), options: (["critical", "normal", "flexible"] as const).map((p) => ({ value: p, label: tierOf(p).opsLabel, count: count((t) => t.priority === p) })) },
                { label: "Status", value: f.status, onChange: (v) => set({ fstatus: v }), options: STATUS.map(([v, l]) => ({ value: v, label: l, count: count((t) => t.bucket === v) })) },
                { label: "Site", value: f.site, onChange: (v) => set({ fsite: v }), options: (sites.data ?? []).map((s) => ({ value: s.id, label: s.name })) },
              ]}
            />
            {job && (
              <p className="mt-3 flex items-center gap-2 text-sm text-ink-2">
                Showing the tasks of job <span className="font-mono text-xs text-ink">{job}</span>
                <Button size="sm" variant="ghost" onClick={() => set({ job: null })}>
                  Show all jobs
                </Button>
              </p>
            )}
          </div>
          {failed && (
            <p role="alert" className="rounded-card border border-critical/40 bg-critical/10 px-4 py-2 text-sm text-critical-ink">
              {failed}
            </p>
          )}
          <DataTable
            caption="Tasks"
            columns={columns}
            rows={rows}
            rowKey={(t) => t.id}
            onRow={(t) => set({ task: t.id })}
            selectedKey={get("task")}
            initialSort={{ key: "state", dir: "desc" }}
            maxHeight="calc(100vh - 300px)"
            empty={<EmptyState compact title="No tasks match these filters" body="Remove a filter to see more tasks." action={<Button size="sm" onClick={clear}>Clear filters</Button>} />}
          />
          <p className="text-xs text-ink-3">Lists the open tasks, the next 100 waiting ones and the 100 most recent completed ones. Slack is the deadline minus the remaining runtime, from the simulated time.</p>
        </div>
      )}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm && copy ? copy.title(confirm.task.id) : ""}
        body={copy?.body}
        confirmLabel={copy?.confirm ?? ""}
        danger={copy?.danger}
        busy={act.isPending}
        onConfirm={() => {
          if (!confirm) return;
          setFailed(null);
          act.mutate(confirm, { onError: (e) => setFailed(`${copy?.confirm ?? "Action"} failed: ${e instanceof Error ? e.message : "unknown error"}. The task was put back as it was.`) });
          setConfirm(null);
        }}
      />
    </OpsPage>
  );
}
