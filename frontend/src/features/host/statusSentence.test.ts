import { describe, expect, it } from "vitest";
import { statusSentence, type OverviewLike } from "./statusSentence";

const base: OverviewLike = { serverHeatSharePctToday: 100, backupHeatTodayKwh: 0, tankKwh: 20, tankCapacityKwh: 35, serversWorking: 2, serversTotal: 3 };

describe("statusSentence", () => {
  it("says covered when there is no backup heat and the tank is in range", () => {
    const s = statusSentence(base);
    expect(s.key).toBe("covered");
    expect(s.tone).toBe("ok");
    expect(s.sentence).toBe("Your hot water is fully covered by recovered heat today.");
  });

  it("reports backup heat used today with share and kWh", () => {
    const s = statusSentence({ ...base, backupHeatTodayKwh: 5.84, serverHeatSharePctToday: 91.2 });
    expect(s.key).toBe("backup_today");
    expect(s.tone).toBe("critical");
    expect(s.sentence).toContain("91 %");
    expect(s.sentence).toContain("5.8 kWh");
  });

  it("ignores backup heat below the noise threshold", () => {
    expect(statusSentence({ ...base, backupHeatTodayKwh: 0.01 }).key).toBe("covered");
  });

  it("says backup is helping right now when the live reading is unmet", () => {
    const s = statusSentence(base, { status: "unmet", unmetKwh: 0.3 });
    expect(s.key).toBe("backup_now");
    expect(s.tone).toBe("critical");
  });

  it("says tank full when the site is dumping", () => {
    expect(statusSentence(base, { status: "dumping" }).key).toBe("dumping");
    expect(statusSentence({ ...base, tankKwh: 35 }).key).toBe("dumping");
    expect(statusSentence(base, { status: "dumping" }).tone).toBe("dump");
  });

  it("says tank low below 20 %", () => {
    expect(statusSentence({ ...base, tankKwh: 5 }).key).toBe("tank_low");
    expect(statusSentence(base, { status: "tank_low" }).tone).toBe("tank");
  });

  it("prefers the live tank level over the REST one", () => {
    expect(statusSentence({ ...base, tankKwh: 30 }, { status: "covered", tankKwh: 4 }).key).toBe("tank_low");
  });

  it("handles no data and an offline site", () => {
    expect(statusSentence(null).key).toBe("offline");
    expect(statusSentence(undefined, null).tone).toBe("idle");
    expect(statusSentence(base, { status: "offline" }).key).toBe("offline");
  });

  it("never uses forbidden words", () => {
    const all = [statusSentence(base), statusSentence(null), statusSentence({ ...base, backupHeatTodayKwh: 3 }), statusSentence(base, { status: "dumping" })];
    for (const s of all) expect(s.sentence).not.toMatch(/\b(home|household|free|bill)\b/i);
  });
});
