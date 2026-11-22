/**
 * Terminology guard and role isolation.
 * - Visible text never uses the forbidden words (scripts/check-terms.mjs, also run by `pnpm lint`).
 * - Host screens only talk to host endpoints, Compute screens only to customer endpoints, so neither can
 *   render the other audience's data. The buyer timeline never contains site or server ids.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buyerTimeline } from "@/features/compute/ui";
import { adviceFor, notificationAdvice } from "@/features/host/content";
import { terms } from "@/lib/terms";
import type { Task } from "@/api/types";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) && !/\.test\./.test(p) ? [p] : [];
  });
// code only: comments may explain the rule
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const source = (dir: string) => files(dir).map((f) => stripComments(readFileSync(f, "utf8"))).join("\n");

describe("terminology", () => {
  it("check-terms passes on src/", () => {
    expect(() => execFileSync(process.execPath, ["scripts/check-terms.mjs"], { stdio: "pipe" })).not.toThrow();
  });
  it("the vocabulary itself is clean", () => {
    const text = JSON.stringify(terms) + JSON.stringify(notificationAdvice);
    expect(text).not.toMatch(/\b(household|homeowner|homes?|client portal|site owner|free heat)\b/i);
  });
});

describe("role isolation", () => {
  const host = source("src/features/host");
  const compute = source("src/features/compute");
  it("Host Portal never calls operator or customer endpoints", () => {
    expect(host).not.toMatch(/adminApi|customerApi|useCustomers|useCustomerJobs|useTasks\(|useJobs\(|useSites\(/);
    expect(host).not.toMatch(/\/admin\/|\/customer\//);
  });
  it("Compute Portal never calls operator or host endpoints", () => {
    expect(compute).not.toMatch(/adminApi|hostApi|useHostOverview|useSites\(|useServers\(|useTasks\(/);
    expect(compute).not.toMatch(/\/admin\/|\/site\/sites/);
  });
  it("the buyer activity timeline has no site or server ids", () => {
    const t = {
      id: "J1-A",
      jobId: "J1",
      name: "embed",
      state: "running",
      priority: "flexible",
      runtimeMin: 30,
      powerKw: 0.3,
      interruptible: true,
      dependsOn: [],
      arrival: null,
      deadline: null,
      siteId: "H1",
      serverId: "H1-S3",
      progressPct: 40,
      energyKwh: 0.1,
      heatDeliveredKwh: 0.08,
      filler: false,
      hold: false,
      finished: null,
      events: [
        { time: "2021-07-17T10:00:00+02:00", kind: "started", fromServerId: null, toServerId: "H1-S3" },
        { time: "2021-07-17T11:00:00+02:00", kind: "migrated", fromServerId: "H1-S3", toServerId: "HOTEL1-S1" },
        { time: "2021-07-17T12:00:00+02:00", kind: "paused", fromServerId: "HOTEL1-S1", toServerId: null },
      ],
    } as unknown as Task;
    const text = JSON.stringify(buyerTimeline([t]));
    expect(text).not.toMatch(/H1|HOTEL1|S3|S1|Hallenbad|Hotel/);
  });
  it("host notifications are written for a host business", () => {
    expect(adviceFor("unmet_demand").title).not.toMatch(/acme|globex|J\d+/i);
  });
});
