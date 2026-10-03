// The onboarding role ("what's your role?") is a working preference, saved
// onto two existing settings rather than as a field of its own:
// 經紀人 → person.account_type = manager; every other role → talent.vertical.
// It never grants or limits access — permissions come from membership.role.
// See docs/architecture.md, "Roles and verticals".
import type { verticals } from "@/lib/db/schema";

export const roles = ["musician", "manager", "video", "influencer", "model", "other"] as const;
export type Role = (typeof roles)[number];
export type Vertical = (typeof verticals)[number];

export const appearances = ["female", "male", "non_binary"] as const;
export type Appearance = (typeof appearances)[number];

const roleVertical: Record<Exclude<Role, "manager">, Vertical> = {
  musician: "music",
  video: "video",
  influencer: "influencer",
  model: "model",
  other: "other",
};

/** Verticals a manager can choose for the talent they manage. */
export const managedVerticals: Vertical[] = ["music", "influencer", "model", "video", "other"];

export const isRole = (value: unknown): value is Role => roles.includes(value as Role);
export const toVertical = (value: string): Vertical =>
  managedVerticals.includes(value as Vertical) ? (value as Vertical) : "other";
export const isAppearance = (value: unknown): value is Appearance => appearances.includes(value as Appearance);

/** The two settings a role choice writes. A manager also names the vertical of the talent they manage. */
export function roleSettings(role: Role, managedVertical: Vertical) {
  return role === "manager"
    ? { accountType: "manager" as const, vertical: managedVertical }
    : { accountType: "individual" as const, vertical: roleVertical[role] };
}

/** The role to show for saved settings. */
export function roleOf(accountType: string, vertical: string): Role {
  if (accountType === "manager") return "manager";
  return (Object.entries(roleVertical).find(([, v]) => v === vertical)?.[0] as Role | undefined) ?? "other";
}
