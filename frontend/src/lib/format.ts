const cache = new Map<number, Intl.NumberFormat>();
function nf(d: number) {
  let f = cache.get(d);
  if (!f) cache.set(d, (f = new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })));
  return f;
}

/** Decimals that keep about three significant figures: 1234 -> 0, 12.3 -> 1, 0.42 -> 2 */
export function autoDecimals(v: number) {
  const a = Math.abs(v);
  return a >= 100 ? 0 : a >= 1 ? 1 : a === 0 ? 0 : 2;
}

export function num(v: number | null | undefined, d?: number) {
  if (v == null || !Number.isFinite(v)) return "–";
  return nf(d ?? autoDecimals(v)).format(v);
}

/** Narrow no-break space: a number and its unit never wrap apart. */
export const NBSP = " ";
export const withUnit = (v: number | null | undefined, unit: string, d?: number) => `${num(v, d)}${NBSP}${unit}`;
export const pct = (v: number | null | undefined, d = 0) => withUnit(v, "%", d);
export const kwh = (v: number | null | undefined, d?: number) => withUnit(v, "kWh", d);
export const chf = (v: number | null | undefined, d?: number) => withUnit(v, "CHF", d ?? (Math.abs(v ?? 0) >= 100 ? 0 : 2));
export const kw = (v: number | null | undefined, d = 1) => withUnit(v, "kW", d);
export const sum = <T>(rows: readonly T[], pick: (r: T) => number | null | undefined) => rows.reduce((a, r) => a + (pick(r) ?? 0), 0);
