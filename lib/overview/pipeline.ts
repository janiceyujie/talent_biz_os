// 合作案進度: live projects per phase, the same grouping as 合作案's tabs.
import { phaseOf, type Phase } from "@/lib/domain/phases";
import type { Project } from "@/lib/types";

/** The phases a live deal moves through; 已結束 isn't progress, so it isn't shown. */
export const pipelinePhases = ["negotiation", "execution", "settlement"] as const satisfies readonly Phase[];

export function pipeline(projects: Project[]) {
  const live = projects.filter((p) => !p.archived && p.stage !== "closed");
  return pipelinePhases.map((phase) => ({ phase, count: live.filter((p) => phaseOf(p.stage) === phase).length }));
}
