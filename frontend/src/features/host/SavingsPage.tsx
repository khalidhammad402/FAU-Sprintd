import { Download, FileText, ShieldAlert, Wallet } from "lucide-react";
import { useHostSavings } from "@/api/queries";
import { AssumptionPill, Button, Card, Chip, EmptyState, KpiTile, QueryState, SimpleBars, Skeleton } from "@/design-system";
import { chf, kwh } from "@/lib/format";
import { time } from "@/lib/time";
import { download, pricePerKwh, savingsCsv } from "./content";
import { useHostSite } from "./site";
import { SectionTitle } from "./ui";

function SavingsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="flex flex-col gap-3 p-5 lg:col-span-4">
        <Skeleton className="w-40" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="w-3/4" />
      </Card>
      <Card className="p-5 lg:col-span-8">
        <Skeleton className="h-56 w-full" />
      </Card>
    </div>
  );
}

/** Recovered heat value per month. A pricing assumption, never called a bill saving. */
export default function SavingsPage() {
  const { siteId, site } = useHostSite();
  const q = useHostSavings(siteId);
  const name = site?.name ?? "site";
  const file = (suffix: string) => `digitalheat-${(site?.id ?? "site").toLowerCase()}-${suffix}.csv`;
  return (
    <QueryState
      query={q}
      skeleton={<SavingsSkeleton />}
      isEmpty={(d) => d.months.length === 0}
      empty={
        <Card>
          <EmptyState icon={Wallet} title="No recovered heat value yet" body="The first month appears once the servers have delivered heat to your tank." action={<Button onClick={() => void q.refetch()}>Check again</Button>} />
        </Card>
      }
      errorTitle="Savings and reports could not be loaded"
    >
      {(s) => {
        const months = [...s.months].sort((a, b) => (a.month < b.month ? -1 : 1));
        const current = months[months.length - 1];
        const price = pricePerKwh(s.explanation);
        return (
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="flex flex-col gap-4 lg:col-span-4">
              <Card className="p-5">
                <KpiTile label="Recovered heat value" icon={Wallet} tone="ok" value={current?.valueChf} unit="CHF" decimals={2} period={`${time.month(current?.month)} so far`} size="lg" />
                <p className="mt-2 text-sm text-ink-2">From {kwh(current?.serverHeatKwh, 1)} of recovered server heat.</p>
              </Card>
              <Card className="p-5">
                <KpiTile label="Recovered heat value" icon={Wallet} tone="ok" value={s.totalChf} unit="CHF" decimals={2} period="this year so far" />
                <p className="mt-2 text-sm text-ink-2">From {kwh(months.reduce((a, m) => a + m.serverHeatKwh, 0), 0)} of recovered server heat.</p>
              </Card>
              <Card className="flex flex-col gap-3 p-5">
                <h2 className="text-sm font-semibold">How this value is calculated</h2>
                <p className="text-sm text-ink-2">{s.explanation}</p>
                <AssumptionPill a={{ name: "Value of recovered heat", value: price ?? "see source", status: "ASSUMPTION", source: s.explanation }} />
                <Chip tone="dump" icon={ShieldAlert} className="self-start">
                  Not a verified tariff calculation
                </Chip>
                <p className="text-xs text-ink-3">This is the value of the delivered heat at an assumed price, not a saving on your energy bill. A tariff check for your site has not been done.</p>
              </Card>
            </div>

            <div className="flex flex-col gap-4 lg:col-span-8">
              <Card className="p-5">
                <SectionTitle>Recovered heat value per month</SectionTitle>
                <SimpleBars data={months.map((m) => ({ x: time.monthShort(m.month), v: Math.round(m.valueChf * 100) / 100 }))} unit="CHF per month" color="rgb(var(--ok))" label="Recovered heat value" height={220} />
              </Card>
              <Card className="p-5">
                <SectionTitle
                  right={
                    <Button size="sm" icon={Download} onClick={() => download(file("year"), savingsCsv(name, s))}>
                      Download year
                    </Button>
                  }
                >
                  Monthly reports
                </SectionTitle>
                <ul className="divide-y divide-line">
                  {[...months].reverse().map((m) => (
                    <li key={m.month} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                      <FileText aria-hidden className="h-4 w-4 text-ink-3" />
                      <span className="min-w-28 text-sm font-medium">{time.month(m.month)}</span>
                      <span className="text-sm text-ink-2 tnum">{kwh(m.serverHeatKwh, 1)}</span>
                      <span className="text-sm text-ink tnum">{chf(m.valueChf, 2)}</span>
                      <Button size="sm" variant="ghost" icon={Download} className="ml-auto max-md:h-11" onClick={() => download(file(m.month.slice(0, 7)), savingsCsv(name, s, m.month.slice(0, 7)))}>
                        CSV<span className="sr-only">{` report for ${time.month(m.month)}`}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}
