/** TaskChain (queued -> running -> paused or migrated -> complete), TaskGraph (dependencies), Timeline */
import type { ReactNode } from "react";
import { Check, Clock3, Pause, Play, Shuffle, AlertOctagon, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { time } from "@/lib/time";
import type { Task, TaskEvent } from "@/api/types";
import { eventKind, taskState, toneAlpha, toneText, toneVar, type Tone } from "./vocab";

type Step = { label: string; icon: typeof Check; state: "done" | "current" | "todo" | "skipped"; tone: Tone };

export function TaskChain({ task, compact }: { task: Pick<Task, "id" | "state" | "hold"> & { events?: TaskEvent[] }; compact?: boolean }) {
  const ev = task.events ?? [];
  const nMig = ev.filter((e) => e.kind === "migrated").length;
  const nPause = ev.filter((e) => e.kind === "paused").length;
  const st = task.state;
  const started = !["waiting", "ready"].includes(st) || ev.some((e) => e.kind === "started");
  const detour = nMig + nPause > 0;
  const steps: Step[] = [
    { label: st === "ready" ? "Ready" : "Queued", icon: Clock3, state: started ? "done" : "current", tone: "idle" },
    { label: "Running", icon: Play, state: !started ? "todo" : st === "running" && !detour ? "current" : "done", tone: "heat" },
    st === "paused"
      ? { label: task.hold ? "Paused by operator" : "Paused", icon: Pause, state: "current", tone: "dump" }
      : detour
        ? {
            label: [nMig && `Migrated ×${nMig}`, nPause && `Paused ×${nPause}`].filter(Boolean).join(", "),
            icon: Shuffle,
            state: st === "running" ? "current" : "done",
            tone: st === "running" ? "heat" : "tank",
          }
        : { label: "No pause or move", icon: Shuffle, state: "skipped", tone: "idle" },
    st === "missed"
      ? { label: "Missed deadline", icon: AlertOctagon, state: "current", tone: "critical" }
      : st === "cancelled"
        ? { label: "Cancelled", icon: X, state: "current", tone: "idle" }
        : { label: "Complete", icon: Check, state: st === "done" ? "current" : "todo", tone: "ok" },
  ];
  const summary = `Task ${task.id}: ${taskState[st]?.label ?? st}${nMig ? `, migrated ${nMig} times` : ""}${nPause ? `, paused ${nPause} times` : ""}`;
  return (
    <ol className="flex w-full items-start" aria-label={summary}>
      {steps.map((s, i) => {
        const I = s.state === "done" ? Check : s.icon;
        return (
          <li key={i} className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn("absolute right-1/2 top-[9px] h-0.5 w-full", s.state === "done" || s.state === "current" ? "bg-ok/60" : "bg-surface-3")}
                style={compact ? { top: 6 } : undefined}
              />
            )}
            <span
              className={cn(
                "relative z-10 grid place-items-center rounded-full border-2 bg-surface transition-colors duration-300",
                compact ? "h-3.5 w-3.5" : "h-5 w-5",
                s.state === "done" && "border-ok text-ok-ink",
                s.state === "current" && cn(toneText[s.tone]),
                s.state === "todo" && "border-line-strong text-ink-3",
                s.state === "skipped" && "border-dashed border-line-strong text-ink-3",
              )}
              style={s.state === "current" ? { borderColor: toneVar[s.tone], boxShadow: `0 0 0 3px ${toneAlpha(s.tone, 0.18)}` } : undefined}
            >
              {!compact && <I aria-hidden className="h-2.5 w-2.5" />}
            </span>
            {!compact && <span className={cn("text-2xs leading-tight", s.state === "current" ? "font-semibold text-ink" : "text-ink-3")}>{s.label}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function TaskGraph({ tasks, selected, onSelect }: { tasks: Task[]; selected?: string; onSelect?: (t: Task) => void }) {
  if (!tasks.length) return <p className="text-sm text-ink-3">This job has no tasks.</p>;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depth = new Map<string, number>();
  const dep = (t: Task, seen = new Set<string>()): number => {
    if (depth.has(t.id)) return depth.get(t.id)!;
    if (seen.has(t.id)) return 0; // a cycle never hangs the drawing
    seen.add(t.id);
    const parents = t.dependsOn.filter((x) => byId.has(x));
    const d = parents.length ? 1 + Math.max(...parents.map((x) => dep(byId.get(x)!, seen))) : 0;
    depth.set(t.id, d);
    return d;
  };
  tasks.forEach((t) => dep(t));
  const cols: Task[][] = [];
  tasks.forEach((t) => (cols[depth.get(t.id)!] ??= []).push(t));
  const nw = 150,
    nh = 42,
    gx = 40,
    gy = 10;
  const rows = Math.max(...cols.map((c) => c.length));
  const W = cols.length * (nw + gx) - gx,
    H = rows * (nh + gy) - gy;
  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach((c, ci) => {
    const off = ((rows - c.length) * (nh + gy)) / 2;
    c.forEach((t, ri) => pos.set(t.id, { x: ci * (nw + gx), y: off + ri * (nh + gy) }));
  });
  const short = (s: string) => (s.length > 20 ? s.slice(0, 19) + "…" : s);
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} width={W + 4} height={H + 4} role="group" aria-label={`Task dependencies: ${tasks.length} tasks in ${cols.length} stages`}>
        {tasks.flatMap((t) =>
          t.dependsOn
            .filter((x) => pos.has(x))
            .map((x) => {
              const a = pos.get(x)!,
                b = pos.get(t.id)!;
              return (
                <path
                  key={`${x}-${t.id}`}
                  d={`M${a.x + nw} ${a.y + nh / 2} C${a.x + nw + gx / 2} ${a.y + nh / 2} ${b.x - gx / 2} ${b.y + nh / 2} ${b.x} ${b.y + nh / 2}`}
                  fill="none"
                  stroke={byId.get(x)?.state === "done" ? "rgb(var(--ok) / 0.6)" : "rgb(var(--line-strong))"}
                  strokeWidth="1.5"
                />
              );
            }),
        )}
        {tasks.map((t) => {
          const p = pos.get(t.id)!;
          const v = taskState[t.state] ?? taskState.waiting;
          const active = t.state === "running" || t.state === "paused";
          return (
            <g
              key={t.id}
              transform={`translate(${p.x} ${p.y})`}
              tabIndex={onSelect ? 0 : undefined}
              role={onSelect ? "button" : undefined}
              aria-label={`${t.name}, ${v.label}${active ? `, ${Math.round(t.progressPct)} percent` : ""}`}
              onClick={onSelect ? () => onSelect(t) : undefined}
              onKeyDown={onSelect ? (e) => e.key === "Enter" && onSelect(t) : undefined}
              className={onSelect ? "cursor-pointer" : undefined}
            >
              <rect width={nw} height={nh} rx="8" fill="rgb(var(--surface-2))" stroke={toneVar[v.tone]} strokeWidth={selected === t.id ? 2.5 : 1.2} />
              {active && <rect x="1" y={nh - 4} width={Math.max(0, ((nw - 2) * t.progressPct) / 100)} height="3" rx="1.5" fill={toneVar[v.tone]} />}
              <text x="10" y="17" fontSize="11.5" fontWeight="500" fill="rgb(var(--ink))">
                {short(t.name)}
              </text>
              <text x="10" y="31" fontSize="10" fill="rgb(var(--ink-3))">
                {v.label}
                {active ? ` · ${Math.round(t.progressPct)} %` : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export type TimelineItem = { key: string; time: string; kind: string; title?: ReactNode; detail?: ReactNode; isNew?: boolean };

export function Timeline({ items, empty = "Nothing has happened yet.", showDay }: { items: TimelineItem[]; empty?: string; showDay?: boolean }) {
  if (!items.length) return <p className="text-sm text-ink-3">{empty}</p>;
  return (
    <ol className="flex flex-col">
      {items.map((it, i) => {
        const v = eventKind[it.kind] ?? { label: it.kind, tone: "idle" as Tone, icon: Clock3 };
        const I = v.icon;
        return (
          <li key={it.key} className={cn("relative grid grid-cols-[20px_1fr_auto] gap-3 pb-3 text-sm", it.isNew && "animate-rise")}>
            {i < items.length - 1 && <span aria-hidden className="absolute bottom-0 left-[9px] top-5 w-0.5 bg-line" />}
            <span className={cn("grid h-5 w-5 place-items-center rounded-full", toneText[v.tone])} style={{ background: toneAlpha(v.tone, 0.15) }}>
              <I aria-hidden className="h-3 w-3" />
            </span>
            <span className="min-w-0">
              <span className="font-medium text-ink">{it.title ?? v.label}</span>
              {it.detail && <span className="text-ink-2"> {it.detail}</span>}
            </span>
            <time dateTime={it.time} className="whitespace-nowrap text-xs tnum text-ink-3">
              {showDay ? time.dayTime(it.time) : time.hm(it.time)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}

/** Human sentence for one lifecycle event (operator view; ids allowed) */
export function eventDetail(e: { kind: string; fromServerId?: string | null; toServerId?: string | null; fromServer?: string | null; toServer?: string | null }) {
  const from = e.fromServerId ?? e.fromServer,
    to = e.toServerId ?? e.toServer;
  if (e.kind === "migrated") return `${from ?? "?"} → ${to ?? "?"}`;
  if ((e.kind === "started" || e.kind === "resumed") && to) return `on ${to}`;
  if (e.kind === "paused" && from) return `on ${from}`;
  if (e.kind === "server_lost" && from) return `${from} went offline`;
  if (e.kind === "completed" && from) return `on ${from}`;
  return "";
}
