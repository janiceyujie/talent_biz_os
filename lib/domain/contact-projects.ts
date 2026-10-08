// The order of a contact's projects on their card: what's ongoing, by what comes
// next, then what's finished, by when it happened (newest first). "When it
// happened" is the project's own latest date, not when it was last edited, so
// fixing a typo on an old project doesn't bring it to the top.
import { phaseOf } from "./phases";
import type { ProjectSummary, Stage } from "@/lib/types";

/** Done with: closed (the last step of settlement), declined, or cancelled. */
export const isFinished = (stage: Stage) => stage === "closed" || phaseOf(stage) === "ended";

export type ContactProject = {
  project: ProjectSummary;
  finished: boolean;
  /** The date it's ordered by (YYYY-MM-DD): ongoing, its next one; finished, its last. Empty when it has none. */
  when: string;
};

/**
 * `datesOf` gives the dates a project happens on (its kept dates and calendar
 * items); `today` is YYYY-MM-DD in the talent's zone. Projects should come
 * newest-edited first, which breaks ties.
 */
export function orderContactProjects(projects: ProjectSummary[], datesOf: (p: ProjectSummary) => string[], today: string): ContactProject[] {
  const ongoing: ContactProject[] = [];
  const finished: ContactProject[] = [];
  for (const project of projects) {
    const dates = datesOf(project).filter(Boolean).sort();
    if (isFinished(project.stage)) {
      finished.push({ project, finished: true, when: dates.at(-1) ?? project.updatedAt.slice(0, 10) });
    } else {
      // The next to-do's due date (overdue ones first), else its next date from today.
      const next = project.nextAction?.dueDate || dates.find((d) => d >= today) || "";
      ongoing.push({ project, finished: false, when: next });
    }
  }
  // Undated ongoing projects last; a stable sort keeps the newest-edited first among equals.
  ongoing.sort((a, b) => (a.when || "9999").localeCompare(b.when || "9999"));
  finished.sort((a, b) => b.when.localeCompare(a.when));
  return [...ongoing, ...finished];
}
