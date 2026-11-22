/** Pieces of the Scheduler Lab: algorithm comparison, simulation runs, assumptions. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FlaskConical, Play } from "lucide-react";
import { adminApi } from "@/api/adapters";
import { qk, useAssumptions, useResults } from "@/api/queries";
import type { Results } from "@/api/types";
import { AssumptionPill, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, Skeleton, StatusChip, type Column } from "@/design-system";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";
import { time } from "@/lib/time";

type Fleet = Results["fleet"];
type Metric = { key: keyof Fleet; label: string; unit: string; d: number; better: "higher" | "lower" };
export const METRICS: Metric[] = [
  { key: "coveragePct", label: "Heat coverage", unit: "%", d: 1, better: "higher" },
  { key: "dumpedKwh", label: "Heat dumped", unit: "kWh", d: 0, better: "lower" },
  { key: "unmetKwh", label: "Unmet demand, backup heat", unit: "kWh", d: 0, better: "lower" },
  { key: "missedDeadlinesPct", label: "Missed deadlines", unit: "%", d: 2, better: "lower" },
  { key: "breakEvenChfPerServerHour", label: "Break-even", unit: "CHF/server-h", d: 3, better: "lower" },
  { key: "migrations", label: "Migrations between servers", unit: "moves", d: 0, better: "lower" },
];

/** Which algorithm is better on one metric, or null when they tie or a value is missing. */
export function winner(m: Metric, g: number | null | undefined, p: number | null | undefined): "greedy" | "mpc" | null {
  if (g == null || p == null || !Number.isFinite(g) || !Number.isFinite(p)) return null;
  if (Math.abs(g - p) < Math.pow(10, -m.d) / 2) return null;
  return (m.better === "higher" ? g > p : g < p) ? "greedy" : "mpc";
}

