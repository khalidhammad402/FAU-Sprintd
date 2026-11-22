import { Leaf } from "lucide-react";
import { useImpact, useUsage } from "@/api/queries";
import { Card, CardHeader, EmptyState, KpiTile, QueryState, Skeleton, StackedBars } from "@/design-system";
import { num } from "@/lib/format";
import { time } from "@/lib/time";
import { terms } from "@/lib/terms";

export default function Impact() {
  const impact = useImpact();
  const usage = useUsage();
  const monthly = new Map<string, number>();
  (usage.data ?? []).forEach((u) => monthly.set(u.month, (monthly.get(u.month) ?? 0) + u.serverHours));
  const rows = [...monthly.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, h]) => ({ month, kwh: h }));
  return (
    <div className="flex flex-col gap-6">
      <QueryState
        query={impact}
        skeleton={
          <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-16 w-full" />
              </Card>
            ))}
          </div>
        }
        isEmpty={(i) => !i.heatDeliveredKwh}
        empty={
          <Card>
            <EmptyState icon={Leaf} title="No heat delivered yet" body="Once your jobs run, their heat warms host businesses in Basel and the figures appear here." />
          </Card>
        }
      >
        {(i) => (
          <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
            <Card className="p-5">
              <KpiTile label="Heat enabled" tone="heat" value={i.heatDeliveredKwh} decimals={0} unit="kWh" period="since the run started" size="lg" />
              <p className="mt-2 text-xs text-ink-3">share of reused fleet heat associated with your workloads</p>
            </Card>
            <Card className="p-5">
              <KpiTile label={terms.hosts + " heated"} value={i.sitesHeated} decimals={0} unit="sites" period="since the run started" size="lg" />
              <p className="mt-2 text-xs text-ink-3">Hotels, pools, apartment blocks and farms in Basel.</p>
            </Card>
            <Card className="p-5">
              <KpiTile label="Fleet heat reused" tone="ok" value={i.heatReusedSharePct} decimals={1} unit="%" period="fleet-wide, this period" size="lg" />
              <p className="mt-2 text-xs text-ink-3">Of all server heat, the part the buildings used. The rest was dumped.</p>
            </Card>
          </div>
        )}
      </QueryState>

      <Card className="p-5">
        <CardHeader title="Electricity your workloads used" sub="kWh per month. Each full-load server-hour is 1 kWh on the fleet's 1 kW servers." />
        <div className="mt-4">
          <QueryState query={usage} skeleton={<Skeleton className="h-[220px] w-full" />} isEmpty={() => rows.length === 0} empty={<EmptyState compact title="No usage yet" />}>
            {() => <StackedBars data={rows} xLabel={(r) => time.monthShort(r.month)} series={[{ key: "kwh", label: "Electricity", color: "rgb(100 116 139)" }]} unit="kWh" />}
          </QueryState>
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader title="How these figures are made" />
        <div className="mt-3 grid grid-cols-2 gap-6 text-sm text-ink-2 max-md:grid-cols-1">
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            <li>Your tasks run on servers in the basements of host businesses.</li>
            <li>The electricity a server uses leaves it as heat; most of it is recovered into the host's hot-water tank.</li>
            <li>The host uses that heat instead of running its own heater. Heat that the tank cannot take is dumped and not counted.</li>
            <li>“Heat enabled” adds up the heat delivered by the tasks of your jobs.</li>
          </ol>
          <div className="flex flex-col gap-2">
            <p>
              Backend note: <q>{impact.data?.note ?? "…"}</q>
            </p>
            <p>No CO2 figure is shown: there is no verified CO2 calculation yet. Figures are from the simulated year and are illustrative.</p>
            {impact.data && <p className="tnum text-xs text-ink-3">Total heat enabled: {num(impact.data.heatDeliveredKwh, 1)} kWh.</p>}
          </div>
        </div>
      </Card>
    </div>
  );
}
