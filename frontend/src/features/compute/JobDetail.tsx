import { useState } from "react";
import { X, XCircle } from "lucide-react";
import { ApiError } from "@/api/client";
import { useCustomerJob, useCustomerJobTasks, useCustomerMutations } from "@/api/queries";
import { Button, Card, CheckDraw, ConfirmDialog, ErrorState, IconButton, ProgressBar, Skeleton, StatusChip, TaskGraph, Timeline } from "@/design-system";
import { chf, kwh, num, sum } from "@/lib/format";
import { time } from "@/lib/time";
import { useChannels } from "@/live/LiveProvider";
import { useNow } from "@/live/store";
import { useLiveOwnJobs } from "./data";
import { jobRisk, RiskText } from "./Overview";
import { buyerTimeline, TierChip } from "./ui";

export function JobDetail({ id, atRisk, onClose }: { id: string; atRisk?: string[]; onClose: () => void }) {
  useChannels([`job:${id}`]);
  const now = useNow();
  const job = useCustomerJob(id);
  const tasks = useCustomerJobTasks(id);
  const live = useLiveOwnJobs()[id];
  const { cancel } = useCustomerMutations();
  const [confirm, setConfirm] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (job.isPending)
    return (
      <Card className="flex flex-col gap-4 p-5" aria-busy="true">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  if (job.isError || !job.data)
    return (
      <Card>
        <ErrorState compact error={job.error} title={job.error instanceof ApiError && job.error.status === 404 ? "This job is not in your account" : "This job could not be loaded"} onRetry={() => void job.refetch()} />
      </Card>
    );
  const j = live ? { ...job.data, ...live, progressPct: Math.max(job.data.progressPct, live.progressPct) } : job.data;
  const t = tasks.data ?? job.data.tasks ?? [];
  const open = j.status === "running" || j.status === "queued";
  return (
    <Card className="flex flex-col gap-5 p-5" aria-labelledby={`job-${j.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`job-${j.id}`} className="text-md font-semibold">
            {j.name}
          </h2>
          <p className="font-mono text-xs text-ink-3">{j.id}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <TierChip priority={j.priority} />
            <StatusChip kind="job" value={j.status} size="sm" />
          </div>
        </div>
        <IconButton icon={X} label="Close job details" onClick={onClose} />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <ProgressBar value={j.progressPct} running={j.status === "running"} size="lg" tone={j.status === "done" ? "ok" : j.status === "missed" ? "critical" : "heat"} label="Job progress" />
        </div>
        {j.status === "done" && <CheckDraw />}
        <span className="w-12 text-right text-md tnum">{num(j.progressPct, 0)}%</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-ink-3">Submitted</dt>
          <dd className="tnum">{time.dayTime(j.submittedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Deadline</dt>
          <dd className="tnum">{time.dayTime(j.deadline)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Estimated finish</dt>
          <dd className="tnum">{j.estimatedFinish ? time.dayTime(j.estimatedFinish) : "–"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Deadline risk</dt>
          <dd>
            <RiskText risk={jobRisk(j, atRisk, now)} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Cost so far</dt>
          <dd className="tnum">{chf(j.costChf, 2)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Heat delivered to host businesses</dt>
          <dd className="tnum">{t.length ? kwh(sum(t, (x) => x.heatDeliveredKwh), 2) : "–"}</dd>
        </div>
      </dl>
      <section>
        <h3 className="mb-2 text-sm font-semibold">
          Tasks <span className="text-ink-3 tnum">{t.length || j.taskIds.length}</span>
        </h3>
        {tasks.isPending && !t.length ? <Skeleton className="h-20 w-full" /> : <TaskGraph tasks={t} />}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Activity</h3>
        <div className="max-h-72 overflow-y-auto pr-1 scrollbar-thin">
          <Timeline items={buyerTimeline(t)} showDay empty="Nothing has happened yet. The job waits for its start time." />
        </div>
      </section>
      {open && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button variant="danger" icon={XCircle} onClick={() => setConfirm(true)}>
            Cancel job
          </Button>
          {cancelError && (
            <span role="alert" className="text-sm text-critical-ink">
              {cancelError}
            </span>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Cancel ${j.name}?`}
        body="Tasks that have not finished stop and cannot be resumed. Work already done is billed."
        confirmLabel="Cancel job"
        cancelLabel="Keep the job"
        danger
        busy={cancel.isPending}
        onConfirm={async () => {
          setCancelError(null);
          try {
            await cancel.mutateAsync(j.id);
            await job.refetch();
          } catch (e) {
            setCancelError(e instanceof Error ? e.message : "The job could not be cancelled.");
          } finally {
            setConfirm(false);
          }
        }}
      />
    </Card>
  );
}
