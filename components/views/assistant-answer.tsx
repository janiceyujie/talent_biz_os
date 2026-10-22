"use client";

import { useLocale, useTranslations } from "next-intl";
import type { AssistantAnswer } from "@/lib/assistant/answers";
import { useLabels } from "@/lib/i18n/labels";
import { useMoney, useMoneyTotals } from "@/lib/i18n/format";

/** An answer: the model's plain text, or one worked out in code as a summary line and its items. Nothing clickable. */
export function AnswerView({ answer }: { answer: AssistantAnswer }) {
  const t = useTranslations("assistant.answer");
  const locale = useLocale();
  const labels = useLabels();
  const money = useMoney();
  const totals = useMoneyTotals();
  const day = (date: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

  // The model's words: plain text only, never HTML, links, or images (decision 0023).
  if (answer.kind === "text") return <p className="assistant-reply">{answer.text}</p>;

  if (answer.kind === "schedule") {
    if (!answer.lines.length) return <p>{t("scheduleEmpty", { date: day(answer.date) })}</p>;
    return (
      <>
        <p>{t("schedule", { date: day(answer.date), zone: answer.timeZone })}</p>
        <ul className="assistant-answer-list">
          {answer.lines.map((l, i) => (
            <li key={i}>
              <span className="assistant-answer-time">{l.start ? (l.end ? `${l.start}–${l.end}` : l.start) : t("untimed")}</span>{" "}
              {l.title}
              <small>
                {[labels.calendarKind(l.kind), l.project, l.amount && money(l.amount.value, l.amount.currency)].filter(Boolean).join(" · ")}
              </small>
            </li>
          ))}
        </ul>
        {answer.more > 0 && <p className="muted">{t("scheduleMore", { count: answer.more })}</p>}
      </>
    );
  }

  const incoming = answer.direction === "in";
  if (!answer.lines.length) return <p>{t(incoming ? "inEmpty" : "outEmpty")}</p>;
  return (
    <>
      <p>{t(incoming ? "in" : "out", { totals: totals(answer.totals) })}</p>
      {answer.overdue.length > 0 && <p className="assistant-answer-late">{t("overdue", { totals: totals(answer.overdue) })}</p>}
      <ul className="assistant-answer-list">
        {answer.lines.map((l, i) => (
          <li key={i}>
            {money(l.amount, l.currency)} {l.label}
            <small>
              {[l.project, l.dueDate ? t("due", { date: day(l.dueDate) }) : t("noDue"), l.overdue && t("late")].filter(Boolean).join(" · ")}
            </small>
          </li>
        ))}
      </ul>
      {answer.more > 0 && <p className="muted">{t("moneyMore", { count: answer.more })}</p>}
      <p className="muted">{t("signedOnly")}</p>
    </>
  );
}
