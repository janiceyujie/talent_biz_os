"use client";

import { useTranslations } from "next-intl";
import type { Intent } from "@/lib/ai/extraction/intents";
import type { FlagKind } from "@/lib/ai/safety";
import { projectTypeKeys, type ProjectType } from "@/lib/project-types";
import type { CalendarKind, ContactRole, Payment, Stage, TransportMode } from "@/lib/types";

const questionKeys = ["q1", "q2", "q3", "q4"] as const;

/** Display names for code values (stages, roles, types…), in the active language. */
export function useLabels() {
  const t = useTranslations("labels");
  return {
    stage: (s: Stage) => t(`stage.${s}`),
    contactRole: (r: ContactRole) => t(`contactRole.${r}`),
    calendarKind: (k: CalendarKind) => t(`calendarKind.${k}`),
    transportMode: (m: TransportMode) => t(`transportMode.${m}`),
    direction: (d: Payment["direction"]) => t(`direction.${d}`),
    installment: (i: Payment["installment"]) => t(`installment.${i}`),
    paymentStatus: (p: Pick<Payment, "direction" | "status">) =>
      p.status === "cancelled"
        ? t("paymentStatus.cancelled")
        : t(`paymentStatus.${p.status}${p.direction === "in" ? "In" : "Out"}`),
    projectType: (k: ProjectType) => t(`projectType.${k}.label`),
    intent: (k: Intent) => t(`intent.${k}`),
    flag: (k: FlagKind) => t(`flag.${k}`),
    /** A registry field's label: the project type's own field, else the intent's (lib/ai/extraction). */
    detailField: (type: ProjectType, key: string) => {
      // Field keys come from the registries; `npm run i18n:check` fails if any lacks a label.
      // Look in the message's own type first, then intent fields, then any other type
      // (a model may file a value under a field from elsewhere in the registry).
      const candidates = [type, ...projectTypeKeys.filter((k) => k !== type)].map((k) => `projectType.${k}.fields.${key}`);
      const found = [...candidates.slice(0, 1), `intentField.${key}`, ...candidates.slice(1)].find((k) => t.has(k as Parameters<typeof t>[0]));
      return found ? t(found as Parameters<typeof t>[0]) : key;
    },
    unlinked: () => t("unlinked"),
    unconfirmed: () => t("unconfirmed"),
    /** What to confirm with the counterparty for this type. */
    projectQuestions: (k: ProjectType) => questionKeys.map((q) => t(`projectType.${k}.questions.${q}`)),
  };
}
