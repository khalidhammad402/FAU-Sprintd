/** Customers: compute buyers with spend, running work and deadline risk. Row drills into their tasks. */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, Check, CircleDollarSign, ListChecks, Play, Users } from "lucide-react";
import { adminApi } from "@/api/adapters";
import { qk, useCustomers } from "@/api/queries";
import type { Customer, Job } from "@/api/types";
import { Card, Chip, DataTable, EmptyState, ErrorState, KpiTile, Skeleton, type Column } from "@/design-system";
import { num } from "@/lib/format";
import { time } from "@/lib/time";
import { OpsPage } from "../OpsShell";

type Row = Customer & { running: number | null; missed: number | null; atRisk: number | null; queued: number | null };

/** A running job is at risk when its estimated finish is less than an hour before the deadline. */
export const jobAtRisk = (j: Pick<Job, "estimatedFinish" | "deadline">) => !!j.estimatedFinish && time.minutes(j.estimatedFinish, j.deadline) < 60;

function Risk({ r }: { r: Row }) {
  if (r.missed == null || r.atRisk == null) return <Skeleton className="w-20" />;
  if (r.missed)
    return (
      <Chip tone="critical" icon={AlertOctagon} size="sm">
        {`${r.missed} missed`}
      </Chip>
    );
  if (r.atRisk)
    return (
      <Chip tone="dump" icon={AlertTriangle} size="sm">
        {`${r.atRisk} at risk`}
      </Chip>
    );
  return (
    <Chip tone="ok" icon={Check} size="sm">
      On track
    </Chip>
  );
}

export default function CustomersPage() {
  const nav = useNavigate();
  const customers = useCustomers();
  const ids = customers.data?.map((c) => c.id) ?? [];
  const per = useQueries({
    queries: ids.flatMap((id) =>
      (["running", "missed", "queued"] as const).map((status) => ({
        queryKey: qk.admin.jobs({ customerId: id, status, limit: status === "running" ? 200 : 1 }),
        queryFn: () => adminApi.jobs({ customerId: id, status, limit: status === "running" ? 200 : 1 }),
      })),
    ),
  });
  const perAt = per.map((q) => q.dataUpdatedAt).join();
  const rows: Row[] = useMemo(
    () =>
      (customers.data ?? []).map((c, i) => {
        const [run, miss, queue] = per.slice(i * 3, i * 3 + 3);
        return {
          ...c,
          running: run?.data?.total ?? null,
          atRisk: run?.data ? run.data.items.filter(jobAtRisk).length : null,
          missed: miss?.data?.total ?? null,
          queued: queue?.data?.total ?? null,
        };
      }),
    [customers.data, perAt], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const total = (k: keyof Row) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

  const columns: Column<Row>[] = [
    {
      key: "name",
      label: "Compute buyer",
      render: (r) => (
        <span>
          <span className="block font-medium">{r.name}</span>
          <span className="font-mono text-2xs text-ink-3">{r.id}</span>
        </span>
      ),
    },
    { key: "revenueChf", label: "Spend, since run start", num: true, render: (r) => `${num(r.revenueChf, 0)} CHF` },
    { key: "jobs", label: "Jobs, whole year", num: true, render: (r) => num(r.jobs, 0) },
    { key: "running", label: "Running jobs", num: true, render: (r) => (r.running == null ? <Skeleton className="ml-auto w-8" /> : num(r.running, 0)) },
    { key: "tasksRunning", label: "Tasks running", num: true, render: (r) => num(r.tasksRunning, 0) },
    { key: "queued", label: "Queued jobs", num: true, render: (r) => (r.queued == null ? <Skeleton className="ml-auto w-10" /> : num(r.queued, 0)) },
    { key: "risk", label: "Deadline risk", sortValue: (r) => (r.missed ?? 0) * 1000 + (r.atRisk ?? 0), render: (r) => <Risk r={r} /> },
  ];

  return (
    <OpsPage
      title="Customers"
      sub="Compute buyers are the paying side of the platform. Spend counts the compute billed since the start of this run. Select a buyer to see their tasks."
    >
      {customers.isPending ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-4 max-xl:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-48 rounded-card" />
        </div>
      ) : customers.isError ? (
        <ErrorState error={customers.error} onRetry={() => void customers.refetch()} />
      ) : !rows.length ? (
        <EmptyState icon={Users} title="No compute buyers yet" body="Customers appear here with their first submitted job." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-4 max-xl:grid-cols-2">
            <Card className="p-4">
              <KpiTile label="Compute buyers" icon={Users} value={rows.length} decimals={0} period="with jobs this year" />
            </Card>
            <Card className="p-4">
              <KpiTile label="Compute spend" icon={CircleDollarSign} value={total("revenueChf")} decimals={0} unit="CHF" period="since run start" />
            </Card>
            <Card className="p-4">
              <KpiTile label="Running jobs" icon={Play} tone="heat" value={total("running")} decimals={0} period="now" />
            </Card>
            <Card className="p-4">
              <KpiTile label="Missed deadlines" icon={AlertOctagon} tone="critical" value={total("missed")} decimals={0} unit="jobs" period="since run start" />
            </Card>
          </div>
          <DataTable caption="Compute buyers" columns={columns} rows={rows} rowKey={(r) => r.id} initialSort={{ key: "revenueChf", dir: "desc" }} onRow={(r) => nav(`/ops/tasks?fcust=${r.id}`)} />
          <p className="flex items-center gap-1.5 text-xs text-ink-3">
            <ListChecks aria-hidden className="h-3.5 w-3.5" />A running job is at risk when its estimated finish is less than one hour before its deadline.
          </p>
        </div>
      )}
    </OpsPage>
  );
}
