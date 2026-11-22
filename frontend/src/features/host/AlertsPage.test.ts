import { describe, expect, it } from "vitest";
import { groupNotifications } from "./AlertsPage";

const n = (id: number, t: string, kind = "heat_dumped", read = false) => ({ id, time: t, kind, message: "m", siteId: "H1", read });

describe("groupNotifications", () => {
  it("groups same kind, same day, same read state; unread first, newest first", () => {
    const g = groupNotifications([
      n(1, "2021-07-17T02:15:00+02:00"),
      n(2, "2021-07-17T08:45:00+02:00"),
      n(3, "2021-07-16T22:00:00+02:00"),
      n(4, "2021-07-17T09:00:00+02:00", "unmet_demand"),
      n(5, "2021-07-17T10:00:00+02:00", "heat_dumped", true),
    ]);
    expect(g.map((x) => x.items.map((i) => i.id))).toEqual([[4], [2, 1], [3], [5]]);
    expect(g[3].read).toBe(true);
  });
});
