"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useAppData } from "@/components/app/app-data";
import { Modal } from "@/components/app/modal";
import type { OpenDealItems } from "@/lib/actions/projects";
import { useMoney } from "@/lib/i18n/format";

/**
 * Marking a deal declined or cancelled while things are still open on it (decision 0018): what's
 * open, and whether to cancel it all or only mark the deal. Only shown when something is open.
 */
export function LostDealDialog({
  title,
  stage,
  items,
  pending,
  onChoose,
  onClose,
}: {
  title: string;
  stage: "declined" | "cancelled";
  items: OpenDealItems;
  pending: boolean;
  onChoose: (cancelOpen: boolean) => void;
  onClose: () => void;
}) {
  const t = useTranslations("lostDeal");
  const data = useAppData();
  const format = useFormatter();
  const money = useMoney();
  const day = (date: string) => format.dateTime(new Date(`${date}T12:00:00Z`), { month: "numeric", day: "numeric", timeZone: "UTC" });
  const total = items.payments.reduce((n, p) => n + p.amount, 0);
  const currencies = new Set(items.payments.map((p) => p.currency));
  const google = data.googleCalendar.connection?.status === "connected";

  return (
    <Modal title={t(stage === "declined" ? "titleDeclined" : "titleCancelled")} onClose={onClose}>
      <div className="confirm-body">
        <p>{t("intro", { project: title })}</p>
        <ul className="lost-deal-items">
          {items.payments.length > 0 && (
            <li>
              <span className="kind">{t("payments", { count: items.payments.length })}</span>
              <span>{currencies.size === 1 ? money(total, [...currencies][0]) : ""}</span>
              <small>
                {items.payments
                  .map((p) => [p.label, money(p.amount, p.currency), p.dueDate ? t("due", { date: day(p.dueDate) }) : ""].filter(Boolean).join(" · "))
                  .join(t("separator"))}
              </small>
            </li>
          )}
          {items.todos.length > 0 && (
            <li>
              <span className="kind">{t("todos", { count: items.todos.length })}</span>
              <span />
              <small>{items.todos.map((x) => [x.title, x.dueDate ? day(x.dueDate) : ""].filter(Boolean).join(" · ")).join(t("separator"))}</small>
            </li>
          )}
          {items.events.length > 0 && (
            <li>
              <span className="kind">{t("events", { count: items.events.length })}</span>
              <span />
              <small>
                {items.events.map((e) => [e.title, `${day(e.date)}${e.time ? ` ${e.time}` : ""}`].join(" ")).join(t("separator"))}
                {google && ` · ${t("eventsGoogle")}`}
              </small>
            </li>
          )}
        </ul>
        <p className="muted">{t("stays")}</p>
      </div>
      <footer className="modal-actions">
        <button type="button" className="secondary" disabled={pending} onClick={() => onChoose(false)}>
          {t("keep")}
        </button>
        <button type="button" className="primary" disabled={pending} onClick={() => onChoose(true)}>
          {t(stage === "declined" ? "cancelDeclined" : "cancelCancelled")}
        </button>
      </footer>
    </Modal>
  );
}