export function Comparison({ current }: { current: string }) {
  const g = useResults("greedy");
  const m = useResults("mpc");
  if (g.isPending || m.isPending)
    return (
      <div className="flex flex-col gap-2" aria-busy>
        {METRICS.map((x) => (
          <Skeleton key={String(x.key)} className="h-6" />
        ))}
      </div>
    );
  if (!g.data || !m.data) return <EmptyState compact icon={FlaskConical} title="No yearly results yet" body="Run python -m sim.run --algorithm greedy and --algorithm mpc in the backend, then reload." />;
  const col = (a: "greedy" | "mpc") => (
    <span className={cn("inline-flex items-center gap-1.5", current === a && "font-semibold")}>
      {a === "greedy" ? "Greedy" : "MPC"}
      {current === a && <span className="rounded border border-line-strong px-1 text-2xs font-medium text-ink-3">live run</span>}
    </span>
  );
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Greedy compared with MPC over the simulated year</caption>
      <thead>
        <tr className="text-left text-xs text-ink-2">
          <th className="py-2 pr-3 font-semibold">Metric, simulated year</th>
          <th className="px-3 py-2 text-right font-semibold">{col("greedy")}</th>
          <th className="px-3 py-2 text-right font-semibold">{col("mpc")}</th>
          <th className="py-2 pl-3 font-semibold">Better</th>
        </tr>
      </thead>
      <tbody>
        {METRICS.map((x) => {
          const gv = g.data.fleet[x.key] as number | null | undefined;
          const mv = m.data.fleet[x.key] as number | null | undefined;
          const w = winner(x, gv, mv);
          return (
            <tr key={String(x.key)} className="border-t border-line">
              <td className="py-2 pr-3">{x.label}</td>
              <td className={cn("whitespace-nowrap px-3 py-2 text-right tnum", w === "greedy" && "font-semibold text-ok-ink")}>{`${num(gv, x.d)} ${x.unit}`}</td>
              <td className={cn("whitespace-nowrap px-3 py-2 text-right tnum", w === "mpc" && "font-semibold text-ok-ink")}>{`${num(mv, x.d)} ${x.unit}`}</td>
              <td className="whitespace-nowrap py-2 pl-3 text-xs" title={`${x.better} is better`}>
                {w ? (
                  <span className="inline-flex items-center gap-1 text-ok-ink">
                    <Check aria-hidden className="h-3.5 w-3.5" />
                    {w === "mpc" ? "MPC" : "Greedy"}
                    <span className="sr-only">{`, ${x.better} is better`}</span>
                  </span>
                ) : (
                  <span className="text-ink-3">Same</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type Run = { id: string; algorithm: string; status: string; startedAt?: string; datasetId?: string };

export function Runs({ algorithm }: { algorithm: string }) {
  const qc = useQueryClient();
  const runs = useQuery({
    queryKey: qk.admin.simulations,
    queryFn: () => adminApi.simulations() as Promise<Run[]>,
    refetchInterval: (q) => ((q.state.data as Run[] | undefined)?.some((r) => r.status !== "done" && r.status !== "failed") ? 2000 : false),
  });
  const start = useMutation({
    mutationFn: () => adminApi.startSimulation(algorithm === "mpc" ? "mpc" : "greedy"),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin.simulations }),
  });
  const columns: Column<Run>[] = [
    { key: "id", label: "Run", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "algorithm", label: "Algorithm", render: (r) => (r.algorithm === "mpc" ? "MPC" : "Greedy") },
    { key: "status", label: "Status", render: (r) => <StatusChip kind="job" value={r.status === "done" ? "done" : r.status === "failed" ? "missed" : "running"} size="sm" label={r.status} /> },
    { key: "startedAt", label: "Started", render: (r) => <span className="text-ink-2">{r.startedAt ? time.dayTime(r.startedAt) : "–"}</span> },
    { key: "datasetId", label: "Demand file", render: (r) => <span className="text-ink-2">{r.datasetId ?? "active file"}</span> },
  ];
  return (
    <Card className="p-5">
      <CardHeader
        title="Simulation runs"
        sub="Offline runs of a whole year (GET /admin/simulations). A run takes one to two minutes."
        right={
          <Button size="sm" icon={Play} disabled={start.isPending} onClick={() => start.mutate()}>
            {start.isPending ? "Starting…" : `Run a year with ${algorithm === "mpc" ? "MPC" : "Greedy"}`}
          </Button>
        }
      />
      <div className="mt-4">
        {runs.isPending ? (
          <Skeleton className="h-24 rounded-card" />
        ) : runs.isError ? (
          <ErrorState compact error={runs.error} onRetry={() => void runs.refetch()} />
        ) : (
          <DataTable
            caption="Simulation runs"
            columns={columns}
            rows={runs.data ?? []}
            rowKey={(r) => r.id}
            maxHeight="280px"
            empty={<EmptyState compact icon={FlaskConical} title="No runs since the backend started" body="The comparison above uses the yearly results on disk. Start a run to add one here." />}
          />
        )}
        {start.isError && (
          <p role="alert" className="mt-2 text-sm text-critical-ink">
            {start.error instanceof Error ? start.error.message : "The run could not be started."}
          </p>
        )}
      </div>
    </Card>
  );
}

export function Assumptions() {
  const a = useAssumptions();
  if (a.isPending) return <Skeleton className="h-40 rounded-card" />;
  if (a.isError) return <ErrorState compact error={a.error} onRetry={() => void a.refetch()} />;
  const areas = [...new Set((a.data ?? []).map((x) => x.area))];
  return (
    <div className="flex flex-col gap-4">
      {areas.map((area) => (
        <div key={area}>
          <h3 className="mb-2 text-xs font-semibold capitalize text-ink-2">{area}</h3>
          <div className="flex flex-wrap gap-2">
            {(a.data ?? [])
              .filter((x) => x.area === area)
              .map((x) => (
                <AssumptionPill key={x.name} a={x} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
