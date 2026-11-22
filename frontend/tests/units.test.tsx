/** Quantity formatting, tolerant JSON, time helpers. */
import { render, screen } from "@testing-library/react";
import { Quantity } from "@/design-system/numbers";
import { chf, kwh, num, pct, withUnit } from "@/lib/format";
import { parseLooseJson } from "@/lib/json";
import { time } from "@/lib/time";

describe("format", () => {
  it("prints numbers with a unit and never splits them", () => {
    expect(kwh(12.5)).toBe("12.5 kWh");
    expect(pct(96.14, 1)).toBe("96.1 %");
    expect(chf(2450)).toBe("2,450 CHF");
    expect(chf(0.42)).toBe("0.42 CHF");
    expect(withUnit(null, "kWh")).toBe("– kWh");
  });
  it("shows a dash for non-finite values", () => {
    expect(num(Number.POSITIVE_INFINITY)).toBe("–");
    expect(num(Number.NaN)).toBe("–");
  });
});

describe("Quantity", () => {
  it("renders value, unit and period", () => {
    render(<Quantity value={12.5} unit="kWh" period="last 15 min" animate={false} decimals={1} />);
    expect(screen.getByText("12.5")).toBeInTheDocument();
    expect(screen.getByText("kWh")).toBeInTheDocument();
    expect(screen.getByText(/last 15 min/)).toBeInTheDocument();
  });
});

describe("parseLooseJson", () => {
  it("turns bare Infinity and NaN from the backend into null", () => {
    expect(parseLooseJson('{"a": Infinity, "b": [NaN, -Infinity, 1], "c": "Infinity in text"}')).toEqual({ a: null, b: [null, null, 1], c: "Infinity in text" });
  });
  it("passes valid JSON through", () => {
    expect(parseLooseJson('{"x":1}')).toEqual({ x: 1 });
  });
});

describe("time (simulated, Europe/Zurich)", () => {
  it("formats the scheduler clock", () => {
    expect(time.clock("2021-07-17T13:15:00+02:00")).toBe("Sat, Jul 17, 13:15");
  });
  it("finds Zurich midnight of the simulated day", () => {
    expect(time.startOfDay("2021-07-17T13:15:00+02:00")).toBe("2021-07-16T22:00:00.000Z");
    expect(time.startOfDay("2021-01-03T00:15:00+01:00")).toBe("2021-01-02T23:00:00.000Z");
  });
  it("prints durations", () => {
    expect(time.duration(75)).toBe("1 h 15 min");
    expect(time.duration(3000)).toBe("2 d 2 h");
  });
});
