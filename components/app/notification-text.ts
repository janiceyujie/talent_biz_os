"use client";

import { useTranslations } from "next-intl";
import type { Notification } from "@/lib/domain/notifications";
import { useMoney } from "@/lib/i18n/format";

/** Title and detail line for a notification, in the active language. */
export function useNotificationText() {
  const t = useTranslations("shell");
  const tCalendar = useTranslations("calendar");
  const invoice = useTranslations("invoices");
  const money = useMoney();
  return (n: Notification) => {
    if (n.kind === "invoice") return {title: n.status === "unprepared" ? t("prepareInvoice", {label:n.title}) : t("invoiceReminder", {name:n.title}), detail: [n.status === "unprepared" ? "" : invoice(`statuses.${n.status}`),n.number,n.date].filter(Boolean).join(" · ")};
    if (n.kind === "calendar")
      return {
        title: n.marker ? `${n.title} · ${tCalendar(`point.${n.marker}`)}` : n.title,
        detail: [`${n.date} ${n.time}`.trim(), n.time && n.timeZone, n.location].filter(Boolean).join(" · "),
      };
    return {
      title: n.kind === "receivable" ? t("followUpPayment", { label: n.title }) : t("payPayment", { label: n.title }),
      detail: t("paymentDue", { date: n.date, amount: money(n.amount, n.currency) }),
    };
  };
}
