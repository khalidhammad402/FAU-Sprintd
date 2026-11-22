/** All displayed times are simulated scheduler time in Europe/Zurich, never the browser clock. */
export const TZ = "Europe/Zurich";

const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour12: false, ...o });
const fHM = f({ hour: "2-digit", minute: "2-digit" });
const fDay = f({ weekday: "short", day: "numeric", month: "short" });
const fDate = f({ day: "numeric", month: "short", year: "numeric" });
const fMonth = f({ month: "short", year: "numeric" });
const fMonthShort = f({ month: "short" });
const fWeekday = f({ weekday: "short" });
const fHMS = f({ hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fParts = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const fYmd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

type T = string | number | Date | null | undefined;
const d = (t: T): Date | null => {
  if (t == null) return null;
  const x = t instanceof Date ? t : new Date(t);
  return Number.isNaN(x.getTime()) ? null : x;
};
const or = (t: T, fn: (x: Date) => string) => {
  const x = d(t);
  return x ? fn(x) : "–";
};

function duration(min: number) {
  const m = Math.max(0, Math.round(min));
  const days = Math.floor(m / 1440),
    h = Math.floor((m % 1440) / 60),
    r = m % 60;
  if (days) return `${days} d ${h} h`;
  if (h) return r ? `${h} h ${r} min` : `${h} h`;
  return `${r} min`;
}
const minutes = (a: T, b: T) => ((d(b)?.getTime() ?? 0) - (d(a)?.getTime() ?? 0)) / 60000;

export const time = {
  hm: (t: T) => or(t, (x) => fHM.format(x)),
  day: (t: T) => or(t, (x) => fDay.format(x)),
  date: (t: T) => or(t, (x) => fDate.format(x)),
  month: (t: T) => or(t, (x) => fMonth.format(x)),
  monthShort: (t: T) => or(t, (x) => fMonthShort.format(x)),
  weekday: (t: T) => or(t, (x) => fWeekday.format(x)),
  dayTime: (t: T) => or(t, (x) => `${fDay.format(x)}, ${fHM.format(x)}`),
  /** "Thu, Oct 23, 22:15": the scheduler clock */
  clock: (t: T) =>
    or(t, (x) => {
      const p = Object.fromEntries(fParts.formatToParts(x).map((q) => [q.type, q.value]));
      return `${p.weekday}, ${p.month} ${p.day}, ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
    }),
  /** yyyy-mm-dd of the simulated day in Zurich */
  ymd: (t: T) => (d(t) ? fYmd.format(d(t)!) : ""),
  minutes,
  duration,
  relative: (t: T, now: T) => {
    const diff = minutes(now, t);
    return diff >= 0 ? `in ${duration(diff)}` : `${duration(-diff)} ago`;
  },
  /** ISO instant of Zurich midnight on the simulated day that contains t */
  startOfDay(t: T): string | null {
    const x = d(t);
    if (!x) return null;
    const p = Object.fromEntries(fHMS.formatToParts(x).map((q) => [q.type, Number(q.value)]));
    const ms = (((p.hour ?? 0) % 24) * 3600 + (p.minute ?? 0) * 60 + (p.second ?? 0)) * 1000 + x.getMilliseconds();
    return new Date(x.getTime() - ms).toISOString();
  },
  addMinutes: (t: T, m: number) => new Date((d(t)?.getTime() ?? 0) + m * 60000).toISOString(),
};
