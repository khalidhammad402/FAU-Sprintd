import { useSearchParams } from "react-router-dom";
import { AlertOctagon, ChartColumn, Flame, Gauge } from "lucide-react";
import { useHostEnergy } from "@/api/queries";
import type { EnergyBucket } from "@/api/types";
import { Card, EmptyState, KpiTile, QueryState, Segmented, Skeleton, StackedBars, Button } from "@/design-system";
import { time } from "@/lib/time";
import { energyTotals } from "./content";
import { useHostSite } from "./site";
import { SectionTitle } from "./ui";

type Period = "day" | "week" | "month" | "year";
const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];
const meta: Record<Period, { period: string; unit: string; x: (r: EnergyBucket) => string; empty: string }> = {
  day: { period: "today so far", unit: "kWh per hour", x: (r) => time.hm(r.bucket), empty: "No heat readings yet today" },
  week: { period: "this week so far", unit: "kWh per day", x: (r) => time.weekday(r.bucket), empty: "No heat readings this week yet" },
  month: { period: "this month so far", unit: "kWh per day", x: (r) => time.day(r.bucket).split(" ").slice(1).join(" "), empty: "No heat readings this month yet" },
  year: { period: "this year so far", unit: "kWh per month", x: (r) => time.monthShort(r.bucket), empty: "No heat readings this year yet" },
};

function EnergySkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="flex flex-col gap-2 p-4">
            <Skeleton className="w-24" />
            <Skeleton className="h-7 w-20" />
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <Skeleton className="h-64 w-full" />
      </Card>
    </div>
  );
}

export default function EnergyPage() {
  const { siteId } = useHostSite();
  const [params, setParams] = useSearchParams();
  const period = (PERIODS.some((p) => p.value === params.get("period")) ? params.get("period") : "week") as Period;
  const q = useHostEnergy(siteId, period);
  const m = meta[period];
  const setPeriod = (p: Period) =>
    setParams((x) => {
      const n = new URLSearchParams(x);
      n.set("period", p);
      return n;
    });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[60ch] text-sm text-ink-2">How much heat your site needed, how much came from the servers, and how much your backup heater added.</p>
        <Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS} />
      </div>
      <QueryState
        query={q}
        skeleton={<EnergySkeleton />}
        isEmpty={(d) => d.length === 0}
        empty={
          <Card>
            <EmptyState icon={ChartColumn} title={m.empty} body="Readings arrive every 15 minutes of simulated time." action={<Button onClick={() => setPeriod("year")}>Show the whole year</Button>} />
          </Card>
        }
        errorTitle="Energy could not be loaded"
      >
        {(rows) => {
          const t = energyTotals(rows);
          const share = t.demand ? (100 * t.server) / t.demand : null;
          return (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card className="p-4">
                  <KpiTile label="Heat demand" icon={Gauge} tone="idle" value={t.demand} unit="kWh" decimals={t.demand < 10 ? 1 : 0} period={m.period} size="sm" />
                </Card>
                <Card className="p-4">
                  <KpiTile label="Recovered heat" icon={Flame} tone="heat" value={t.server} unit="kWh" decimals={t.server < 10 ? 1 : 0} period={m.period} size="sm" />
                </Card>
                <Card className="p-4">
                  <KpiTile label="Backup heat" icon={AlertOctagon} tone={t.backup > 0.05 ? "critical" : "idle"} value={t.backup} unit="kWh" decimals={1} period={m.period} size="sm" />
                </Card>
                <Card className="p-4">
                  <KpiTile label="Covered" icon={Flame} tone="ok" value={share} unit="%" decimals={0} period={m.period} size="sm" />
                </Card>
              </div>
              <Card className="p-5">
                <SectionTitle>Demand and where the heat came from</SectionTitle>
                <StackedBars
                  data={rows}
                  xLabel={m.x}
                  unit={m.unit}
                  height={280}
                  series={[
                    { key: "serverHeatKwh", label: "Recovered server heat", tone: "heat" },
                    { key: "backupHeatKwh", label: "Backup heat", tone: "critical" },
                  ]}
                  marker={{ key: "demandKwh", label: "Heat demand", line: true, color: "rgb(var(--ink))" }}
                  empty={m.empty}
                />
                <p className="mt-3 text-sm text-ink-2">
                  {t.backup > 0.05
                    ? `Recovered heat covered ${Math.round(share ?? 0)} % of your demand ${m.period}. Your backup heater added the rest.`
                    : `All of your heat demand ${m.period} was covered by recovered heat.`}
                </p>
              </Card>
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
