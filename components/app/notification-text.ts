"use client";

import { useTranslations } from "next-intl";
import type { Notification } from "@/lib/domain/notifications";
import { useMoney } from "@/lib/i18n/format";

/** Title and detail line for a notification, in the active language. */
export function useNotificationText() {
  const t = useTranslations("shell");
  const tCalendar = useTranslations("calendar");
  const money = useMoney();
  return (n: Notification) => {
    if (n.kind === "calendar")
      return {
        title: n.marker ? `${n.title} · ${tCalendar(`point.${n.marker}`)}` : n.title,
        detail: [`${n.date} ${n.time}`.trim(), n.time && n.timeZone, n.location].filter(Boolean).join(" · "),
      };
    if (n.kind === "opportunity") {
      const day = (d: string | null) => d ?? t("dateNotGiven");
      return {
        title: t("opportunityDatesChanged", { title: n.title }),
        detail: [
          n.from.closesOn !== n.to.closesOn && t("closingDateChange", { from: day(n.from.closesOn), to: day(n.to.closesOn) }),
          n.from.opensOn !== n.to.opensOn && t("openingDateChange", { from: day(n.from.opensOn), to: day(n.to.opensOn) }),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }
    return {
      title: n.kind === "receivable" ? t("followUpPayment", { label: n.title }) : t("payPayment", { label: n.title }),
      detail: t("paymentDue", { date: n.date, amount: money(n.amount, n.currency) }),
    };
  };
}
