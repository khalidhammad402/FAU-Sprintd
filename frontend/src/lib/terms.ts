/**
 * Visible vocabulary. Backend identifiers (role `site_owner`, routes `/site/*`) stay as they are internally,
 * but every label a person reads comes from here. scripts/check-terms.mjs fails the lint step when a
 * forbidden word appears in a string in src/.
 */
export const terms = {
  host: "Host business",
  hosts: "Host businesses",
  hostPortal: "Host Portal",
  computePortal: "Compute Portal",
  opsConsole: "Operations Console",
  computeBuyer: "Compute buyer",
  operator: "Operator",
  simulatedTime: "Simulated time",
  recoveredHeatValue: "Recovered heat value",
  tagline: "Compute. Heat. Sustain.",
  chain: ["MNC sends AI workloads", "DigitalHeat schedules compute", "servers create heat", "host business uses heat"],
} as const;

export type Role = "admin" | "customer" | "site_owner";

export const roleLabel: Record<Role, string> = {
  admin: terms.operator,
  customer: terms.computeBuyer,
  site_owner: terms.host,
};

export const roleHome: Record<Role, string> = { admin: "/ops", customer: "/compute", site_owner: "/host" };

export type HostIcon = "hotel" | "pool" | "block" | "plant" | "laundry" | "farm";
/** Host type label and glyph per backend site `type` */
export const hostTypes: Record<string, { label: string; icon: HostIcon }> = {
  hotel: { label: "Hotel", icon: "hotel" },
  pool: { label: "Indoor pool", icon: "pool" },
  spa: { label: "Spa", icon: "pool" },
  block: { label: "Apartment block", icon: "block" },
  plant: { label: "Plant", icon: "plant" },
  laundry: { label: "Laundry", icon: "laundry" },
  farm: { label: "Farm", icon: "farm" },
  business: { label: "Business", icon: "plant" },
};
export const hostType = (type: string | undefined) => hostTypes[type ?? ""] ?? { label: terms.host, icon: "plant" as HostIcon };
