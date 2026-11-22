import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ListChecks, Plus } from "lucide-react";
import { useCustomerOverview } from "@/api/queries";
import type { Job } from "@/api/types";
import { Button, Card, DataTable, EmptyState, ErrorState, FilterChips, ProgressBar, Skeleton, StatusChip, type Column } from "@/design-system";
import { chf, num } from "@/lib/format";
import { time } from "@/lib/time";
import { priorities, tiers } from "@/lib/tiers";
import { useNow } from "@/live/store";
import { useMyJobs } from "./data";
import { JobDetail } from "./JobDetail";
import { jobRisk, RiskText } from "./Overview";
import { TierChip } from "./ui";

export default function MyJobs() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("job");
  const my = useMyJobs({ history: true });
  const overview = useCustomerOverview();
  const now = useNow();
  const [status, setStatus] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const rows = my.jobs.filter((j) => (!status || j.status === status) && (!tier || j.priority === tier));
  const count = (s: string) => my.jobs.filter((j) => j.status === s).length;
  const open = (id: string | null) => setParams((p) => {
    const n = new URLSearchParams(p);
    if (id) n.set("job", id);
    else n.delete("job");
    return n;
  });
  const cols: Column<Job>[] = [
    {
      key: "name",
      label: "Job",
      render: (j) => (
        <span className="block max-w-[260px]">
          <span className="block truncate font-medium">{j.name}</span>
          <span className="font-mono text-2xs text-ink-3">{j.id}</span>
        </span>
      ),
    },
    { key: "priority", label: "Tier", sortValue: (j) => priorities.indexOf(j.priority as never), render: (j) => <TierChip priority={j.priority} /> },
    { key: "status", label: "Status", render: (j) => <StatusChip kind="job" value={j.status} size="sm" /> },
    {
      key: "progressPct",
      label: "Progress",
      width: "160px",
      render: (j) => (
        <span className="flex items-center gap-2">
          <span className="flex-1">
            <ProgressBar value={j.progressPct} running={j.status === "running"} tone={j.status === "done" ? "ok" : j.status === "missed" ? "critical" : "heat"} label={`${j.name} progress`} />
          </span>
          <span className="w-9 text-right text-xs tnum">{num(j.progressPct, 0)}%</span>
        </span>
      ),
    },
    { key: "deadline", label: "Deadline", render: (j) => <span className="tnum">{time.dayTime(j.deadline)}</span> },
    { key: "estimatedFinish", label: "Est. finish", render: (j) => <span className="tnum">{j.estimatedFinish ? time.dayTime(j.estimatedFinish) : "–"}</span> },
    { key: "risk", label: "Deadline risk", sortable: false, render: (j) => <RiskText risk={jobRisk(j, overview.data?.jobsAtRisk, now)} /> },
    { key: "costChf", label: "Cost", num: true, render: (j) => chf(j.costChf, 2) },
  ];
  const table = my.isPending ? (
    <Card className="flex flex-col gap-3 p-5" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </Card>
  ) : my.isError ? (
    <Card>
      <ErrorState error={my.error} onRetry={my.refetch} />
    </Card>
  ) : (
    <DataTable
      caption="Your jobs"
      columns={selected ? cols.filter((c) => c.key !== "estimatedFinish" && c.key !== "risk") : cols}
      rows={rows}
      rowKey={(j) => j.id}
      onRow={(j) => open(j.id === selected ? null : j.id)}
      selectedKey={selected}
      maxHeight="calc(100vh - 260px)"
      empty={
        <EmptyState
          compact
          icon={ListChecks}
          title={my.jobs.length ? "No job matches these filters" : "No jobs yet"}
          body={my.jobs.length ? "Clear a filter to see more jobs." : "Submit your first job to see it scheduled against heat demand."}
          action={
            my.jobs.length ? (
              <Button size="sm" onClick={() => (setStatus(null), setTier(null))}>
                Clear filters
              </Button>
            ) : (
              <Link to="/compute/submit">
                <Button variant="primary" icon={Plus}>
                  Submit a job
                </Button>
              </Link>
            )
          }
        />
      }
    />
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          groups={[
            {
              label: "Status",
              value: status,
              onChange: setStatus,
              options: [
                ["running", "Running"],
                ["queued", "Queued"],
                ["done", "Complete"],
                ["missed", "Missed"],
                ["cancelled", "Cancelled"],
              ].map(([v, l]) => ({ value: v, label: l, count: count(v) })),
            },
            { label: "Tier", value: tier, onChange: setTier, options: priorities.map((p) => ({ value: p, label: tiers[p].label })) },
          ]}
        />
        <p className="text-xs text-ink-3">Running and waiting jobs, and your 30 most recent finished ones.</p>
      </div>
      <div className={selected ? "grid grid-cols-[minmax(0,1fr)_420px] items-start gap-4 max-xl:grid-cols-1" : undefined}>
        {selected && (
          <div className="xl:order-2">
            <JobDetail key={selected} id={selected} atRisk={overview.data?.jobsAtRisk} onClose={() => open(null)} />
          </div>
        )}
        <div className="min-w-0 xl:order-1">{table}</div>
      </div>
    </div>
  );
}
