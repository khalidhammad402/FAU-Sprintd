import { Link } from "react-router-dom";
import { AlertOctagon, Bell, Flame, Server, Wallet } from "lucide-react";
import { useHostEnergy, useHostSavings, useNotifications } from "@/api/queries";
import {
  AnimatedNumber,
  AssumptionPill,
  Button,
  Card,
  Chip,
  DonutGauge,
  EmptyState,
  HeatPulse,
  InfoPop,
  QueryState,
  Skeleton,
  StackedBars,
  siteStatus,
} from "@/design-system";
import { sum } from "@/lib/format";
import { time } from "@/lib/time";
import { useNow } from "@/live/store";
import { adviceFor, pricePerKwh } from "./content";
import { useHostSite, useLiveOverview } from "./site";
import { statusSentence } from "./statusSentence";
import { CardSkeleton, Fact, SectionTitle, Unit } from "./ui";

function TodaySkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="p-5 lg:col-span-12">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="mt-3 w-40" />
      </Card>
      <Card className="flex flex-col items-center gap-4 p-6 lg:col-span-5">
        <Skeleton className="h-48 w-48 rounded-full" />
        <Skeleton className="w-40" />
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
        <CardSkeleton className="sm:col-span-2" />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

export default function TodayPage() {
  const { siteId, site, search } = useHostSite();
  const overview = useLiveOverview(siteId);
  const day = useHostEnergy(siteId, "day");
  const savings = useHostSavings(siteId);
  const notes = useNotifications();
  const now = useNow();

  return (
    <QueryState
      query={overview}
      skeleton={<TodaySkeleton />}
      errorTitle="Today could not be loaded"
    >
      {(o) => {
        const s = statusSentence(o, overview.live);
        const v = siteStatus[s.key === "tank_low" ? "tank_low" : s.key === "dumping" ? "dumping" : s.key.startsWith("backup") ? "unmet" : s.key === "offline" ? "offline" : "covered"];
        const fill = o.tankCapacityKwh ? (100 * o.tankKwh) / o.tankCapacityKwh : 0;
        const heatToday = day.data ? sum(day.data, (r) => r.serverHeatKwh) : null;
        const working = o.serversWorking > 0;
        const price = pricePerKwh(savings.data?.explanation);
        const latest = (notes.data ?? []).filter((n) => !site || n.siteId === site.id)[0];
        return (
          <div className="grid gap-4 lg:grid-cols-12">
            <Card className="relative overflow-hidden p-5 sm:p-6 lg:col-span-12" aria-live="polite">
              <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: `rgb(var(--${s.tone}))` }} />
              <p className="text-md font-semibold leading-snug text-ink sm:text-lg">{s.sentence}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-3">
                <Chip tone={s.tone} icon={v.icon}>
                  {s.label}
                </Chip>
                <span>Updated {time.hm(o.time ?? now)}, simulated time</span>
              </div>
            </Card>

            <Card className="flex flex-col items-center gap-4 p-6 text-center lg:col-span-5 lg:row-span-2">
              <DonutGauge variant="tank" tone="tank" value={o.tankKwh} max={o.tankCapacityKwh} size={208} stroke={12} label={`Hot water tank ${Math.round(fill)} percent full`}>
                <span className="flex flex-col items-center">
                <span className="text-2xl font-light tnum">
                  <AnimatedNumber value={fill} decimals={0} />
                  <span className="ml-0.5 text-md text-ink-3">%</span>
                </span>
                <span className="mt-1 block text-sm tnum text-ink-2">
                  <AnimatedNumber value={o.tankKwh} decimals={1} /> / {o.tankCapacityKwh} kWh
                </span>
                </span>
              </DonutGauge>
              <div>
                <h2 className="text-md font-semibold">Your hot water tank</h2>
                <p className="mt-1 max-w-[40ch] text-sm text-ink-2">
                  It stores heat recovered from the servers in your plant room. {o.tankCapacityKwh} kWh is a full tank. Level now, simulated time.
                </p>
              </div>
            </Card>

            <Fact
              className="lg:col-span-7"
              icon={Flame}
              tone="heat"
              label="Heat from DigitalHeat today"
              value={
                heatToday == null ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <>
                    <AnimatedNumber value={heatToday} decimals={1} />
                    <Unit>kWh</Unit>
                  </>
                )
              }
              period="today so far, since 00:00"
            >
              That is <b className="font-semibold text-ink tnum">{Math.round(o.serverHeatSharePctToday)} %</b> of the heat your site needed today, recovered from the servers and delivered through your tank.
            </Fact>

            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
              <Fact
                icon={Server}
                tone="heat"
                label="Servers working"
                value={
                  <>
                    <AnimatedNumber value={o.serversWorking} decimals={0} />
                    <Unit>/ {o.serversTotal}</Unit>
                  </>
                }
                period="right now"
              >
                <HeatPulse on={working} load={o.serversTotal ? o.serversWorking / o.serversTotal : 0} />
                <span className="mt-2 block">{working ? "Working servers send their heat into your tank." : "The servers are resting. Your tank still holds heat."}</span>
              </Fact>
              <Fact
                icon={AlertOctagon}
                tone={o.backupHeatTodayKwh > 0.05 ? "critical" : "idle"}
                label="Backup heat required"
                value={
                  <>
                    <AnimatedNumber value={o.backupHeatTodayKwh} decimals={1} />
                    <Unit>kWh</Unit>
                  </>
                }
                period="today so far"
              >
                {o.backupHeatTodayKwh > 0.05 ? "Your backup heater supplied this part. Everything else came from recovered heat." : "Your backup heater was not needed today."}
              </Fact>
            </div>

            <Fact
              className="lg:col-span-12"
              icon={Wallet}
              tone="ok"
              label="Recovered heat value this month"
              aside={
                <InfoPop label="How the recovered heat value is calculated">
                  <p className="font-semibold">A pricing assumption, not a bill saving</p>
                  <p className="mt-2 text-sm text-ink-2">{savings.data?.explanation ?? "The explanation is loading."}</p>
                  <p className="mt-2 text-xs text-ink-3">This is not a verified tariff calculation for your site.</p>
                </InfoPop>
              }
              value={
                <>
                  <span className="mr-1 text-md font-normal text-ink-3">CHF</span>
                  <AnimatedNumber value={o.savingsMonthChf} decimals={2} />
                </>
              }
              period={`${time.month(o.time ?? now)} so far`}
            >
              <span className="flex flex-wrap items-center gap-2">
                The value of the heat we delivered, at an assumed price per kWh.
                {savings.data && <AssumptionPill compact a={{ name: "Value of recovered heat", value: price ?? "see source", status: "ASSUMPTION", source: savings.data.explanation }} />}
              </span>
            </Fact>

            <Card className="p-5 lg:col-span-8">
              <SectionTitle
                right={
                  <Link to={`/host/energy${search}`} className="text-sm font-medium text-tank-ink underline-offset-4 hover:underline">
                    Open Energy
                  </Link>
                }
              >
                Today, hour by hour
              </SectionTitle>
              {day.isPending ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <StackedBars
                  data={day.data ?? []}
                  xLabel={(r) => time.hm(r.bucket)}
                  unit="kWh per hour"
                  height={200}
                  series={[
                    { key: "serverHeatKwh", label: "Recovered server heat", tone: "heat" },
                    { key: "backupHeatKwh", label: "Backup heat", tone: "critical" },
                  ]}
                  marker={{ key: "demandKwh", label: "Heat demand", line: true, color: "rgb(var(--ink))" }}
                  empty="No heat readings yet today"
                />
              )}
            </Card>

            <Card className="p-5 lg:col-span-4">
              <SectionTitle>Latest notification</SectionTitle>
              {latest ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold">{adviceFor(latest.kind).title}</p>
                  <p className="text-sm text-ink-2">{adviceFor(latest.kind).next}</p>
                  <p className="text-xs text-ink-3 tnum">{time.dayTime(latest.time)}</p>
                  <Link to={`/host/alerts${search}`} className="mt-1">
                    <Button size="sm" icon={Bell}>
                      All notifications
                    </Button>
                  </Link>
                </div>
              ) : (
                <EmptyState compact icon={Bell} title="Nothing new" body="We will tell you here when something needs your attention." />
              )}
            </Card>
          </div>
        );
      }}
    </QueryState>
  );
}
