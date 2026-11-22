/** Host-friendly wording for notifications, and the client-side monthly report (CSV). */
import type { Tone } from "@/design-system/vocab";
import type { EnergyBucket, Savings } from "@/api/types";

export type Advice = { title: string; next: string; tone: Tone };

/** kind -> plain words + recommended next action. Unknown kinds fall back to the backend message. */
export const notificationAdvice: Record<string, Advice> = {
  heat_dumped: {
    title: "Tank was full, surplus heat let go",
    next: "No action needed. This happens when your site needs less heat than the servers make.",
    tone: "dump",
  },
  unmet_demand: {
    title: "Backup heater was needed",
    next: "No action needed. If it happens on most days, ask us to review the tank schedule.",
    tone: "critical",
  },
  server_offline: {
    title: "A server went offline",
    next: "Nothing to do on your side. We are looking into it, and your backup heater keeps the hot water running.",
    tone: "critical",
  },
  deadline_missed: {
    title: "A compute task ran late",
    next: "No action needed. This does not affect your heat supply.",
    tone: "idle",
  },
};

export const adviceFor = (kind: string): Advice => notificationAdvice[kind] ?? { title: "Update from DigitalHeat", next: "No action needed.", tone: "idle" };

/** Price per kWh from the backend explanation ("… = 0.132 CHF."), if it states one. */
export function pricePerKwh(explanation: string | undefined): string | null {
  const m = /=\s*([\d.]+)\s*CHF/.exec(explanation ?? "");
  return m ? `${m[1]} CHF per kWh` : null;
}

const csvCell = (v: string | number) => (typeof v === "number" ? String(Math.round(v * 1000) / 1000) : `"${v.replace(/"/g, '""')}"`);

/** One row per month: recovered server heat and its value. Optionally only one month. */
export function savingsCsv(siteName: string, savings: Savings, onlyMonth?: string): string {
  const rows = savings.months.filter((m) => !onlyMonth || m.month.slice(0, 7) === onlyMonth);
  const lines = [
    ["Site", "Month", "Recovered server heat (kWh)", "Recovered heat value (CHF)"].map(csvCell).join(","),
    ...rows.map((m) => [csvCell(siteName), csvCell(m.month.slice(0, 7)), csvCell(m.serverHeatKwh), csvCell(m.valueChf)].join(",")),
    "",
    `${csvCell("Pricing assumption")},${csvCell(savings.explanation)}`,
    `${csvCell("Status")},${csvCell("Not a verified tariff calculation")}`,
  ];
  return lines.join("\r\n");
}

export function energyTotals(rows: EnergyBucket[]) {
  return rows.reduce(
    (a, r) => ({ demand: a.demand + r.demandKwh, server: a.server + r.serverHeatKwh, backup: a.backup + r.backupHeatKwh }),
    { demand: 0, server: 0, backup: 0 },
  );
}

export function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
