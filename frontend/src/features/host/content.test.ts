import { describe, expect, it } from "vitest";
import { adviceFor, energyTotals, pricePerKwh, savingsCsv } from "./content";

const savings = {
  months: [
    { month: "2021-06-01T00:00:00+02:00", serverHeatKwh: 120.5, valueChf: 15.906 },
    { month: "2021-07-01T00:00:00+02:00", serverHeatKwh: 52.7, valueChf: 6.9577 },
  ],
  totalChf: 22.86,
  explanation: "Each kWh of server heat replaces heat-pump heat worth 0.33 CHF / 2.5 = 0.132 CHF.",
};

describe("host content", () => {
  it("maps notification kinds to plain words and a next action", () => {
    expect(adviceFor("heat_dumped").title).toMatch(/tank was full/i);
    expect(adviceFor("unmet_demand").tone).toBe("critical");
    expect(adviceFor("something_new").next).toBe("No action needed.");
  });

  it("reads the price per kWh from the explanation", () => {
    expect(pricePerKwh(savings.explanation)).toBe("0.132 CHF per kWh");
    expect(pricePerKwh("no number here")).toBeNull();
  });

  it("builds a CSV report with the assumption and its status", () => {
    const csv = savingsCsv("Hallenbad Gundeli", savings);
    expect(csv.split("\r\n")[0]).toContain("Recovered heat value (CHF)");
    expect(csv).toContain('"2021-07",52.7,6.958');
    expect(csv).toContain("Not a verified tariff calculation");
    expect(csv).not.toMatch(/bill saving/i);
    expect(savingsCsv("X", savings, "2021-06").split("\r\n").filter((l) => l.includes("2021-")).length).toBe(1);
  });

  it("sums energy totals", () => {
    const t = energyTotals([
      { bucket: "a", demandKwh: 1, serverHeatKwh: 0.8, backupHeatKwh: 0.2 },
      { bucket: "b", demandKwh: 2, serverHeatKwh: 2, backupHeatKwh: 0 },
    ]);
    expect(t).toEqual({ demand: 3, server: 2.8, backup: 0.2 });
  });
});
