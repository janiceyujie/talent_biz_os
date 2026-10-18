"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition, type RefObject } from "react";
import { useAppData } from "@/components/app/app-data";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { InfoHint } from "@/components/app/info-hint";
import { markNotWork, recordNoticePayment } from "@/lib/actions/mail";
import { isSigned } from "@/lib/domain/phases";
import { useMoney } from "@/lib/i18n/format";
import type { NoticeFields } from "@/lib/mail/payment-notice/fields";
import { expectedTotal, matchNotice, openIncome, type NoticeMatch } from "@/lib/mail/payment-notice/match";
import type { InboxMessage, Payment } from "@/lib/types";

// A bank or payment-app notice in Intake (decision 0013, the restricted path):
// its fields, the expected payment it matches, and one decision — Mark as
// received, or Drop. Only the fields exist: there's no body to show.

/** The payment a notice most likely settles, from what's expected and the names on each project. */
export function useNoticeMatch(notice: NoticeFields | null): NoticeMatch {
  const data = useAppData();
  if (!notice) return null;
  const contactName = new Map(data.contacts.map((c) => [c.id, [c.name, c.company].filter(Boolean)]));
  const namesFor = (p: Payment) => {
    const project = data.projects.find((x) => x.id === p.projectId);
    if (!project) return [];
    const people = data.projectPeople.filter((x) => x.projectId === project.id).flatMap((x) => contactName.get(x.contactId) ?? []);
    return [project.counterparty, ...people].filter(Boolean);
  };
  return matchNotice(notice, data.payments, namesFor);
}

/** "Project · label" for a payment, as the card and the list row name it. */
export function usePaymentName() {
  const data = useAppData();
  const t = useTranslations("paymentNotice");
  return (p: Payment) => {
    const project = data.projects.find((x) => x.id === p.projectId);
    return project ? t("paymentOption", { project: project.title, label: p.label }) : p.label;
  };
}

/** The list row's second line: what it matches, or that nothing does. */
export function NoticeRowLine({ notice }: { notice: NoticeFields }) {
  const t = useTranslations("paymentNotice");
  const data = useAppData();
  const match = useNoticeMatch(notice);
  const nameOf = usePaymentName();
  const recorded = notice.paymentId ? data.payments.find((p) => p.id === notice.paymentId) : undefined;
  if (recorded) return <>{t("rowRecorded", { payment: nameOf(recorded) })}</>;
  return <>{match ? t("rowMatch", { payment: nameOf(match.payment) }) : t("rowNoMatch")}</>;
}

type Choice = { kind: "match" } | { kind: "payment"; id: string } | { kind: "new"; projectId: string };

