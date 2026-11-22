import { METRICS, winner } from "./lab";

const m = (key: string) => METRICS.find((x) => x.key === key)!;

describe("algorithm comparison", () => {
  it("marks the higher coverage and the lower dumped heat as better", () => {
    expect(winner(m("coveragePct"), 67.3, 68.2)).toBe("mpc");
    expect(winner(m("dumpedKwh"), 90.6, 33.4)).toBe("mpc");
    expect(winner(m("migrations"), 3000, 4000)).toBe("greedy");
  });

  it("calls a tie at the shown precision and ignores missing values", () => {
    expect(winner(m("missedDeadlinesPct"), 0, 0)).toBeNull();
    expect(winner(m("breakEvenChfPerServerHour"), 0.2264, 0.2262)).toBeNull();
    expect(winner(m("coveragePct"), null, 50)).toBeNull();
  });
});
