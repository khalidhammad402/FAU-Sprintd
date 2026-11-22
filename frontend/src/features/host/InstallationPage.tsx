import { Server } from "lucide-react";
import { useHostServers } from "@/api/queries";
import { Card, DonutGauge, EmptyState, HeatPulse, QueryState, StatusChip, Button } from "@/design-system";
import { num } from "@/lib/format";
import { useHostSite, useLiveOverview } from "./site";
import { CardSkeleton, SectionTitle } from "./ui";

/** Server cards in plain words. Hosts never see customer names, job ids or task data. */
export default function InstallationPage() {
  const { siteId } = useHostSite();
  const servers = useHostServers(siteId);
  const overview = useLiveOverview(siteId);
  const o = overview.data;
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="flex flex-col gap-4 lg:col-span-8">
        <SectionTitle>Servers in your plant room</SectionTitle>
        <QueryState
          query={servers}
          skeleton={
            <div className="grid gap-4 sm:grid-cols-2">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          }
          empty={
            <Card>
              <EmptyState icon={Server} title="No servers installed yet" body="Once a certified installer has set up your rack, its servers appear here." action={<Button onClick={() => void servers.refetch()}>Check again</Button>} />
            </Card>
          }
          errorTitle="Your servers could not be loaded"
        >
          {(list) => (
            <ul className="grid gap-4 sm:grid-cols-2">
              {list.map((s) => {
                const state = s.status === "working" || s.status === "offline" ? s.status : "idle";
                return (
                  <li key={s.name}>
                    <Card className="flex h-full flex-col gap-3 p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-md font-semibold">{s.name}</span>
                        <StatusChip kind="server" value={state} />
                      </div>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                        <dt className="text-ink-3">Capacity</dt>
                        <dd className="tnum">{num(s.capacityKw, 1)} kW</dd>
                        <dt className="text-ink-3">Work now</dt>
                        <dd>{s.workKind ? s.workKind.charAt(0).toUpperCase() + s.workKind.slice(1) : state === "offline" ? "Not reachable" : "Resting, no work right now"}</dd>
                      </dl>
                      <HeatPulse on={state === "working"} load={0.6} label={state === "working" ? "Heat into your tank" : undefined} />
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </QueryState>
      </div>

      <div className="flex flex-col gap-4 lg:col-span-4">
        <SectionTitle>Hot water tank</SectionTitle>
        <Card className="flex items-center gap-5 p-5">
          {o ? (
            <>
              <DonutGauge variant="tank" tone="tank" value={o.tankKwh} max={o.tankCapacityKwh} size={112} stroke={9} label={`Tank ${Math.round((100 * o.tankKwh) / o.tankCapacityKwh)} percent full`}>
                <span className="text-lg font-light tnum">{Math.round((100 * o.tankKwh) / o.tankCapacityKwh)} %</span>
              </DonutGauge>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-ink-3">Stored now</dt>
                <dd className="tnum">{num(o.tankKwh, 1)} kWh</dd>
                <dt className="text-ink-3">Capacity</dt>
                <dd className="tnum">{num(o.tankCapacityKwh, 0)} kWh</dd>
                <dt className="text-ink-3">Servers</dt>
                <dd className="tnum">
                  {o.serversWorking} of {o.serversTotal} working
                </dd>
              </dl>
            </>
          ) : (
            <p className="text-sm text-ink-3">Tank data is loading.</p>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold">What is running in my plant room?</h3>
          <p className="mt-2 text-sm text-ink-2">
            Sealed, liquid-cooled servers run computing jobs for Swiss organisations. All of their electricity turns into heat, and most of it is recovered as hot water at 55 to 65 °C into your tank.
          </p>
          <p className="mt-2 text-sm text-ink-2">
            You see what kind of work runs, never who it is for or the data itself. When your tank is full, the scheduler moves flexible work to a site that needs heat.
          </p>
        </Card>
      </div>
    </div>
  );
}
