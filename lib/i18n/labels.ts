"use client";

import { useTranslations } from "next-intl";
import type { ProjectType } from "@/lib/project-types";
import type { CalendarKind, ContactRole, Payment, Stage } from "@/lib/types";

const questionKeys = ["q1", "q2", "q3", "q4"] as const;

/** Display names for code values (stages, roles, types…), in the active language. */
export function useLabels() {
  const t = useTranslations("labels");
  return {
    stage: (s: Stage) => t(`stage.${s}`),
    contactRole: (r: ContactRole) => t(`contactRole.${r}`),
    calendarKind: (k: CalendarKind) => t(`calendarKind.${k}`),
    direction: (d: Payment["direction"]) => t(`direction.${d}`),
    installment: (i: Payment["installment"]) => t(`installment.${i}`),
    paymentStatus: (p: Pick<Payment, "direction" | "status">) =>
      p.status === "cancelled"
        ? t("paymentStatus.cancelled")
        : t(`paymentStatus.${p.status}${p.direction === "in" ? "In" : "Out"}`),
    projectType: (k: ProjectType) => t(`projectType.${k}.label`),
    unlinked: () => t("unlinked"),
    unconfirmed: () => t("unconfirmed"),
    /** What to confirm with the counterparty for this type. */
    projectQuestions: (k: ProjectType) => questionKeys.map((q) => t(`projectType.${k}.questions.${q}`)),
  };
}
