import type { staffRoles } from "@/lib/db/schema";

export type StaffRole = (typeof staffRoles)[number];

/** Whether a staff role may do what needs another: admin may do everything support may (decision 0028). */
export const allows = (role: StaffRole, need: StaffRole) => role === "admin" || role === need;
