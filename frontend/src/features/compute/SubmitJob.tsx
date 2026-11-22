import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Send, Trash2 } from "lucide-react";
import { ApiError } from "@/api/client";
import { useCustomerMutations } from "@/api/queries";
import type { Task } from "@/api/types";
import { Button, Card, CardHeader, Field, InfoPop, inputClass, Segmented, TaskGraph } from "@/design-system";
import { cn } from "@/lib/cn";
import { chf, num } from "@/lib/format";
import { time } from "@/lib/time";
import { priorities, tiers, type Priority } from "@/lib/tiers";
import { useNow } from "@/live/store";
import { useRates } from "./data";
import { errorsFromDetails, longestChainMin, MAX_TASK_KW, newTask, ONE_GPU_KW, serverHours, toSubmitBody, validateJob, type Errors, type JobDraft, type TaskDraft } from "./jobForm";
import { TrustLine } from "./ui";

const templates: Record<string, () => Pick<JobDraft, "name" | "priority" | "deadlineInMin" | "tasks">> = {
  single: () => ({ name: "Transcribe recordings", priority: "critical", deadlineInMin: 180, tasks: [{ ...newTask(1), key: "T1", name: "transcribe", runtimeMin: 60, interruptible: false }] }),
  embed: () => ({
    name: "Embed document archive",
    priority: "flexible",
    deadlineInMin: 1440,
    tasks: [
      ...[1, 2, 3, 4].map((i) => ({ ...newTask(i), key: `B${i}`, name: `embed batch ${i}`, runtimeMin: 30, powerKw: ONE_GPU_KW / 2 })),
      { ...newTask(5), key: "M", name: "merge index", runtimeMin: 15, powerKw: ONE_GPU_KW / 2, dependsOn: ["B1", "B2", "B3", "B4"] },
    ],
  }),
  finetune: () => ({
    name: "Fine-tune language model",
    priority: "flexible",
    deadlineInMin: 4320,
    tasks: [
      ...[1, 2, 3, 4].map((i) => ({ ...newTask(i), key: `W${i}`, name: `train worker ${i}`, runtimeMin: 480 })),
      { ...newTask(5), key: "E", name: "evaluate", runtimeMin: 30, dependsOn: ["W1", "W2", "W3", "W4"] },
    ],
  }),
};

const WAIT: Record<Priority, string> = {
  critical: "Starts in the next 15-minute slot.",
  normal: "Usually starts within the hour.",
  flexible: "Runs when a host business needs heat, at the latest in time for the deadline.",
};

