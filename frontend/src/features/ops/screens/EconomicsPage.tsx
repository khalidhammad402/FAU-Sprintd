/** Platform Economics: four sides. Two earn today (live figures), two are roadmap scenarios with no numbers. */
import { Cpu, Database, ShieldCheck, Zap } from "lucide-react";
import { useAssumptions, useResults } from "@/api/queries";
import { AssumptionPill, Card, CardHeader, ErrorState, Illustrative, PayOffStatement, Skeleton } from "@/design-system";
import { terms } from "@/lib/terms";
import { useLive } from "@/live/store";
import { OpsPage } from "../OpsShell";
import { useTodayKpis } from "../hooks";
import { Figure, PLAN_MIX, RevenueMix, SideCard } from "./parts/economics";

const share = (k: (typeof PLAN_MIX)[number]["key"]) => PLAN_MIX.find((p) => p.key === k)!.pct;
const MONEY_ASSUMPTIONS = /electricity price|value of heat|compute price|exchange rate|hardware/i;

export default function EconomicsPage() {
  const algorithm = useLive((s) => s.clock?.algorithm) === "mpc" ? "mpc" : "greedy";
  const { today, runTotal } = useTodayKpis();
  const run = runTotal.data;
  const year = useResults(algorithm);
  const assumptions = useAssumptions();
  const k = today.data;
  const f = year.data?.fleet;
  const tl = today.isPending;
  const yl = year.isPending;

  return (
    <OpsPage title="Platform economics" sub="A four-sided platform. Compute buyers and heat hosts earn today and show measured figures. Grid flexibility and certificates are roadmap and show a scenario only." actions={<Illustrative text="Demand data is illustrative" />}>
      <ol aria-label="How the platform works" className="mb-4 grid grid-cols-4 gap-2 max-lg:grid-cols-2">
        {terms.chain.map((step, i) => (
          <li key={step} className="rounded-card border border-line bg-surface px-4 py-3 text-sm">
            <span className="text-xs tnum text-ink-3">{`Step ${i + 1}`}</span>
            <span className="mt-0.5 block font-semibold first-letter:uppercase">{step}</span>
          </li>
        ))}
      </ol>

      {today.isError && !k ? (
        <ErrorState error={today.error} onRetry={() => void today.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
          <SideCard n={1} role="money side" title="Compute buyers" who="Pharma, banks, universities, AI start-ups" icon={Cpu} share={share("compute")}>
            <div className="grid grid-cols-3 gap-2">
              <Figure label="Compute income" value={run?.computeIncomeChf} unit="CHF" period="since run start" loading={runTotal.isPending} />
              <Figure label="Break-even" value={k?.breakEvenChfPerServerHour} unit="CHF/server-h" decimals={2} period="today" loading={tl} />
              <Figure label="Compute income" value={f?.computeIncomeChf} unit="CHF" period={`simulated year, ${algorithm.toUpperCase()}`} loading={yl} />
            </div>
          </SideCard>
          <SideCard n={2} role="thermal sink" title="Heat hosts" who="Hotels, pools, plants, laundries, apartment blocks, farms" icon={Database} share={share("heat")}>
            <div className="grid grid-cols-3 gap-2">
              <Figure label="Heat value" value={k?.heatValueChf} unit="CHF" decimals={2} period="today" loading={tl} />
              <Figure label="Electricity cost" value={k?.electricityCostChf} unit="CHF" decimals={2} period="today" loading={tl} />
              <Figure label="Heat value" value={f?.heatValueChf} unit="CHF" period={`simulated year, ${algorithm.toUpperCase()}`} loading={yl} />
            </div>
          </SideCard>
          <SideCard n={3} role="flexibility buyer" title="Grid flexibility" who="Swissgrid, IWB, BKW" icon={Zap} roadmap share={share("grid")}>
            <p className="text-sm text-ink-2">Pausing or shifting flexible compute lets the fleet act as a controllable load for balancing services.</p>
            <h3 className="mb-1 mt-3 text-xs font-semibold text-ink-2">Preconditions</h3>
            <ul className="list-disc pl-5 text-sm text-ink-2">
              <li>aggregate 100 to 300 sites to reach a 1 to 5 MW pool</li>
              <li>prequalification with the grid operator</li>
              <li>metering at 15-minute resolution at every site</li>
            </ul>
          </SideCard>
          <SideCard n={4} role="ecosystem" title="Heat-reuse certificates and licensing" who="Sustainability teams, utilities, certified installers" icon={ShieldCheck} roadmap share={share("cert")}>
            <p className="text-sm text-ink-2">Measured recovered heat can back heat-reuse certificates, and the scheduler can be licensed to other operators.</p>
            <h3 className="mb-1 mt-3 text-xs font-semibold text-ink-2">Preconditions</h3>
            <ul className="list-disc pl-5 text-sm text-ink-2">
              <li>verified heat metering at every site</li>
              <li>one party claims each saving: the host or the certificate buyer, never both</li>
              <li>an accepted certification scheme</li>
            </ul>
          </SideCard>

          <Card className="p-5 lg:col-span-2">
            <CardHeader title="Revenue mix" sub="The plan is a target. The live mix is what the backend has measured since the run started. They are different things." />
            <div className="mt-4">{runTotal.isPending ? <Skeleton className="h-16 rounded-card" /> : <RevenueMix computeChf={run?.computeIncomeChf} heatChf={run?.heatValueChf} />}</div>
          </Card>

          <div className="flex flex-col gap-3 lg:col-span-2">
            {yl ? <Skeleton className="h-28 rounded-card" /> : <PayOffStatement text={f?.payOffStatement} algorithm={year.data?.algorithm} generatedAt={year.data?.generatedAt} />}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-3">Prices behind these figures:</span>
              {assumptions.isPending ? (
                <Skeleton className="h-7 w-64 rounded-full" />
              ) : (
                (assumptions.data ?? []).filter((a) => a.area === "economics" && MONEY_ASSUMPTIONS.test(a.name)).map((a) => <AssumptionPill key={a.name} a={a} />)
              )}
            </div>
          </div>
        </div>
      )}
    </OpsPage>
  );
}
