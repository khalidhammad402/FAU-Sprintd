/** Settings: prices behind the money figures, live laptop agents, connection, display. */
import { useState, type FormEvent } from "react";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useAgents, usePricing, usePricingMutation } from "@/api/queries";
import type { Pricing } from "@/api/types";
import { Button, Card, CardHeader, DataTable, EmptyState, ErrorState, Field, inputClass, OriginBadge, Segmented, Skeleton, type Column } from "@/design-system";
import type { Agent } from "@/api/types";
import { useTheme } from "@/app/theme";
import { env } from "@/lib/env";
import { num } from "@/lib/format";
import { setReducedMotion, useMotion } from "@/lib/motion";
import { useLive } from "@/live/store";
import { OpsPage } from "../OpsShell";

type Draft = { e: string; cop: string; critical: string; normal: string; flexible: string };
const toDraft = (p: Pricing): Draft => ({
  e: String(p.electricityChfPerKwh),
  cop: String(p.heatPumpCop),
  critical: num(p.computeChfPerServerHour.critical, 3),
  normal: num(p.computeChfPerServerHour.normal, 3),
  flexible: num(p.computeChfPerServerHour.flexible, 3),
});
/** A price field is valid when it is a number above zero. */
export const validPrice = (v: string) => /^\s*\d+(\.\d+)?\s*$/.test(v) && Number(v) > 0;

function PricingForm({ p }: { p: Pricing }) {
  const [d, setD] = useState<Draft>(() => toDraft(p));
  const save = usePricingMutation();
  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(p));
  const invalid = (Object.keys(d) as (keyof Draft)[]).filter((k) => !validPrice(d[k]));
  const fields: [keyof Draft, string, string, string][] = [
    ["e", "Electricity price", "CHF/kWh", "ElCom 2026, IWB Basel H4. To be confirmed."],
    ["cop", "Heat pump efficiency (COP)", "", "Heat replaces heat-pump heat with this efficiency."],
    ["critical", "Compute price, critical", "CHF/server-h", "On-demand reference"],
    ["normal", "Compute price, normal", "CHF/server-h", "Midpoint"],
    ["flexible", "Compute price, flexible", "CHF/server-h", "Spot reference"],
  ];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (invalid.length) return;
    save.mutate({
      electricityChfPerKwh: Number(d.e),
      heatPumpCop: Number(d.cop),
      computeChfPerServerHour: { critical: Number(d.critical), normal: Number(d.normal), flexible: Number(d.flexible) },
    });
  };
  const heat = validPrice(d.e) && validPrice(d.cop) ? Number(d.e) / Number(d.cop) : null;
  return (
    <form onSubmit={submit} noValidate>
      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        {fields.map(([k, label, unit, hint]) => (
          <Field key={k} label={unit ? `${label}, ${unit}` : label} htmlFor={`price-${k}`} hint={hint} error={validPrice(d[k]) ? null : "Enter a number above 0"}>
            <input
              id={`price-${k}`}
              inputMode="decimal"
              className={`${inputClass} tnum`}
              value={d[k]}
              aria-invalid={!validPrice(d[k])}
              onChange={(e) => {
                save.reset();
                setD({ ...d, [k]: e.target.value });
              }}
            />
          </Field>
        ))}
        <div className="flex flex-col gap-1 rounded-ctl border border-line bg-surface-2 px-3 py-2">
          <span className="text-xs font-semibold text-ink-2">Value of heat, derived</span>
          <span className="text-lg font-light tnum">
            {num(heat, 3)} <span className="text-xs text-ink-3">CHF/kWh</span>
          </span>
          <span className="text-xs text-ink-3">electricity price divided by COP</span>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={!dirty || invalid.length > 0 || save.isPending}>
          {save.isPending ? "Saving…" : "Save prices"}
        </Button>
        <Button variant="ghost" disabled={!dirty} onClick={() => setD(toDraft(p))}>
          Discard changes
        </Button>
        <span role="status" aria-live="polite" className="text-sm">
          {save.isSuccess && (
            <span className="inline-flex items-center gap-1 text-ok-ink">
              <Check aria-hidden className="h-4 w-4" />
              Saved. Money figures use the new prices from the next slot.
            </span>
          )}
          {save.isError && <span className="text-critical-ink">{save.error instanceof Error ? save.error.message : "The prices were not saved."}</span>}
        </span>
      </div>
      <p className="mt-3 text-xs text-ink-3">{`Changes last until the backend restarts. Source: ${p.source}`}</p>
    </form>
  );
}

