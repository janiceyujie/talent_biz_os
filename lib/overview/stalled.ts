// Gone quiet: deals still being negotiated where nothing has happened for a while —
// no edit to the project and no new message about it.
import { dateInZone } from "@/lib/domain/dates";
import { daysBetween } from "@/lib/domain/insights";
import { phaseOf } from "@/lib/domain/phases";
import type { ProjectSummary } from "@/lib/types";

/** How long without news before a deal counts as quiet (phase 3 makes it a setting). */
export const STALLED_DAYS = 7;

export type StalledDeal = { project: ProjectSummary; lastActivity: string; quietDays: number };

export function stalledDeals({
  projects,
  lastMessageAt,
  today,
  timeZone,
  days = STALLED_DAYS,
}: {
  projects: ProjectSummary[];
  lastMessageAt: Record<string, string>; // each project's latest message, by project id
  today: string;
  timeZone: string;
  days?: number;
}): StalledDeal[] {
  const localDate = (iso: string) => dateInZone(timeZone, 0, new Date(iso));
  return projects
    .filter((p) => !p.archived && phaseOf(p.stage) === "negotiation")
    .map((project) => {
      const message = lastMessageAt[project.id];
      const lastActivity = [project.updatedAt, ...(message ? [message] : [])].map(localDate).sort().at(-1)!;
      return { project, lastActivity, quietDays: daysBetween(lastActivity, today) };
    })
    .filter((d) => d.quietDays >= days)
    .sort((a, b) => b.quietDays - a.quietDays || a.project.title.localeCompare(b.project.title));
}
