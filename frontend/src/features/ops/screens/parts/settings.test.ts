import { validPrice } from "../SettingsPage";

describe("price validation", () => {
  it("accepts numbers above zero only", () => {
    expect(validPrice("0.33")).toBe(true);
    expect(validPrice("2")).toBe(true);
    expect(validPrice("0")).toBe(false);
    expect(validPrice("-1")).toBe(false);
    expect(validPrice("abc")).toBe(false);
    expect(validPrice("")).toBe(false);
  });
});
