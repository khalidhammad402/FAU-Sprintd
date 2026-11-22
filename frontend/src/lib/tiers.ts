/** Backend priority values and the tiers a compute buyer sees. Verified against JobSubmit.priority in api/schemas.py. */
export type Priority = "critical" | "normal" | "flexible";

export const tiers: Record<Priority, { label: string; blurb: string; price: string; opsLabel: string }> = {
  critical: { label: "Priority", blurb: "Finishes first. Never paused or moved.", price: "Highest price", opsLabel: "Critical" },
  normal: { label: "Standard", blurb: "Runs soon. May move between sites.", price: "Mid price", opsLabel: "Normal" },
  flexible: { label: "Flexible", blurb: "Runs when a host business needs heat. Can pause.", price: "Lowest price", opsLabel: "Flexible" },
};

export const isPriority = (p: string): p is Priority => p === "critical" || p === "normal" || p === "flexible";
export const tierOf = (p: string) => tiers[isPriority(p) ? p : "normal"];
export const priorities: Priority[] = ["critical", "normal", "flexible"];
