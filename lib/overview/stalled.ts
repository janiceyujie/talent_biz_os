// 待跟進: deals still being negotiated where nothing has happened for a while —
// no edit to the project and no new message about it.
import { dateInZone } from "@/lib/domain/dates";
import { daysBetween } from "@/lib/domain/insights";
import { phaseOf } from "@/lib/domain/phases";
import type { InboxMessage, Project } from "@/lib/types";

/** How long without news before a deal counts as quiet (phase 3 makes it a setting). */
export const STALLED_DAYS = 7;

export type StalledDeal = { project: Project; lastActivity: string; quietDays: number };

export function stalledDeals({
  projects,
  inbox,
  today,
  timeZone,
  days = STALLED_DAYS,
}: {
  projects: Project[];
  inbox: InboxMessage[];
  today: string;
  timeZone: string;
  days?: number;
}): StalledDeal[] {
  const localDate = (iso: string) => dateInZone(timeZone, 0, new Date(iso));
  return projects
    .filter((p) => !p.archived && phaseOf(p.stage) === "negotiation")
    .map((project) => {
      const messages = inbox.filter((m) => m.projectId === project.id).map((m) => m.receivedAt);
      const lastActivity = [project.updatedAt, ...messages].map(localDate).sort().at(-1)!;
      return { project, lastActivity, quietDays: daysBetween(lastActivity, today) };
    })
    .filter((d) => d.quietDays >= days)
    .sort((a, b) => b.quietDays - a.quietDays || a.project.title.localeCompare(b.project.title));
}