const agentCols: Column<Agent>[] = [
  { key: "serverId", label: "Server", render: (a) => <span className="font-mono text-xs">{a.serverId}</span> },
  { key: "host", label: "Laptop", render: (a) => a.host ?? "–" },
  { key: "online", label: "Origin", render: (a) => (a.online ? <OriginBadge live /> : <span className="text-xs text-critical-ink">Offline</span>) },
  { key: "cpuPct", label: "CPU", num: true, render: (a) => `${num(a.cpuPct, 0)} %` },
  { key: "secondsSinceSeen", label: "Last heartbeat", num: true, render: (a) => (a.secondsSinceSeen == null ? "–" : `${num(a.secondsSinceSeen, 0)} s ago`) },
  { key: "processes", label: "Real processes", num: true, sortValue: (a) => a.processes.length, render: (a) => num(a.processes.length, 0) },
];

export default function SettingsPage() {
  const pricing = usePricing();
  const agents = useAgents();
  const conn = useLive((s) => s.conn);
  const clock = useLive((s) => s.clock);
  const { theme, set } = useTheme();
  const { reduced } = useMotion();
  return (
    <OpsPage title="Settings" sub="Prices behind the money figures, the laptops that run real work, and display options.">
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 max-xl:grid-cols-1">
        <Card className="p-5">
          <CardHeader title="Pricing" sub="GET and PUT /admin/settings/pricing" />
          <div className="mt-4">
            {pricing.isPending ? (
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-14 rounded-ctl" />
                ))}
              </div>
            ) : pricing.isError ? (
              <ErrorState compact error={pricing.error} onRetry={() => void pricing.refetch()} />
            ) : (
              <PricingForm key={JSON.stringify(pricing.data)} p={pricing.data} />
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <CardHeader title="Connection" />
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-ink-3">Data</dt>
              <dd>{env.mode === "mock" ? "Mock: recorded responses, no backend" : "Live backend"}</dd>
              <dt className="text-ink-3">API</dt>
              <dd className="truncate font-mono text-xs">{env.apiBase}</dd>
              <dt className="text-ink-3">WebSocket</dt>
              <dd>{conn.state === "open" ? "Connected" : conn.state === "reconnecting" ? `Reconnecting, attempt ${conn.attempts}` : conn.state}</dd>
              <dt className="text-ink-3">MQTT broker</dt>
              <dd>{agents.data?.mqtt ?? clock?.mqtt ?? "–"}</dd>
            </dl>
            <p className="mt-3 text-xs text-ink-3">Press Shift + D to change the API address or switch to mock data.</p>
          </Card>
          <Card className="p-5">
            <CardHeader title="Display" />
            <div className="mt-3 flex flex-col gap-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span>Theme</span>
                <Segmented
                  label="Theme"
                  value={theme}
                  onChange={set}
                  options={[
                    { value: "light", label: "Light", icon: Sun },
                    { value: "dark", label: "Dark", icon: Moon },
                  ]}
                />
              </div>
              <label className="flex items-center justify-between gap-4">
                <span>
                  Reduce motion
                  <span className="block text-xs text-ink-3">Animations become instant changes with text equivalents.</span>
                </span>
                <input type="checkbox" checked={reduced} onChange={(e) => setReducedMotion(e.target.checked || null)} className="h-5 w-5 accent-[rgb(var(--tank))]" />
              </label>
            </div>
          </Card>
        </div>

        <Card className="p-5 xl:col-span-2">
          <CardHeader title="Live laptops" sub="A server is LIVE only while a laptop agent runs its work for real. Every other server is SIMULATED." right={<OriginBadge live={false} />} />
          <div className="mt-4">
            {agents.isPending ? (
              <Skeleton className="h-24 rounded-card" />
            ) : agents.isError ? (
              <ErrorState compact error={agents.error} onRetry={() => void agents.refetch()} />
            ) : !agents.data?.items.length ? (
              <EmptyState
                compact
                icon={Laptop}
                title="No laptop connected"
                body={
                  <>
                    Start the MQTT broker with <code className="font-mono text-xs">python -m live.broker</code>, then on each laptop run{" "}
                    <code className="font-mono text-xs">python -m live.agent --server-id H1-S1 --host &lt;broker IP&gt;</code>. Until then every server is simulated.
                  </>
                }
              />
            ) : (
              <DataTable caption="Live laptop agents" columns={agentCols} rows={agents.data.items} rowKey={(a) => a.serverId} />
            )}
          </div>
        </Card>
      </div>
    </OpsPage>
  );
}
