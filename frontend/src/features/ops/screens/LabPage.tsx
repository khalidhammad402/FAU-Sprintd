/** Scheduler Lab: simulated clock, algorithm, greedy vs MPC, offline runs, assumptions. Visually set apart from live operations. */
import { useState } from "react";
import { FastForward, FlaskConical, RotateCcw } from "lucide-react";
import { useResults, useSchedulerMutations } from "@/api/queries";
import { Button, Card, CardHeader, ClockControl, ConfirmDialog, Field, inputClass, PayOffStatement, ProgressBar, Segmented, Skeleton } from "@/design-system";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";
import { time } from "@/lib/time";
import { useLive } from "@/live/store";
import { Assumptions, Comparison, Runs } from "./parts/lab";

const SPEEDS = [10, 5, 2] as const;

export default function LabPage() {
  const clock = useLive((s) => s.clock);
  const { update, jump, reset } = useSchedulerMutations();
  const [date, setDate] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const algorithm = clock?.algorithm ?? "greedy";
  const results = useResults(algorithm === "mpc" ? "mpc" : "greedy");
  const today = time.ymd(clock?.currentTime);
  const min = clock ? time.ymd(time.addMinutes(clock.currentTime, 1440)) : undefined;
  const max = clock ? time.ymd(time.addMinutes(clock.periodEnd, -1)) : undefined;
  const jumping = clock?.mode === "jumping";
  const tooEarly = !!date && !!today && date <= today;
  const err = [update.error, jump.error, reset.error].find(Boolean);

  return (
    <div className="mx-auto w-full max-w-[1480px] px-6 pb-16 pt-6 max-md:px-3">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-card border border-dashed border-dump/60 bg-dump/5 px-5 py-4">
        <div>
          <h1 className="text-xl font-light tracking-tight">Scheduler Lab</h1>
          <p className="mt-1 max-w-[80ch] text-sm text-ink-2">Control the simulated clock, switch the scheduling algorithm and compare yearly runs. Nothing here touches a real installation.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-dump/60 px-2 py-1 text-xs font-semibold text-dump-ink">
          <FlaskConical aria-hidden className="h-3.5 w-3.5" />
          Simulation
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 max-xl:grid-cols-1">
        <Card className="p-5">
          <CardHeader title="Simulated clock" sub="One slot is 15 minutes of simulated time. PUT /admin/scheduler, POST /admin/scheduler/jump" />
          {!clock ? (
            <Skeleton className="mt-4 h-40 rounded-card" />
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <ClockControl />
                <Segmented
                  label="Clock speed"
                  value={clock.slotSeconds}
                  onChange={(v) => update.mutate({ slotSeconds: v })}
                  options={SPEEDS.map((s) => ({ value: s, label: `${s} s per slot` }))}
                />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Jump forward to" htmlFor="jump" error={tooEarly ? "Pick a later date: jumps only go forward." : null}>
                  <input id="jump" type="date" className={cn(inputClass, "w-44 tnum")} min={min} max={max} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={tooEarly} />
                </Field>
                <Button icon={FastForward} disabled={!date || tooEarly || jumping || jump.isPending} onClick={() => jump.mutate(`${date}T00:00:00`)}>
                  {jumping ? "Jumping…" : "Jump"}
                </Button>
                <Button variant="ghost" icon={RotateCcw} disabled={jumping} onClick={() => setConfirmReset(true)}>
                  Reset run
                </Button>
              </div>
              {jumping && (
                <div role="status" aria-live="polite" className="rounded-card border border-dump/40 bg-dump/10 p-3 text-sm">
                  <p className="mb-2 text-dump-ink">{`Fast-forwarding to ${time.date(clock.jumpTarget)}. Now at ${time.dayTime(clock.currentTime)}. Lists reload when the jump ends.`}</p>
                  <ProgressBar value={clock.progressPct} tone="dump" running label="Run progress through the year" />
                </div>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                <dt className="text-ink-3">Mode</dt>
                <dd className="capitalize">{clock.mode}</dd>
                <dt className="text-ink-3">Slot</dt>
                <dd className="tnum">{`${num(clock.slot, 0)} of ${num(clock.slotsTotal, 0)}, ${num(clock.progressPct, 1)} % of the year`}</dd>
                <dt className="text-ink-3">Period</dt>
                <dd className="tnum">{`${time.date(clock.periodStart)} to ${time.date(clock.periodEnd)}`}</dd>
                <dt className="text-ink-3">MQTT broker</dt>
                <dd>{clock.mqtt}</dd>
                <dt className="text-ink-3">Live servers</dt>
                <dd className="font-mono text-xs">{clock.liveServers.length ? clock.liveServers.join(", ") : "none, every server is simulated"}</dd>
              </dl>
              {err && (
                <p role="alert" className="text-sm text-critical-ink">
                  {err instanceof Error ? err.message : "The scheduler did not accept the change."}
                </p>
              )}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <CardHeader
            title="Algorithm"
            sub="Applies to the live run from the next slot."
            right={
              <Segmented
                label="Scheduling algorithm"
                value={algorithm}
                onChange={(v) => update.mutate({ algorithm: v as "greedy" | "mpc" })}
                options={[
                  { value: "greedy", label: "Greedy" },
                  { value: "mpc", label: "MPC" },
                ]}
              />
            }
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ["greedy", "Greedy", "Decides slot by slot. Fills tanks to a target level and pauses or moves flexible work when a tank is full."],
              ["mpc", "MPC", "Plans 24 hours ahead with a demand forecast so tanks are neither full nor empty."],
            ].map(([k, t, d]) => (
              <div key={k} className={cn("rounded-card border p-3", algorithm === k ? "border-tank" : "border-line")}>
                <p className="text-sm font-semibold">{t}</p>
                <p className="mt-1 text-xs text-ink-2">{d}</p>
              </div>
            ))}
          </div>
          <h3 className="mb-1 mt-5 text-xs font-semibold text-ink-2">Greedy compared with MPC, yearly results on disk</h3>
          <Comparison current={algorithm} />
        </Card>

        <Runs algorithm={algorithm} />

        <Card className="p-5">
          <CardHeader title="Assumptions" sub="Every number the model rests on, with its source and status. Select one for details." />
          <div className="mt-4">
            <Assumptions />
          </div>
        </Card>

        <div className="xl:col-span-2">
          {results.isPending ? <Skeleton className="h-28 rounded-card" /> : <PayOffStatement text={results.data?.fleet.payOffStatement} algorithm={results.data?.algorithm} generatedAt={results.data?.generatedAt} />}
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset the live run?"
        body="The simulated clock goes back to the first slot and the backend reloads its input files. Every screen reloads its data."
        confirmLabel="Reset run"
        danger
        busy={reset.isPending}
        onConfirm={() => reset.mutate(undefined, { onSettled: () => setConfirmReset(false) })}
      />
    </div>
  );
}
