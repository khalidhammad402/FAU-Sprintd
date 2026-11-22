/** Small pieces shared by the Compute Portal screens. */
import { ChevronsUp, ChevronUp, Shuffle, ShieldCheck, Lock, Cpu, Trash2 } from "lucide-react";
import { Chip, Pop, type TimelineItem } from "@/design-system";
import type { Task } from "@/api/types";
import { tierOf, type Priority } from "@/lib/tiers";

const tierIcon = { critical: ChevronsUp, normal: ChevronUp, flexible: Shuffle } as const;

/** Tier label in buyer words. Neutral tone: tiers have no physical meaning, so no data colour. */
export function TierChip({ priority, size = "sm" }: { priority: string; size?: "sm" | "md" }) {
  const I = tierIcon[priority as Priority] ?? ChevronUp;
  return (
    <Chip tone="idle" icon={I} size={size}>
      {tierOf(priority).label}
    </Chip>
  );
}

/** Neutral ramp for the tiers (light theme): dark to light, never a semantic colour */
export const tierColor: Record<Priority, string> = { critical: "rgb(15 23 42)", normal: "rgb(100 116 139)", flexible: "rgb(203 213 225)" };

export function TrustLine() {
  return (
    <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
      <ShieldCheck aria-hidden className="h-4 w-4 text-ok-ink" />
      Swiss-hosted, data stays in Switzerland.
      <SecurityPop />
    </p>
  );
}

export function SecurityPop() {
  return (
    <Pop
      label="How your data is protected"
      width={340}
      trigger={
        <button type="button" className="text-sm font-medium text-accent underline decoration-line-strong underline-offset-4 hover:decoration-current">
          How your data is protected
        </button>
      }
    >
      <ul className="flex flex-col gap-3 text-sm">
        <li className="grid grid-cols-[20px_1fr] gap-2">
          <Lock aria-hidden className="mt-0.5 h-4 w-4 text-ink-3" />
          <span>
            <b className="font-semibold">Sealed rack.</b> <span className="text-ink-2">Servers sit in a locked, liquid-cooled enclosure at the host site. The host business has no access to them.</span>
          </span>
        </li>
        <li className="grid grid-cols-[20px_1fr] gap-2">
          <Cpu aria-hidden className="mt-0.5 h-4 w-4 text-ink-3" />
          <span>
            <b className="font-semibold">Confidential computing.</b> <span className="text-ink-2">Workloads run isolated from other customers and from the operator.</span>
          </span>
        </li>
        <li className="grid grid-cols-[20px_1fr] gap-2">
          <Trash2 aria-hidden className="mt-0.5 h-4 w-4 text-ink-3" />
          <span>
            <b className="font-semibold">Ephemeral execution.</b> <span className="text-ink-2">Working data is removed from the server when a task finishes or moves.</span>
          </span>
        </li>
      </ul>
      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-3">Design wording for the demo. The security owner must confirm these claims before launch.</p>
    </Pop>
  );
}

/**
 * Lifecycle events in buyer words. A compute buyer never sees host operations: no site names, server ids
 * or tank levels, even though the API sends server ids (docs/gaps/compute.md).
 */
export function buyerTimeline(tasks: Task[]): TimelineItem[] {
  const text: Record<string, string> = {
    ready: "ready to run",
    started: "started on a Swiss server",
    paused: "paused while a host's tank was full",
    resumed: "resumed",
    migrated: "moved to another site where heat is needed",
    server_lost: "a server stopped; the task moves to another one",
    completed: "finished",
    missed: "missed its deadline",
    cancelled: "cancelled",
  };
  return tasks
    .flatMap((t) =>
      (t.events ?? []).map((e, i) => ({
        key: `${t.id}-${i}-${e.kind}-${e.time}`,
        order: i,
        time: e.time,
        kind: e.kind,
        title: t.name,
        detail: e.kind === "paused" && t.hold ? "paused by DigitalHeat operations" : (text[e.kind] ?? e.kind),
      })),
    )
    // newest first; events of one task at the same time keep their real order (later step on top)
    .sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : b.order - a.order))
    .map(({ order: _order, ...it }) => it);
}

/** Save rows as a CSV file (built in the browser: there is no invoice download endpoint) */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => (typeof v === "number" ? String(v) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
