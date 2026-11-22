import { Link } from "react-router-dom";
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDollarSign, Clock3, Flame, ListChecks, Play, Plus } from "lucide-react";
import { useAuth } from "@/app/auth-store";
import { useCustomerOverview, useImpact } from "@/api/queries";
import type { CustomerOverview, Job } from "@/api/types";
import { Button, Card, CardHeader, CheckDraw, EmptyState, HeatPulse, InfoPop, KpiTile, ProgressBar, Quantity, QueryState, Skeleton, StatusChip } from "@/design-system";
import { chf, num } from "@/lib/format";
import { time } from "@/lib/time";
import { useNow } from "@/live/store";
import { cn } from "@/lib/cn";
import { useMyJobs } from "./data";
import { TierChip, TrustLine } from "./ui";

export type Risk = { level: "ok" | "caution" | "missed"; text: string };
export function jobRisk(j: Job, atRisk: string[] | undefined, now: string | null): Risk {
  if (j.status === "missed") return { level: "missed", text: "Missed its deadline" };
  if (j.status === "done") return { level: "ok", text: "Finished" };
  if (j.status === "cancelled") return { level: "ok", text: "Cancelled" };
  const late = j.estimatedFinish && Date.parse(j.estimatedFinish) > Date.parse(j.deadline);
  if (atRisk?.includes(j.id) || late) return { level: "caution", text: "At risk of missing the deadline" };
  const spare = now ? time.minutes(j.estimatedFinish ?? now, j.deadline) : null;
  return { level: "ok", text: spare != null && spare > 0 ? `On track, ${time.duration(spare)} spare` : "On track" };
}

export function RiskText({ risk }: { risk: Risk }) {
  const I = risk.level === "missed" ? AlertOctagon : risk.level === "caution" ? AlertTriangle : CheckCircle2;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", risk.level === "missed" ? "text-critical-ink" : risk.level === "caution" ? "text-dump-ink" : "text-ok-ink")}>
      <I aria-hidden className="h-3.5 w-3.5" />
      {risk.text}
    </span>
  );
}

