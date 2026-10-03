// Project phases group stages for the UI; computed, never stored.
// See docs/architecture.md, "Phases" and "Which to-dos a project can have".
import type { Stage } from "@/lib/types";

export const phases = ["negotiation", "execution", "settlement", "ended"] as const;
export type Phase = (typeof phases)[number];

const phaseByStage: Record<Stage, Phase> = {
  offer: "negotiation",
  negotiating: "negotiation",
  signed: "execution",
  in_progress: "execution",
  collecting_payment: "settlement",
  closed: "settlement",
  declined: "ended", // exits: finished, outside the three phases
  cancelled: "ended",
};

export const phaseOf = (stage: Stage): Phase => phaseByStage[stage];

/** The main line a project moves along; declined and cancelled are exits from it. */
export const mainStages: Stage[] = ["offer", "negotiating", "signed", "in_progress", "collecting_payment", "closed"];

/**
 * Signed work (execution or settlement phase). Only signed projects take new
 * linked events, execution to-dos, and payments.
 */
export const isSigned = (stage: Stage) => phaseOf(stage) === "execution" || phaseOf(stage) === "settlement";
