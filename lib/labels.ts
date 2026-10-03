// Code values' display names live in the message catalogs under "labels"
// (messages/*.json); screens read them through useLabels() in lib/i18n/labels.
import type { Stage } from "@/lib/types";

/** Stages that still need work; the rest are done one way or another. */
export const openStages: Stage[] = ["offer", "negotiating", "signed", "in_progress", "collecting_payment"];
