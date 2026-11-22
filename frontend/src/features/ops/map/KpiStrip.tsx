/** The five KPI cards above the map (reference image): value, unit, period, hourly sparkline, trend vs yesterday. */
import { CircleDollarSign, Flame, Server, ShieldCheck, Wind } from "lucide-react";
import { Card, KpiTile, Sparkline, Trend } from "@/design-system";
import { useLive } from "@/live/store";
import { useFleetHourly, useTodayKpis } from "../hooks";

export function KpiStrip({ siteIds }: { siteIds: string[] }) {
  const { today, prior, runTotal } = useTodayKpis();
  const hourly = useFleetHourly(siteIds);
  const slotKpis = useLive((s) => s.slotKpis);
  const stale = useLive((s) => s.conn.state === "reconnecting");
  const k = today.data,
    p = prior.data;
  const loading = today.isPending;
  const vs = "vs same hours yesterday";
  const cards = [
    {
      label: "Heat coverage",
      icon: ShieldCheck,
      tone: "ok" as const,
      value: k?.coveragePct,
      unit: "%",
      decimals: 1,
      trend: <Trend value={k?.coveragePct} prior={p?.coveragePct} unit="pp" label={vs} />,
      spark: <Sparkline tone="ok" values={hourly.map((h) => h.coverage)} label="Heat coverage per hour today" />,
    },
    {
      label: "Heat delivered",
      icon: Flame,
      tone: "heat" as const,
      value: k?.deliveredKwh,
      unit: "kWh",
      trend: <Trend value={k?.deliveredKwh} prior={p?.deliveredKwh} label={vs} />,
      spark: <Sparkline tone="heat" values={hourly.map((h) => h.delivered)} label="Heat delivered per hour today" />,
    },
    {
      label: "Heat dumped",
      icon: Wind,
      tone: "dump" as const,
      value: k?.dumpedKwh,
      unit: "kWh",
      trend: <Trend value={k?.dumpedKwh} prior={p?.dumpedKwh} lowerIsBetter label={vs} />,
      spark: <Sparkline tone="dump" values={hourly.map((h) => h.dumped)} label="Heat dumped per hour today" />,
    },
    {
      label: "Fleet utilisation",
      icon: Server,
      tone: "idle" as const,
      value: k?.utilisationPct,
      unit: "%",
      decimals: 0,
      trend: <Trend value={k?.utilisationPct} prior={p?.utilisationPct} unit="pp" decimals={0} label={vs} />,
      spark: <Sparkline tone="idle" values={slotKpis.map((x) => x.utilisationPct ?? null)} label="Utilisation per slot since this page opened" />,
    },
    {
      label: "Compute income",
      icon: CircleDollarSign,
      tone: "idle" as const,
      // the backend applies from/to to energy rows but not to income (FRONTEND_GAPS.md), so this is the run total
      value: runTotal.data?.computeIncomeChf,
      unit: "CHF",
      decimals: 0,
      period: "since run start",
      trend: null,
      spark: null,
    },
  ];
  return (
    <section aria-label="Live fleet figures" className={(stale ? "stale " : "") + "grid grid-cols-5 gap-3 max-xl:flex max-xl:overflow-x-auto max-xl:pb-1 max-xl:scrollbar-thin"}>
      {cards.map((c, i) => (
        <Card key={c.label} className="animate-rise px-4 py-3 max-xl:min-w-[210px] max-xl:shrink-0" style={{ animationDelay: `${i * 40}ms` }}>
          <KpiTile label={c.label} icon={c.icon} tone={c.tone} value={c.value} unit={c.unit} decimals={c.decimals} period={("period" in c && c.period) || "today"} trend={c.trend} spark={c.spark} loading={loading} />
        </Card>
      ))}
    </section>
  );
}
