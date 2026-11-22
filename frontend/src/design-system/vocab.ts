/** Status vocabulary: label, tone and icon for every state the backend sends. Status is never colour alone. */
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Check,
  Clock3,
  Droplet,
  Info,
  Moon,
  Pause,
  Play,
  Shuffle,
  WifiOff,
  Wind,
  X,
  type LucideIcon,
} from "lucide-react";

export type Tone = "heat" | "tank" | "ok" | "idle" | "dump" | "critical";
export type Vocab = { label: string; tone: Tone; icon: LucideIcon; text?: string };

export const siteStatus: Record<string, Vocab> = {
  covered: { label: "Covered", tone: "ok", icon: CheckCircle2, text: "Heat demand is covered by server heat and the tank." },
  tank_low: { label: "Tank low", tone: "tank", icon: Droplet, text: "Tank below 20 %. The scheduler places more compute here." },
  dumping: { label: "Dumping heat", tone: "dump", icon: Wind, text: "Tank full. Surplus heat is being thrown away." },
  unmet: { label: "Backup heat needed", tone: "critical", icon: AlertOctagon, text: "The backup heater covers part of the demand." },
  offline: { label: "Offline", tone: "idle", icon: WifiOff, text: "No data from this site. Last values shown." },
};

export const taskState: Record<string, Vocab> = {
  waiting: { label: "Queued", tone: "idle", icon: Clock3 },
  ready: { label: "Ready", tone: "idle", icon: Clock3 },
  running: { label: "Running", tone: "heat", icon: Play },
  paused: { label: "Paused", tone: "dump", icon: Pause },
  done: { label: "Complete", tone: "ok", icon: Check },
  missed: { label: "Missed deadline", tone: "critical", icon: AlertOctagon },
  cancelled: { label: "Cancelled", tone: "idle", icon: X },
};

export const jobStatus: Record<string, Vocab> = {
  queued: { label: "Queued", tone: "idle", icon: Clock3 },
  running: { label: "Running", tone: "heat", icon: Play },
  done: { label: "Complete", tone: "ok", icon: Check },
  missed: { label: "Missed deadline", tone: "critical", icon: AlertOctagon },
  cancelled: { label: "Cancelled", tone: "idle", icon: X },
};

export const serverState: Record<string, Vocab> = {
  online: { label: "Online", tone: "ok", icon: CheckCircle2 },
  working: { label: "Working", tone: "heat", icon: Play },
  idle: { label: "Idle", tone: "idle", icon: Moon },
  offline: { label: "Offline", tone: "critical", icon: WifiOff },
};

export const severity: Record<string, Vocab> = {
  critical: { label: "Critical", tone: "critical", icon: AlertOctagon },
  warning: { label: "Warning", tone: "dump", icon: AlertTriangle },
  info: { label: "Info", tone: "idle", icon: Info },
};

export const eventKind: Record<string, Vocab> = {
  ready: { label: "Ready", tone: "idle", icon: Clock3 },
  started: { label: "Started", tone: "heat", icon: Play },
  paused: { label: "Paused", tone: "dump", icon: Pause },
  resumed: { label: "Resumed", tone: "heat", icon: Play },
  migrated: { label: "Migrated", tone: "tank", icon: Shuffle },
  server_lost: { label: "Server lost", tone: "critical", icon: WifiOff },
  completed: { label: "Completed", tone: "ok", icon: Check },
  missed: { label: "Missed deadline", tone: "critical", icon: AlertOctagon },
  cancelled: { label: "Cancelled", tone: "idle", icon: X },
};

export const alertKind: Record<string, string> = {
  unmet_demand: "Backup heat",
  heat_dumped: "Heat dumped",
  deadline_missed: "Missed deadline",
  server_offline: "Server offline",
};

/** The backend raises unmet demand as "warning"; backup heat is critical in this product (FRONTEND_GAPS.md). */
export const effectiveSeverity = (a: { severity: string; kind: string }) => (a.kind === "unmet_demand" || a.kind === "server_offline" ? "critical" : a.severity);

/** Tailwind classes per tone. Text uses the -ink variant (AA on both themes). */
export const toneText: Record<Tone, string> = {
  heat: "text-heat-ink",
  tank: "text-tank-ink",
  ok: "text-ok-ink",
  idle: "text-idle-ink",
  dump: "text-dump-ink",
  critical: "text-critical-ink",
};
export const toneBg: Record<Tone, string> = {
  heat: "bg-heat",
  tank: "bg-tank",
  ok: "bg-ok",
  idle: "bg-idle",
  dump: "bg-dump",
  critical: "bg-critical",
};
export const toneSoft: Record<Tone, string> = {
  heat: "bg-heat/10 border-heat/35 text-heat-ink",
  tank: "bg-tank/10 border-tank/35 text-tank-ink",
  ok: "bg-ok/10 border-ok/35 text-ok-ink",
  idle: "bg-idle/10 border-idle/35 text-idle-ink",
  dump: "bg-dump/15 border-dump/40 text-dump-ink",
  critical: "bg-critical/10 border-critical/40 text-critical-ink",
};
export const toneVar: Record<Tone, string> = {
  heat: "rgb(var(--heat))",
  tank: "rgb(var(--tank))",
  ok: "rgb(var(--ok))",
  idle: "rgb(var(--idle))",
  dump: "rgb(var(--dump))",
  critical: "rgb(var(--critical))",
};
export const toneAlpha = (t: Tone, a: number) => `rgb(var(--${t}) / ${a})`;