function TaskRow({ t, i, all, errors, onChange, onRemove }: { t: TaskDraft; i: number; all: TaskDraft[]; errors: Errors; onChange: (p: Partial<TaskDraft>) => void; onRemove?: () => void }) {
  const id = (f: string) => `task-${i}-${f}`;
  const err = (f: string) => errors[`tasks.${i}.${f}`];
  const others = all.filter((o) => o.key !== t.key && o.key.trim());
  return (
    <fieldset className="rounded-card border border-line p-4">
      <legend className="px-1 text-xs font-semibold text-ink-2">Task {i + 1}</legend>
      <div className="grid grid-cols-[90px_minmax(0,1fr)_110px_110px_80px] gap-3 max-lg:grid-cols-2">
        <Field label="Id" htmlFor={id("key")} error={err("key")}>
          <input id={id("key")} className={cn(inputClass, "font-mono")} value={t.key} aria-invalid={!!err("key")} onChange={(e) => onChange({ key: e.target.value.replace(/\s/g, "") })} />
        </Field>
        <Field label="Name" htmlFor={id("name")}>
          <input id={id("name")} className={inputClass} value={t.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <Field label="Runtime, min" htmlFor={id("runtimeMin")} error={err("runtimeMin")}>
          <input id={id("runtimeMin")} type="number" min={1} inputMode="numeric" className={cn(inputClass, "tnum")} value={t.runtimeMin} aria-invalid={!!err("runtimeMin")} onChange={(e) => onChange({ runtimeMin: e.target.value === "" ? "" : Number(e.target.value) })} />
        </Field>
        <Field label="Power, kW" htmlFor={id("powerKw")} error={err("powerKw")}>
          <input id={id("powerKw")} type="number" min={0.001} max={MAX_TASK_KW} step={0.001} inputMode="decimal" className={cn(inputClass, "tnum")} value={t.powerKw} aria-invalid={!!err("powerKw")} onChange={(e) => onChange({ powerKw: e.target.value === "" ? "" : Number(e.target.value) })} />
        </Field>
        <Field label="Threads" htmlFor={id("threads")} error={err("threads")}>
          <input id={id("threads")} type="number" min={1} step={1} className={cn(inputClass, "tnum")} value={t.threads} aria-invalid={!!err("threads")} onChange={(e) => onChange({ threads: e.target.value === "" ? "" : Number(e.target.value) })} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="mb-1.5 block text-xs font-semibold text-ink-2">Starts after</span>
          {others.length === 0 ? (
            <span className="text-xs text-ink-3">No other task yet.</span>
          ) : (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Task ${t.key} starts after`}>
              {others.map((o) => {
                const on = t.dependsOn.includes(o.key);
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ dependsOn: on ? t.dependsOn.filter((x) => x !== o.key) : [...t.dependsOn, o.key] })}
                    className={cn("h-7 rounded-full border px-2.5 font-mono text-xs transition-colors", on ? "border-tank/60 bg-tank/15 text-ink" : "border-line-strong text-ink-2 hover:bg-surface-2")}
                  >
                    {o.key}
                  </button>
                );
              })}
            </div>
          )}
          {err("dependsOn") && <p className="mt-1 text-xs text-critical-ink">{err("dependsOn")}</p>}
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={t.interruptible} onChange={(e) => onChange({ interruptible: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--tank))]" />
            Can pause or move
          </label>
          {onRemove && <Button size="sm" variant="ghost" icon={Trash2} onClick={onRemove} aria-label={`Remove task ${t.key}`}>Remove</Button>}
        </div>
      </div>
    </fieldset>
  );
}

export default function SubmitJob() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const now = useNow();
  const { rates } = useRates();
  const { submit } = useCustomerMutations();
  const start = () => ({ deadlineMode: "in" as const, deadlineAt: "", ...(templates[params.get("template") ?? "embed"] ?? templates.embed)() });
  const [d, setD] = useState<JobDraft>(start);
  const [errors, setErrors] = useState<Errors>({});
  const [tried, setTried] = useState(false);
  const live = useMemo(() => validateJob(d, now), [d, now]);
  const shown = tried ? { ...live, ...errors } : errors;
  const set = (p: Partial<JobDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setErrors({});
  };
  const setTask = (i: number, p: Partial<TaskDraft>) =>
    set({
      tasks: d.tasks.map((t, j) => {
        if (j === i) return { ...t, ...p };
        // keep dependencies pointing at a renamed task
        return p.key !== undefined ? { ...t, dependsOn: t.dependsOn.map((x) => (x === d.tasks[i].key ? p.key! : x)) } : t;
      }),
    });
  const chain = longestChainMin(d.tasks);
  const hours = serverHours(d.tasks);
  const rate = rates[d.priority];
  const graphTasks = d.tasks.map((t) => ({ id: t.key, jobId: "new", name: t.name || t.key, state: "waiting", progressPct: 0, dependsOn: t.dependsOn }) as unknown as Task);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.keys(live).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true],[data-error]")?.focus());
      return;
    }
    try {
      const job = await submit.mutateAsync(toSubmitBody(d, now));
      nav(`/compute/jobs?job=${job.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors({ ...errorsFromDetails(err.details), form: err.message });
      else setErrors({ form: err instanceof Error ? err.message : "The job could not be submitted." });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-6 max-xl:grid-cols-1">
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardHeader title="Job" sub="Start from a template or edit the tasks below." />
            <Segmented
              label="Template"
              size="sm"
              value={params.get("template") ?? "embed"}
              onChange={(v) => {
                setParams({ template: v }, { replace: true });
                setD({ ...d, ...templates[v]() });
                setErrors({});
                setTried(false);
              }}
              options={[
                { value: "single", label: "Single task" },
                { value: "embed", label: "Batches + merge" },
                { value: "finetune", label: "Fine-tune" },
              ]}
            />
          </div>
          <Field label="Job name" htmlFor="job-name" error={shown.name}>
            <input id="job-name" className={inputClass} value={d.name} aria-invalid={!!shown.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <div role="radiogroup" aria-label="Priority tier" className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            {priorities.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={d.priority === p}
                onClick={() => set({ priority: p })}
                className={cn("flex flex-col gap-1 rounded-card border p-4 text-left transition-colors", d.priority === p ? "border-accent bg-accent/5 shadow-[inset_0_0_0_1px_rgb(var(--accent))]" : "border-line hover:border-line-strong")}
              >
                <span className="text-sm font-semibold">{tiers[p].label}</span>
                <span className="text-xs text-ink-2">{tiers[p].blurb}</span>
                <span className="mt-1 text-xs text-ink-3">
                  {tiers[p].price}
                  {rates[p].chfPerServerHour != null && `, about ${chf(rates[p].chfPerServerHour, 2)} per server-hour`}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Segmented label="Deadline type" size="sm" value={d.deadlineMode} onChange={(v) => set({ deadlineMode: v })} options={[{ value: "in", label: "Within" }, { value: "at", label: "By date" }]} />
            {d.deadlineMode === "in" ? (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Deadline in minutes" htmlFor="dl-in" error={shown.deadline}>
                  <input id="dl-in" type="number" min={1} className={cn(inputClass, "w-36 tnum")} value={d.deadlineInMin} aria-invalid={!!shown.deadline} onChange={(e) => set({ deadlineInMin: e.target.value === "" ? "" : Number(e.target.value) })} />
                </Field>
                {[
                  [180, "3 h"],
                  [720, "12 h"],
                  [1440, "1 day"],
                  [4320, "3 days"],
                ].map(([m, l]) => (
                  <Button key={m} size="sm" variant={d.deadlineInMin === m ? "secondary" : "ghost"} onClick={() => set({ deadlineInMin: Number(m) })}>
                    {l}
                  </Button>
                ))}
              </div>
            ) : (
              <Field label="Deadline, simulated time" htmlFor="dl-at" error={shown.deadline}>
                <input id="dl-at" type="datetime-local" className={cn(inputClass, "w-56 tnum")} value={d.deadlineAt} aria-invalid={!!shown.deadline} onChange={(e) => set({ deadlineAt: e.target.value })} />
              </Field>
            )}
          </div>
        </Card>

        <section aria-labelledby="tasks-h" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 id="tasks-h" className="text-md font-semibold">
              Tasks <span className="text-ink-3 tnum">{d.tasks.length}</span>
            </h2>
            <Button size="sm" icon={Plus} onClick={() => set({ tasks: [...d.tasks, newTask(d.tasks.length + 1)] })}>
              Add task
            </Button>
          </div>
          {shown.tasks && (
            <p role="alert" data-error tabIndex={-1} className="rounded-card border border-critical/40 bg-critical/10 px-4 py-2.5 text-sm text-critical-ink">
              {shown.tasks}
            </p>
          )}
          {d.tasks.map((t, i) => (
            <TaskRow
              key={i}
              t={t}
              i={i}
              all={d.tasks}
              errors={shown}
              onChange={(p) => setTask(i, p)}
              onRemove={d.tasks.length > 1 ? () => set({ tasks: d.tasks.filter((_, j) => j !== i).map((x) => ({ ...x, dependsOn: x.dependsOn.filter((k) => k !== t.key) })) }) : undefined}
            />
          ))}
        </section>
      </div>

      <aside className="sticky top-6 flex flex-col gap-4 max-xl:static">
        <Card className="flex flex-col gap-4 p-5">
          <CardHeader title="Estimate" sub="Updates as you edit. Not a quote." />
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-ink-3">Compute</dt>
              <dd className="text-lg font-light tnum">
                {num(hours, 2)} <span className="text-xs text-ink-3">server-h</span>
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-ink-3">
                Cost
                <InfoPop label="How the cost is estimated">
                  <p className="text-sm">Server-hours (runtime × power, on 1 kW servers) × the rate you were billed for this tier so far.</p>
                  <p className="mt-2 text-xs text-ink-3">
                    {rate.basis === "billed" ? "Rate: your billed average for this tier." : rate.basis === "between tiers" ? "No usage in this tier yet: midway between your Priority and Flexible rates." : "No usage yet, so no rate to estimate with."} The price list itself is not available to buyers.
                  </p>
                </InfoPop>
              </dt>
              <dd className="text-lg font-light tnum">{rate.chfPerServerHour == null ? "–" : chf(hours * rate.chfPerServerHour, 2)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-ink-3">Earliest finish</dt>
              <dd className="tnum">{Number.isFinite(chain) && now ? `${time.dayTime(time.addMinutes(now, chain))}, after ${time.duration(chain)} of work in sequence` : "–"}</dd>
              <dd className="mt-1 text-xs text-ink-3">{WAIT[d.priority]}</dd>
            </div>
          </dl>
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold text-ink-2">Dependencies</p>
            <TaskGraph tasks={graphTasks} />
          </div>
          {shown.form && (
            <p role="alert" className="text-sm text-critical-ink">
              {shown.form}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" icon={Send} disabled={submit.isPending}>
            {submit.isPending ? "Submitting…" : "Submit job"}
          </Button>
          <TrustLine />
        </Card>
      </aside>
    </form>
  );
}