export function NoticeDetail({
  message,
  notice,
  headingRef,
  gmailUrl,
}: {
  message: InboxMessage;
  notice: NoticeFields;
  headingRef: RefObject<HTMLHeadingElement | null>;
  gmailUrl: string | null;
}) {
  const t = useTranslations("paymentNotice");
  const tInbox = useTranslations("inbox");
  const tGmail = useTranslations("gmail");
  const data = useAppData();
  const format = useFormatter();
  const money = useMoney();
  const nameOf = usePaymentName();
  const match = useNoticeMatch(notice);
  const [choice, setChoice] = useState<Choice>(match ? { kind: "match" } : { kind: "new", projectId: "" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [never, setNever] = useState(false); // also a "never" rule for the sender

  const amount = money(notice.amount, notice.currency);
  const twd = notice.currency === "TWD";
  const others = openIncome(data.payments, notice.currency).filter((p) => p.id !== match?.payment.id);
  const signed = data.projects.filter((p) => !p.archived && isSigned(p.stage));
  const recorded = notice.paymentId ? data.payments.find((p) => p.id === notice.paymentId) : undefined;
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { year: "numeric", month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" });
  const target =
    choice.kind === "match" && match
      ? { paymentId: match.payment.id }
      : choice.kind === "payment" && choice.id
        ? { paymentId: choice.id }
        : choice.kind === "new" && choice.projectId
          ? { projectId: choice.projectId }
          : null;
  const run = (action: () => Promise<string | null>) => startTransition(async () => setError(await action()));

  return (
    <>
      <header className="review-head">
        <h2 ref={headingRef} tabIndex={-1}>
          {t("title", { amount })}
        </h2>
        <em className={`message-status status-${message.status}`}>{tInbox(`status.${message.status}`)}</em>
        <p className="review-meta">
          {message.gmail?.sender && (
            <>
              <span title={message.gmail.sender}>{senderName(message.gmail.sender)}</span>
              {" · "}
            </>
          )}
          {tInbox(`channel.${message.channel}`)}
          {" · "}
          {/* Date and time formatted apart and joined with a plain space, as in the message view (hydration). */}
          <time dateTime={message.receivedAt} title={data.talent.timeZone}>
            {format.dateTime(new Date(message.receivedAt), { month: "numeric", day: "numeric", timeZone: data.talent.timeZone })}{" "}
            {format.dateTime(new Date(message.receivedAt), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: data.talent.timeZone })}
          </time>
        </p>
      </header>

      <section className="review-section">
        <h3>
          {t("details")} <InfoHint notes={[t("detailsInfo")]} />
        </h3>
        <dl className="review-terms">
          <div>
            <dt>{t("amount")}</dt>
            <dd>{amount}</dd>
          </div>
          <div>
            <dt>{t("payer")}</dt>
            <dd className={notice.payer ? undefined : "gap"}>{notice.payer ?? t("notGiven")}</dd>
          </div>
          <div>
            <dt>{t("date")}</dt>
            <dd className={notice.date ? undefined : "gap"}>{notice.date ? day(notice.date) : t("notGiven")}</dd>
          </div>
          <div>
            <dt>{t("account")}</dt>
            <dd className={notice.last4 ? undefined : "gap"}>{notice.last4 ? t("last4", { last4: notice.last4 }) : t("notGiven")}</dd>
          </div>
        </dl>
      </section>

      {message.status === "confirmed" ? (
        <section className="review-section">
          <p className="review-text">{t("recorded", { payment: recorded ? nameOf(recorded) : amount })}</p>
          <div className="row-actions section-gap">
            {message.projectId ? (
              <Link className="primary" href={`/projects?id=${message.projectId}`}>
                {tInbox("viewProject")}
              </Link>
            ) : (
              <Link className="primary" href="/finance">
                {t("viewPayments")}
              </Link>
            )}
          </div>
        </section>
      ) : (
        <section className="review-section">
          <h3>{t("matchHeading")}</h3>
          {!twd ? (
            <p className="muted-line">{t("currencyOnly")}</p>
          ) : (
            <>
              {!match && <p className="muted-line">{t("noMatch")}</p>}
              <div className="target-options">
                {match && (
                  <label className={`target ${choice.kind === "match" ? "on" : ""}`}>
                    <input type="radio" name="notice-target" checked={choice.kind === "match"} onChange={() => setChoice({ kind: "match" })} />
                    <span>
                      <strong>{nameOf(match.payment)}</strong> <small className="muted">{expectedLine(match.payment)}</small>
                    </span>
                  </label>
                )}
                {!!others.length && (
                  <label className={`target ${choice.kind === "payment" ? "on" : ""}`}>
                    <input
                      type="radio"
                      name="notice-target"
                      checked={choice.kind === "payment"}
                      onChange={() => setChoice({ kind: "payment", id: "" })}
                    />
                    {choice.kind === "payment" ? (
                      <select aria-label={t("pickPayment")} value={choice.id} onChange={(e) => setChoice({ kind: "payment", id: e.target.value })}>
                        <option value="">{t("pickPayment")}</option>
                        {others.map((p) => (
                          <option key={p.id} value={p.id}>
                            {nameOf(p)} · {money(expectedTotal(p))}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{match ? t("otherPayment") : t("existingPayment")}</span>
                    )}
                  </label>
                )}
                <label className={`target ${choice.kind === "new" ? "on" : ""}`}>
                  <input type="radio" name="notice-target" checked={choice.kind === "new"} onChange={() => setChoice({ kind: "new", projectId: "" })} />
                  <span>
                    <strong>{t("newPayment")}</strong>{" "}
                    {choice.kind === "new" &&
                      (signed.length ? (
                        <select aria-label={t("pickProject")} value={choice.projectId} onChange={(e) => setChoice({ kind: "new", projectId: e.target.value })}>
                          <option value="">{t("pickProject")}</option>
                          {signed.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <small className="muted">{t("noProjects")}</small>
                      ))}{" "}
                    {choice.kind === "new" && !!signed.length && <InfoHint notes={[t("signedOnly")]} />}
                  </span>
                </label>
              </div>
              {choice.kind === "match" && match && match.shortBy > 0 && <p className="match-note">{t("shortBy", { amount: money(match.shortBy) })}</p>}
            </>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className="review-actions">
            <div className="review-quiet">
              {gmailUrl && (
                <a href={gmailUrl} target="_blank" rel="noopener noreferrer">
                  {tGmail("openInGmail")}
                </a>
              )}
            </div>
            <div className="row-actions">
              <button className="secondary" disabled={pending} onClick={() => setDropping(true)}>
                {t("drop")}
              </button>
              <button className="primary" disabled={pending || !twd || !target} onClick={() => target && run(() => recordNoticePayment(message.id, target))}>
                {t("markReceived")}
              </button>
            </div>
          </div>
        </section>
      )}
      {dropping && (
        <ConfirmDialog
          title={t("dropTitle")}
          confirmLabel={t("drop")}
          pending={pending}
          onClose={() => setDropping(false)}
          onConfirm={() =>
            startTransition(async () => {
              setError(await markNotWork(message.id, never));
              setDropping(false);
            })
          }
        >
          <p>{t("dropBody")}</p>
          {message.gmail?.sender && (
            <label className="check-line">
              <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} />
              {t("dropNeverFrom", { sender: senderName(message.gmail.sender) })}
            </label>
          )}
        </ConfirmDialog>
      )}
    </>
  );

  function expectedLine(p: Payment) {
    const total = money(expectedTotal(p));
    return p.dueDate ? t("expectedDue", { amount: total, date: format.dateTime(new Date(`${p.dueDate}T12:00:00Z`), { month: "numeric", day: "numeric", timeZone: "UTC" }) }) : t("expected", { amount: total });
  }
}

/** "Name <a@b.com>" → "Name"; a bare address stays. */
const senderName = (sender: string) => sender.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] ?? sender;
