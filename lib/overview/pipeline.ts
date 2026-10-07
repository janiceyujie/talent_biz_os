// Deals by phase: live projects per phase, the same grouping as the Projects tabs.
import { phaseOf, type Phase } from "@/lib/domain/phases";
import type { ProjectSummary } from "@/lib/types";

/** The phases a live deal moves through; Ended isn't progress, so it isn't shown. */
export const pipelinePhases = ["negotiation", "execution", "settlement"] as const satisfies readonly Phase[];

export function pipeline(projects: ProjectSummary[]) {
  const live = projects.filter((p) => !p.archived && p.stage !== "closed");
  return pipelinePhases.map((phase) => ({ phase, count: live.filter((p) => phaseOf(p.stage) === phase).length }));
}
