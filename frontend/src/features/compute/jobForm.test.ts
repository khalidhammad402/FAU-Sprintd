import { describe, expect, it } from "vitest";
import { tierOf, tiers } from "@/lib/tiers";
import { deadlineMinutes, errorsFromDetails, findCycle, longestChainMin, newTask, ratesFromUsage, serverHours, toSubmitBody, validateJob, type JobDraft } from "./jobForm";

const NOW = "2021-07-17T13:00:00+02:00";
const draft = (over: Partial<JobDraft> = {}): JobDraft => ({
  name: "Embed archive",
  priority: "flexible",
  deadlineMode: "in",
  deadlineInMin: 600,
  deadlineAt: "",
  tasks: [newTask(1)],
  ...over,
});

describe("tier mapping", () => {
  it("maps backend priorities to the buyer tiers", () => {
    expect(tiers.critical.label).toBe("Priority");
    expect(tiers.normal.label).toBe("Standard");
    expect(tiers.flexible.label).toBe("Flexible");
  });
  it("falls back to Standard for an unknown value", () => {
    expect(tierOf("urgent").label).toBe("Standard");
  });
});

describe("findCycle", () => {
  it("returns null for a valid graph", () => {
    expect(findCycle([{ key: "A", dependsOn: [] }, { key: "B", dependsOn: [] }, { key: "M", dependsOn: ["A", "B"] }])).toBeNull();
  });
  it("finds a two-task cycle", () => {
    expect(findCycle([{ key: "A", dependsOn: ["B"] }, { key: "B", dependsOn: ["A"] }])).toEqual(["A", "B", "A"]);
  });
  it("finds a self-dependency and a longer loop", () => {
    expect(findCycle([{ key: "A", dependsOn: ["A"] }])).toEqual(["A", "A"]);
    const c = findCycle([{ key: "A", dependsOn: ["C"] }, { key: "B", dependsOn: ["A"] }, { key: "C", dependsOn: ["B"] }, { key: "D", dependsOn: [] }]);
    expect(c?.[0]).toBe(c?.[c.length - 1]);
    expect(c).toHaveLength(4);
  });
  it("ignores dependencies on unknown tasks", () => {
    expect(findCycle([{ key: "A", dependsOn: ["X"] }])).toBeNull();
  });
});

describe("longestChainMin and serverHours", () => {
  it("adds runtimes along the longest chain", () => {
    const t = [
      { key: "A", dependsOn: [], runtimeMin: 30 },
      { key: "B", dependsOn: [], runtimeMin: 50 },
      { key: "M", dependsOn: ["A", "B"], runtimeMin: 15 },
    ];
    expect(longestChainMin(t)).toBe(65);
  });
  it("is NaN with a cycle", () => {
    expect(longestChainMin([{ key: "A", dependsOn: ["A"], runtimeMin: 5 }])).toBeNaN();
  });
  it("counts full-load server-hours", () => {
    expect(serverHours([{ runtimeMin: 60, powerKw: 0.5 }, { runtimeMin: 30, powerKw: 1 }])).toBeCloseTo(1);
  });
});

describe("validateJob", () => {
  it("accepts a valid job", () => {
    expect(validateJob(draft(), NOW)).toEqual({});
  });
  it("requires a name, positive runtime and power, whole threads", () => {
    const e = validateJob(draft({ name: " ", tasks: [{ ...newTask(1), runtimeMin: 0, powerKw: "", threads: 1.5 }] }), NOW);
    expect(Object.keys(e).sort()).toEqual(["name", "tasks.0.powerKw", "tasks.0.runtimeMin", "tasks.0.threads"]);
  });
  it("rejects power above the largest server", () => {
    expect(validateJob(draft({ tasks: [{ ...newTask(1), powerKw: 2 }] }), NOW)["tasks.0.powerKw"]).toMatch(/largest server/);
  });
  it("reports a dependency cycle and duplicate ids", () => {
    const a = { ...newTask(1), key: "A", dependsOn: ["B"] };
    const b = { ...newTask(2), key: "B", dependsOn: ["A"] };
    expect(validateJob(draft({ tasks: [a, b] }), NOW).tasks).toMatch(/A → B → A/);
    expect(validateJob(draft({ tasks: [a, { ...b, key: "A" }] }), NOW)["tasks.1.key"]).toMatch(/twice/);
  });
  it("needs a deadline after the chain of tasks", () => {
    expect(validateJob(draft({ deadlineInMin: 10 }), NOW).deadline).toMatch(/at least 30 min/);
    expect(validateJob(draft({ deadlineMode: "at", deadlineAt: "2021-07-17T12:00" }), NOW).deadline).toMatch(/after the current/);
  });
});

describe("deadlines and request body", () => {
  it("measures an absolute deadline in simulated Zurich time", () => {
    expect(deadlineMinutes({ deadlineMode: "at", deadlineAt: "2021-07-17T15:00", deadlineInMin: "" }, NOW)).toBe(120);
  });
  it("builds the JobSubmit body", () => {
    const body = toSubmitBody(draft({ tasks: [{ ...newTask(1), key: "A" }, { ...newTask(2), key: "M", dependsOn: ["A"] }] }), NOW);
    expect(body).toMatchObject({ name: "Embed archive", priority: "flexible", deadlineInMin: 600 });
    expect(body.tasks[1]).toMatchObject({ taskId: "M", dependsOn: ["A"], runtimeMin: 30, threads: 1, interruptible: true });
  });
  it("maps backend 422 details to form fields", () => {
    expect(errorsFromDetails([{ field: "tasks.0.runtime_min", message: "x" }, { field: "tasks", message: "y" }])).toEqual({ "tasks.0.runtimeMin": "x", tasks: "y" });
  });
});

describe("ratesFromUsage", () => {
  it("uses the billed rate per tier and fills Standard between the other two", () => {
    const r = ratesFromUsage([
      { month: "m", priority: "critical", serverHours: 10, costChf: 66 },
      { month: "m", priority: "flexible", serverHours: 10, costChf: 24 },
    ]);
    expect(r.critical).toEqual({ chfPerServerHour: 6.6, basis: "billed" });
    expect(r.normal.basis).toBe("between tiers");
    expect(r.normal.chfPerServerHour).toBeCloseTo(4.5);
  });
  it("says none when there is no usage", () => {
    expect(ratesFromUsage([]).flexible).toEqual({ chfPerServerHour: null, basis: "none" });
  });
});
