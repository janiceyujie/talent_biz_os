"use client";

import { useTranslations } from "next-intl";
import type { Notification } from "@/lib/domain/workflow";
import { useMoney } from "@/lib/i18n/format";

/** Title and detail line for a notification, in the active language. */
export function useNotificationText() {
  const t = useTranslations("shell");
  const money = useMoney();
  return (n: Notification) =>
    n.kind === "calendar"
      ? {
          title: n.title,
          detail: `${n.date} ${n.time}${n.overdue ? ` · ${t("overdue")}` : ""}`.trim(),
        }
      : {
          title: t("followUpPayment", { label: n.title }),
          detail: t("paymentDue", { date: n.date, amount: money(n.amount) }),
        };
}
