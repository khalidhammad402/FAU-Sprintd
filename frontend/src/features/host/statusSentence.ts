/**
 * The one plain-language sentence a facility manager reads first on Today.
 * Pure: REST overview plus, optionally, the latest live slot reading (overview.update).
 */
import type { Tone } from "@/design-system/vocab";
import { num } from "@/lib/format";

export type OverviewLike = {
  serverHeatSharePctToday: number;
  backupHeatTodayKwh: number;
  tankKwh: number;
  tankCapacityKwh: number;
  serversWorking?: number;
  serversTotal?: number;
};
export type LiveLike = { status?: string; tankKwh?: number; unmetKwh?: number; dumpedKwh?: number };

export type HostStatus = "offline" | "backup_now" | "backup_today" | "dumping" | "tank_low" | "covered";
export type Sentence = { key: HostStatus; tone: Tone; label: string; sentence: string };

/** Backup heat below this (kWh) counts as none: it is rounding noise. */
const NOISE = 0.05;

export function statusSentence(overview: OverviewLike | null | undefined, live?: LiveLike | null): Sentence {
  if (!overview && !live) {
    return {
      key: "offline",
      tone: "idle",
      label: "No current data",
      sentence: "We have no current data from your installation. Your backup heater keeps the hot water running.",
    };
  }
  if (live?.status === "offline") {
    return {
      key: "offline",
      tone: "idle",
      label: "Installation not reachable",
      sentence: "We cannot reach your installation right now. Your backup heater keeps the hot water running.",
    };
  }
  if (live?.status === "unmet" || (live?.unmetKwh ?? 0) > NOISE) {
    return {
      key: "backup_now",
      tone: "critical",
      label: "Backup heat in use",
      sentence: "Your backup heater is helping right now. Recovered heat covers the rest.",
    };
  }
  const backup = overview?.backupHeatTodayKwh ?? 0;
  if (backup > NOISE) {
    const share = overview?.serverHeatSharePctToday ?? 0;
    return {
      key: "backup_today",
      tone: "critical",
      label: "Backup heat used today",
      sentence: `Recovered heat covered ${num(share, 0)} % of your heat demand today. Your backup heater supplied ${num(backup, 1)} kWh.`,
    };
  }
  const cap = overview?.tankCapacityKwh ?? 0;
  const tank = live?.tankKwh ?? overview?.tankKwh ?? 0;
  const fill = cap > 0 ? tank / cap : 0;
  if (live?.status === "dumping" || (cap > 0 && fill >= 0.99)) {
    return {
      key: "dumping",
      tone: "dump",
      label: "Covered, tank full",
      sentence: "Your hot water is fully covered by recovered heat today. The tank is full, so some surplus heat is let go.",
    };
  }
  if (live?.status === "tank_low" || (cap > 0 && fill < 0.2)) {
    return {
      key: "tank_low",
      tone: "tank",
      label: "Covered, tank low",
      sentence: "Your hot water is covered by recovered heat today. The tank is low, so more compute is being sent to your site.",
    };
  }
  return { key: "covered", tone: "ok", label: "Covered by recovered heat", sentence: "Your hot water is fully covered by recovered heat today." };
}