export function JobCard({ job, atRisk }: { job: Job; atRisk?: string[] }) {
  const now = useNow();
  const running = job.status === "running";
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/compute/jobs?job=${job.id}`} className="text-md font-semibold hover:underline">
            {job.name}
          </Link>
          <p className="mt-0.5 font-mono text-xs text-ink-3">
            {job.id}, submitted {time.dayTime(job.submittedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <TierChip priority={job.priority} />
          <StatusChip kind="job" value={job.status} size="sm" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1">
          <ProgressBar value={job.progressPct} running={running} tone={job.status === "done" ? "ok" : job.status === "missed" ? "critical" : "heat"} size="lg" label={`${job.name} progress`} />
        </div>
        {job.status === "done" ? <CheckDraw /> : null}
        <span className="w-12 text-right text-md tnum">{num(job.progressPct, 0)}%</span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm max-sm:grid-cols-1">
        <div>
          <dt className="text-xs text-ink-3">Deadline</dt>
          <dd className="tnum">
            {time.dayTime(job.deadline)}
            {now && <span className="block text-xs text-ink-3">{time.relative(job.deadline, now)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Estimated finish</dt>
          <dd className="tnum">{job.estimatedFinish ? time.dayTime(job.estimatedFinish) : "–"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Deadline risk</dt>
          <dd>
            <RiskText risk={jobRisk(job, atRisk, now)} />
          </dd>
        </div>
      </dl>
    </Card>
  );
}

const tilesSkeleton = (
  <div className="grid grid-cols-5 gap-4 max-xl:grid-cols-3 max-md:grid-cols-2">
    {Array.from({ length: 5 }, (_, i) => (
      <Card key={i} className="flex flex-col gap-3 p-5">
        <Skeleton className="w-24" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="w-16" />
      </Card>
    ))}
  </div>
);

function Tiles({ o, running, queuedArrived, notYetArrived }: { o: CustomerOverview; running: number; queuedArrived: number | null; notYetArrived: number }) {
  const riskTone = o.jobsMissed > 0 ? "critical" : o.jobsAtRisk.length ? "dump" : "ok";
  return (
    <div className="grid grid-cols-5 gap-4 max-xl:grid-cols-3 max-md:grid-cols-2">
      <Card className="p-5">
        <KpiTile label="Running jobs" icon={Play} tone="heat" value={running} decimals={0} unit="jobs" period="right now" />
      </Card>
      <Card className="p-5">
        <KpiTile label="Queued" icon={Clock3} value={queuedArrived} decimals={0} unit="jobs" period="waiting to start" footer={notYetArrived > 0 ? <InfoPop label="Jobs scheduled later">{`${num(notYetArrived, 0)} more jobs of yours are scheduled to arrive later in the simulated year. They are not counted here.`}</InfoPop> : null} />
      </Card>
      <Card className="p-5">
        <KpiTile label="Done" icon={ListChecks} tone="ok" value={o.jobsDone} decimals={0} unit="jobs" period="since the run started" />
      </Card>
      <Card className="p-5">
        <KpiTile label="Spend" icon={CircleDollarSign} value={o.spendMonthChf} decimals={2} unit="CHF" period="this month so far" />
      </Card>
      <Card className="p-5">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-2">Deadline risk</span>
          <span className={cn("text-lg font-medium", riskTone === "critical" ? "text-critical-ink" : riskTone === "dump" ? "text-dump-ink" : "text-ok-ink")}>
            {o.jobsMissed > 0 ? `${o.jobsMissed} missed` : o.jobsAtRisk.length ? `${o.jobsAtRisk.length} at risk` : "On track"}
          </span>
          <span className="text-xs text-ink-3">{o.jobsMissed > 0 ? `${o.jobsAtRisk.length} more at risk` : "of your open jobs"}</span>
        </div>
      </Card>
    </div>
  );
}

export default function Overview() {
  const user = useAuth((s) => s.user);
  const overview = useCustomerOverview();
  const impact = useImpact();
  const my = useMyJobs();
  const now = useNow();
  const open = my.jobs.filter((j) => j.status === "running" || j.status === "queued");
  const live = my.jobs.filter((j) => j.status === "running");
  const recent = my.jobs.filter((j) => j.status === "done" || j.status === "missed").slice(0, 5);
  const hour = now ? Number(time.hm(now).slice(0, 2)) : 12;
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-light tracking-tight">
            {greeting}, {user?.name}
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {!my.timeKnown ? "Connecting to the scheduler…" : live.length ? `${live.length} ${live.length === 1 ? "job is" : "jobs are"} running on Swiss-hosted servers.` : "No job is running right now."}{" "}
            {open.length - live.length > 0 ? `${open.length - live.length} waiting to start.` : ""}
          </p>
        </div>
        <TrustLine />
      </div>

      <QueryState query={overview} skeleton={tilesSkeleton}>
        {(o) => <Tiles o={o} running={live.length} queuedArrived={my.timeKnown ? my.jobs.filter((j) => j.status === "queued").length : null} notYetArrived={my.notYetArrived} />}
      </QueryState>

      <Card className="flex items-start gap-4 border-heat/25 bg-heat/5 p-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ctl bg-heat/15 text-heat-ink">
          <Flame aria-hidden className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Your compute does two jobs at once.</p>
          <p className="mt-0.5 text-sm text-ink-2">The electricity your workloads use comes back as hot water for host businesses in Basel. Flexible jobs run where heat is needed, which is why they cost least.</p>
        </div>
        <Link to="/compute/impact" className="shrink-0 max-sm:hidden">
          <Button size="sm">See your impact</Button>
        </Link>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-6 max-xl:grid-cols-1">
        <section aria-labelledby="your-jobs" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 id="your-jobs" className="text-md font-semibold">
              Your jobs
            </h2>
            <Link to="/compute/jobs" className="text-sm font-medium text-accent hover:underline">
              All jobs
            </Link>
          </div>
          {my.isPending || !my.timeKnown ? (
            <div className="flex flex-col gap-3">
              {[0, 1].map((i) => (
                <Card key={i} className="flex flex-col gap-3 p-5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-2.5 w-full" />
                  <Skeleton className="w-2/3" />
                </Card>
              ))}
            </div>
          ) : open.length === 0 ? (
            <Card>
              <EmptyState
                icon={ListChecks}
                title="No job is running or waiting"
                body="Submit a job and follow it here as the scheduler places it where heat is needed."
                action={
                  <Link to="/compute/submit">
                    <Button variant="primary" icon={Plus}>
                      Submit a job
                    </Button>
                  </Link>
                }
              />
            </Card>
          ) : (
            open.slice(0, 4).map((j) => <JobCard key={j.id} job={j} atRisk={overview.data?.jobsAtRisk} />)
          )}
        </section>

        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <CardHeader title="Heat enabled" sub="share of reused fleet heat associated with your workloads" />
            <QueryState query={impact} skeleton={<Skeleton className="mt-4 h-8 w-32" />}>
              {(i) => (
                <div className="mt-4 flex flex-col gap-4">
                  <Quantity value={i.heatDeliveredKwh} unit="kWh" period="since the run started" size="xl" decimals={0} />
                  <HeatPulse on={live.length > 0} load={Math.min(1, live.length / 6)} label={live.length ? "heat flows while your jobs run" : "no job running now"} />
                  <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
                    <div>
                      <dt className="text-xs text-ink-3">Host businesses heated</dt>
                      <dd className="tnum">{num(i.sitesHeated, 0)} sites</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Fleet heat reused</dt>
                      <dd className="tnum">{i.heatReusedSharePct == null ? "–" : `${num(i.heatReusedSharePct, 1)} %`}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </QueryState>
          </Card>
          <Card className="p-5">
            <CardHeader title="Recently finished" />
            {recent.length === 0 ? (
              <p className="mt-3 text-sm text-ink-3">Finished jobs appear here.</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-line">
                {recent.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <Link to={`/compute/jobs?job=${j.id}`} className="block truncate text-sm font-medium hover:underline">
                        {j.name}
                      </Link>
                      <span className="text-xs text-ink-3">
                        {j.status === "missed" ? "Missed deadline" : "Finished"}, submitted {time.dayTime(j.submittedAt)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tnum">{chf(j.costChf, 2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
