/** Socket events are applied idempotently and in order; a finished jump or reset refetches REST. */
import { QueryClient } from "@tanstack/react-query";
import { reconcile } from "@/live/reconcile";
import { useLive } from "@/live/store";
import { qk } from "@/api/queries";
import type { WsMessage } from "@/api/types";

const msg = (type: string, data: Record<string, unknown>, channel = "fleet", time = "2021-07-17T13:00:00+02:00"): WsMessage => ({ type, channel, time, data });
const clock = (slot: number, mode = "live") =>
  msg("clock.tick", { slot, mode, currentTime: `2021-07-17T13:${String(slot % 60).padStart(2, "0")}:00+02:00`, paused: false, slotSeconds: 10, slotsTotal: 35040, algorithm: "greedy" });
const slotTick = (siteId: string, slot: number, tankKwh: number) =>
  msg("slot.tick", { siteId, slot, time: "2021-07-17T13:00:00+02:00", status: "covered", demandKwh: 0.1, producedKwh: 0.1, deliveredKwh: 0.1, dumpedKwh: 0, unmetKwh: 0, tankKwh, loadKw: 0.5, capacityKw: 3, serversRunning: 1, serversTotal: 3 });
const migrated = { slot: 5, time: "2021-07-17T13:00:00+02:00", kind: "migrated", taskId: "J1-T1", jobId: "J1", filler: false, fromServer: "H1-S1", toServer: "H2-S1", fromSite: "H1", toSite: "H2" };

describe("reconcile", () => {
  let qc: QueryClient;
  beforeEach(() => {
    useLive.getState().reset();
    qc = new QueryClient();
  });

  it("applies a task event once even if it is delivered twice (reconnect replay)", () => {
    reconcile(msg("task.migrated", migrated), { qc });
    reconcile(msg("task.migrated", migrated), { qc });
    reconcile(msg("task.migrated", migrated, "site:H1"), { qc });
    expect(useLive.getState().events).toHaveLength(1);
    expect(useLive.getState().migrations).toHaveLength(1);
    expect(useLive.getState().migrations[0]).toMatchObject({ fromSite: "H1", toSite: "H2" });
  });

  it("ignores same-site migrations for map arcs", () => {
    reconcile(msg("task.migrated", { ...migrated, toSite: "H1", toServer: "H1-S2" }), { qc });
    expect(useLive.getState().events).toHaveLength(1);
    expect(useLive.getState().migrations).toHaveLength(0);
  });

  it("keeps one reading per site and slot, and patches the cached site list", () => {
    qc.setQueryData(qk.admin.sites, [{ id: "H1", name: "Hallenbad Gundeli", tankKwh: 1, status: "tank_low" }]);
    reconcile(slotTick("H1", 7, 20), { qc });
    reconcile(slotTick("H1", 7, 20), { qc });
    reconcile(slotTick("H1", 8, 21), { qc });
    expect(useLive.getState().readings.H1).toHaveLength(1 + 0); // same time stamp: last row replaced, not duplicated
    expect(useLive.getState().sites.H1.tankKwh).toBe(21);
    expect(qc.getQueryData<{ tankKwh: number; status: string }[]>(qk.admin.sites)?.[0]).toMatchObject({ tankKwh: 21, status: "covered" });
  });

  it("de-duplicates alerts by id", () => {
    const a = { id: 9, time: "2021-07-17T13:00:00+02:00", severity: "warning", kind: "unmet_demand", siteId: "H1", serverId: null, jobId: null, message: "x", acknowledged: false };
    reconcile(msg("alert.raised", a), { qc });
    reconcile(msg("alert.raised", a), { qc });
    expect(useLive.getState().alerts).toHaveLength(1);
  });

  it("refetches REST collections when a jump finishes and when the run is reset", () => {
    const spy = vi.spyOn(qc, "invalidateQueries");
    reconcile(clock(100, "jumping"), { qc });
    spy.mockClear();
    reconcile(clock(500, "live"), { qc });
    expect(spy).toHaveBeenCalledWith();
    const epoch = useLive.getState().epoch;
    reconcile(clock(3, "live"), { qc }); // slot went backwards: reset
    expect(useLive.getState().epoch).toBe(epoch + 1);
  });

  it("never moves the derived simulated clock backwards", () => {
    useLive.getState().setSimNow("2021-07-17T13:30:00+02:00");
    useLive.getState().setSimNow("2021-07-17T13:15:00+02:00");
    expect(useLive.getState().simNow).toBe("2021-07-17T13:30:00+02:00");
  });
});
