import { liveMix, PLAN_MIX } from "./economics";

describe("revenue mix", () => {
  it("adds the plan mix up to 100 %", () => {
    expect(PLAN_MIX.reduce((a, p) => a + p.pct, 0)).toBe(100);
  });
  it("splits measured income between compute and heat, or says there is none", () => {
    expect(liveMix(75, 25)).toEqual({ compute: 75, heat: 25 });
    expect(liveMix(0, 0)).toBeNull();
    expect(liveMix(null, 2)).toEqual({ compute: 0, heat: 100 });
  });
});
