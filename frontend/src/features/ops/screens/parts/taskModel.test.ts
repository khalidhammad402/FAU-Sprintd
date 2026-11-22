import type { Job, Task, TaskType } from "@/api/types";
import { applyAction, bucketOf, canAct, customerOfTask, riskOf, slackMin, stripIndex, taskNameIndex } from "./taskModel";

const task = (p: Partial<Task> = {}): Task => ({
  id: "J1-T1",
  jobId: "J1",
  name: "train worker 4",
  state: "running",
  priority: "flexible",
  runtimeMin: 120,
  powerKw: 0.122,
  interruptible: true,
  dependsOn: [],
  arrival: "2021-07-17T10:00:00+02:00",
  deadline: "2021-07-17T16:00:00+02:00",
  siteId: "H1",
  serverId: "H1-S1",
  progressPct: 50,
  energyKwh: 0,
  heatDeliveredKwh: 0,
  filler: false,
  hold: false,
  finished: null,
  ...p,
});

const types = [
  { id: "finetune", name: "Fine-tune", customer: "globex", priority: "flexible", jobsPerDay: 3, deadlineH: 72, tasks: [{ name: "train worker", count: 4, runtimeMin: 480, powerKw: 0.122, interruptible: true }], source: "" },
  { id: "transcription", name: "Transcribe", customer: "acme", priority: "critical", jobsPerDay: 24, deadlineH: 3, tasks: [{ name: "transcribe", count: 1, runtimeMin: 60, powerKw: 0.122, interruptible: false }], source: "" },
] as TaskType[];

describe("task model", () => {
  it("groups waiting and ready as queued", () => {
    expect(bucketOf("waiting")).toBe("queued");
    expect(bucketOf("ready")).toBe("queued");
    expect(bucketOf("paused")).toBe("paused");
  });

  it("resolves the customer from the job first, then the catalogue task name", () => {
    const idx = taskNameIndex(types);
    expect(stripIndex("train worker 4")).toBe("train worker");
    expect(customerOfTask(task(), new Map(), idx)).toBe("globex");
    const jobs = new Map([["J1", { id: "J1", customerId: "acme" } as Job]]);
    expect(customerOfTask(task(), jobs, idx)).toBe("acme");
    expect(customerOfTask(task({ name: "custom step" }), new Map(), idx)).toBeNull();
  });

  it("computes slack as deadline minus now minus remaining runtime", () => {
    // 6 h to the deadline, 60 min left to run
    expect(slackMin(task(), "2021-07-17T10:00:00+02:00")).toBe(300);
    expect(slackMin(task(), "2021-07-17T15:30:00+02:00")).toBe(-30);
    expect(slackMin(task({ state: "done" }), "2021-07-17T10:00:00+02:00")).toBeNull();
    expect(riskOf(-30)).toBe("late");
    expect(riskOf(30)).toBe("risk");
    expect(riskOf(300)).toBe("ok");
  });

  it("applies operator actions optimistically and knows which are allowed", () => {
    expect(applyAction(task(), "pause")).toMatchObject({ state: "paused", hold: true });
    expect(applyAction(task({ state: "paused", hold: true }), "resume")).toMatchObject({ state: "running", hold: false });
    expect(applyAction(task(), "cancel").state).toBe("cancelled");
    expect(canAct(task({ interruptible: false }), "pause")).toBe(false);
    expect(canAct(task({ state: "done" }), "cancel")).toBe(false);
    expect(canAct(task({ state: "paused", hold: true }), "resume")).toBe(true);
  });
});
