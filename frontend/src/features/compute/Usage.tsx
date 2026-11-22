import { Link } from "react-router-dom";
import { Download, KeyRound, Receipt } from "lucide-react";
import { useApiKeys, useInvoices, useUsage } from "@/api/queries";
import type { Invoice, UsageRow } from "@/api/types";
import { Button, Card, CardHeader, Chip, DataTable, EmptyState, QueryState, Skeleton, StackedBars, type Column } from "@/design-system";
import { chf, num } from "@/lib/format";
import { time } from "@/lib/time";
import { priorities, tiers } from "@/lib/tiers";
import { downloadCsv, tierColor } from "./ui";

type MonthRow = Record<string, number | string> & { month: string };
function byMonth(rows: UsageRow[], field: "serverHours" | "costChf"): MonthRow[] {
  const m = new Map<string, MonthRow>();
  rows.forEach((r) => {
    const row = m.get(r.month) ?? ({ month: r.month } as MonthRow);
    row[r.priority] = Number(row[r.priority] ?? 0) + r[field];
    m.set(r.month, row);
  });
  return [...m.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

const series = priorities.map((p) => ({ key: p, label: tiers[p].label, color: tierColor[p] }));
const chartSkeleton = <Skeleton className="h-[220px] w-full" />;

function downloadInvoice(inv: Invoice, usage: UsageRow[]) {
  const rows = usage.filter((u) => u.month === inv.month);
  downloadCsv(`${inv.id}.csv`, [
    ["invoice", inv.id],
    ["month", time.month(inv.month)],
    ["status", inv.status],
    [],
    ["tier", "server_hours", "cost_chf"],
    ...rows.map((r) => [tiers[r.priority as keyof typeof tiers]?.label ?? r.priority, Number(r.serverHours.toFixed(3)), Number(r.costChf.toFixed(2))]),
    [],
    ["total", Number(inv.serverHours.toFixed(3)), Number(inv.amountChf.toFixed(2))],
  ]);
}

export default function Usage() {
  const usage = useUsage();
  const invoices = useInvoices();
  const keys = useApiKeys();
  const cols: Column<Invoice>[] = [
    { key: "id", label: "Invoice", render: (i) => <span className="font-mono text-xs">{i.id}</span> },
    { key: "month", label: "Month", render: (i) => time.month(i.month) },
    { key: "serverHours", label: "Server-hours", num: true, render: (i) => num(i.serverHours, 1) },
    { key: "amountChf", label: "Amount", num: true, render: (i) => chf(i.amountChf, 2) },
    { key: "status", label: "Status", render: (i) => <Chip tone={i.status === "paid" ? "ok" : "idle"} size="sm">{i.status === "paid" ? "Paid" : "Open"}</Chip> },
    {
      key: "dl",
      label: "",
      sortable: false,
      render: (i) => (
        <Button size="sm" variant="ghost" icon={Download} onClick={(e) => (e.stopPropagation(), downloadInvoice(i, usage.data ?? []))} aria-label={`Download ${i.id} as CSV`}>
          CSV
        </Button>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-6 max-xl:grid-cols-1">
        <Card className="p-5">
          <CardHeader title="Server-hours by tier" sub="Full-load server-hours per month" />
          <div className="mt-4">
            <QueryState query={usage} skeleton={chartSkeleton} empty={<EmptyState compact icon={Receipt} title="No usage yet" body="Usage appears after your first job runs." />}>
              {(u) => <StackedBars data={byMonth(u, "serverHours")} xLabel={(r) => time.monthShort(r.month as string)} series={series} unit="server-h" />}
            </QueryState>
          </div>
        </Card>
        <Card className="p-5">
          <CardHeader title="Cost by tier" sub="CHF per month, as invoiced" />
          <div className="mt-4">
            <QueryState query={usage} skeleton={chartSkeleton} empty={<EmptyState compact icon={Receipt} title="No cost yet" body="Costs appear after your first job runs." />}>
              {(u) => <StackedBars data={byMonth(u, "costChf")} xLabel={(r) => time.monthShort(r.month as string)} series={series} unit="CHF" />}
            </QueryState>
          </div>
        </Card>
      </div>

      <section aria-labelledby="inv-h" className="flex flex-col gap-3">
        <h2 id="inv-h" className="text-md font-semibold">
          Invoices
        </h2>
        <QueryState
          query={invoices}
          skeleton={<Skeleton className="h-40 w-full" />}
          empty={
            <Card>
              <EmptyState icon={Receipt} title="No invoices yet" body="An invoice is created for each month with usage." />
            </Card>
          }
        >
          {(list) => <DataTable caption="Invoices" columns={cols} rows={[...list].reverse()} rowKey={(i) => i.id} maxHeight="420px" />}
        </QueryState>
        <p className="text-xs text-ink-3">CSV files are built in your browser from your usage. There is no PDF invoice yet.</p>
      </section>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <CardHeader title="API keys" sub={keys.data ? `${keys.data.length} active ${keys.data.length === 1 ? "key" : "keys"}` : "Submit jobs from your own systems"} />
        <Link to="/compute/keys">
          <Button icon={KeyRound}>Manage API keys</Button>
        </Link>
      </Card>
    </div>
  );
}
