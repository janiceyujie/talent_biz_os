"use client";

import { useTranslations } from "next-intl";
import { useAppData } from "@/components/app/app-data";
import { dateInZone } from "@/lib/domain/dates";
import { daysBetween } from "@/lib/domain/insights";

/** "In 3 days", "Tomorrow", "2 days overdue", and how urgent that is, from a due date. */
export function useDue() {
  const t = useTranslations("projects");
  const data = useAppData();
  const today = dateInZone(data.talent.timeZone);
  return (due: string | null | undefined) => {
    if (!due) return null;
    const days = daysBetween(today, due);
    if (days < 0) return { text: t("overdue", { days: -days }), tone: "overdue" };
    if (days === 0) return { text: t("dueToday"), tone: "soon" };
    if (days === 1) return { text: t("dueTomorrow"), tone: "soon" };
    return { text: t("dueIn", { days }), tone: days <= 3 ? "soon" : "" };
  };
}
