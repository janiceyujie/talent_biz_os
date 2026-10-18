"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/app/modal";
import { DateTimeInput } from "@/components/app/date-time-input";
import { InfoHint } from "@/components/app/info-hint";
import { useAppData } from "@/components/app/app-data";
import { dateInZone } from "@/lib/domain/dates";
import { invoiceState, invoiceErrorKey, validInvoiceReceiptDate } from "@/lib/invoices/domain";
import type { InvoiceDetail } from "@/lib/invoices/types";
import { billingDocumentKind } from "@/lib/invoices/document";
import { InvoiceDocumentNotice } from "./document-notice";
import { invoiceRequest } from "./request";
export function InvoiceReview({
  row,
  onClose,
  onEdit,
  onChanged,
}: {
  row: InvoiceDetail;
  onClose: () => void;
  onEdit: () => void;
  onChanged: (updated?: InvoiceDetail) => void;
}) {
  const t = useTranslations("invoices"),
    locale = useLocale(),
    data = useAppData(),
    today = dateInZone(data.talent.timeZone),
    s = row.snapshot;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [paidConfirmed, setPaidConfirmed] = useState(false),
    [receivedOn, setReceivedOn] = useState(today),
    [authorize, setAuthorize] = useState(false);
  const money = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: s.currency,
      currencyDisplay: "code",
    }).format(n);
  const action = async (op: string) => {
    setBusy(true);
    setError("");
    try {
      await invoiceRequest(`/api/invoices/${row.id}`, {
        op,
        revision: row.revision,
        confirmed: true,
        settledOn: receivedOn,
      });
      let current: InvoiceDetail | undefined;
      if (op === "createDraft" || op === "syncDraft") {
        for (let attempt = 0; attempt < 16; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 350));
          current = await invoiceRequest<InvoiceDetail>(`/api/invoices/${row.id}`);
          if (op === "createDraft" ? !["draft_queued", "draft_creating"].includes(current.status) : current.gmail?.checkedAt !== row.gmail?.checkedAt) break;
        }
      }
      onChanged(op === "cancel" ? undefined : current || await invoiceRequest<InvoiceDetail>(`/api/invoices/${row.id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "unavailable");
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    setBusy(true);
    setError("");
    try { onChanged(await invoiceRequest<InvoiceDetail>(`/api/invoices/${row.id}`)); }
    catch { setError("unavailable"); }
    finally { setBusy(false); }
  };
  const editable = ["draft", "scheduled"].includes(row.status);
  const receiptDateValid = validInvoiceReceiptDate(receivedOn, row.issueOn, today);
  return (
    <Modal
      title={`${row.number} · ${t(`statuses.${invoiceState(row.status, row.paid, row.dueOn, today)}`)}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="invoice-review">
        <InvoiceDocumentNotice kind={billingDocumentKind(s)} />
        <div className="invoice-paper">
          <div className="invoice-paper-head">
            <strong>{s.sellerName}</strong>
            <span>{t(`documentKinds.${billingDocumentKind(s)}`)}</span>
          </div>
          <div className="invoice-fields">
            <div>
              <b>{s.buyerName}</b>
              <p>{s.buyerAddress}</p>
            </div>
            <dl>
              <dt>{t("issueLabel")}</dt>
              <dd>{row.issueOn}</dd>
              <dt>{t("dueOn")}</dt>
              <dd>{row.dueOn}</dd>
            </dl>
          </div>
          <p>{s.description}</p>
          <div className="invoice-amounts">
            <span>
              {t("subtotal")} <b>{money(s.subtotal)}</b>
            </span>
            <span>
              {t("tax")}{s.taxReview ? ` (${s.taxReview.rate}%)` : ""} <b>{money(s.tax)}</b>
            </span>
            <span>
              {t("total")} <b>{money(s.total)}</b>
            </span>
          </div>
          <p>{s.paymentInstructions}</p>
          <p>{s.taxNote}</p>
          {s.taxReview && <details className="invoice-details">
            <summary>{t("taxSetup.review")}</summary>
            <p>{t(`taxSetup.states.${s.taxReview.state}`)} · {t(`taxSetup.treatments.${s.taxReview.treatment}`)}</p>
            <p>{s.taxReview.location}</p>
            {s.taxReview.catalogue && <p>{t(`taxCatalogue.categories.${s.taxReview.catalogue.category}`)} · {s.taxReview.catalogue.saleOn}</p>}
            {s.taxReview.evidence?.rateName && <p>{s.taxReview.evidence.rateName}</p>}
            <p>{s.taxReview.source}</p>
          </details>}
        </div>
        <div className="invoice-actions">
          <a
            className="secondary"
            href={`/api/invoices/${row.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            {t("pdf")}
          </a>
          {editable && (
            <button className="secondary" disabled={busy} onClick={onEdit}>
              {t("edit")}
            </button>
          )}
        </div>
        <details className="invoice-details" open={editable}>
            <summary>{t(editable ? "email" : "emailRecord")}</summary>
            <dl className="invoice-mail-meta">
              {editable && <><dt>{t("from")}</dt><dd>{row.from || "—"}</dd></>}
              {row.sentAt && <><dt>{t("sentAt")}</dt><dd><time dateTime={row.sentAt}>{new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: data.talent.timeZone}).format(new Date(row.sentAt))}</time></dd></>}
              <dt>{t("replyTo")}</dt>
              <dd>{s.sellerEmail}</dd>
              <dt>{t("recipient")}</dt>
              <dd>{s.recipient}</dd>
              <dt>{t("subject")}</dt>
              <dd>{s.subject}</dd>
            </dl>
            <p className="invoice-email-body">{s.body}</p>
          </details>
        {row.gmail?.mode === "local" && <p className="notice">{t("localDraft")}</p>}
        {editable && (
          <>
            {row.status === "draft" && <>
              <label className="invoice-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />{t("draftConfirm")}</label>
              <button className="primary" disabled={busy || !confirmed || !row.gmail?.ready} onClick={()=>action("createDraft")}>
                {busy ? t("creatingDraft") : t("createGmailDraft")}
              </button>
            </>}
            {!row.gmail?.ready && <div className="notice">
              <p>{t(row.gmail?.mode === "disabled" ? "draftDisabled" : "draftAuthorization")}</p>
              <button className="text-button" onClick={()=>setAuthorize(!authorize)} aria-expanded={authorize}>{t("authorizeDrafts")}</button>
              {authorize && <div><p>{t("composeDisclosure")}</p><a className="secondary" href="/api/mail/connect?drafts=1">{t("continueGoogle")}</a></div>}
            </div>}
          </>
        )}
        {row.status === "scheduled" && <p>{t(row.autoGmailDraft ? "autoDraftScheduled" : "scheduledHelp")}</p>}
        {["draft_queued","draft_creating"].includes(row.status) && <div role="status"><p>{t("draftWorking")}</p><button type="button" className="secondary" disabled={busy} onClick={refresh}>{t("refresh")}</button></div>}
        {["gmail_draft","draft_unknown","draft_missing"].includes(row.status) && <>
          <p className="notice">{t(row.status === "gmail_draft" ? "draftReady" : "draftUncertain")}</p>
          <div className="invoice-actions">
            {row.gmail?.mode === "live" && row.gmail.account && <a className="secondary" href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(row.gmail.account)}#drafts`} target="_blank" rel="noreferrer">{t("openGmailDrafts")}</a>}
            <button className="secondary" disabled={busy} onClick={()=>action("syncDraft")}>{t("syncDraft")}</button>
          </div>
          <InfoHint notes={[t("draftSnapshotHelp")]} />
        </>}
        {row.gmail?.error && <p className="notice" role="status">{t(invoiceErrorKey(row.gmail.error))}</p>}
        {["sending","delivery_unknown"].includes(row.status) && <p className="notice">{t("legacyDelivery")}</p>}
        {row.status === "sent" && row.gmail?.account && <InfoHint notes={[t("draftSnapshotHelp")]} />}
        {row.status === "sent" && (
          <>
            <p>
              {t("received")}: {money(row.received)} · {t("remainder")}:{" "}
              {money(row.remaining ?? Math.max(0, s.total - row.received))}
              {!!row.withheld && <> · {t("withheld")}: {money(row.withheld)}</>}
            </p>
            {!row.paid && (
              <details className="invoice-details">
                <summary>{t("settle")}</summary>
                <form className="invoice-receipt-form" onSubmit={(event) => {
                  event.preventDefault();
                  if (paidConfirmed && receiptDateValid && !busy) void action("settle");
                }}>
                  <DateTimeInput kind="date" label={t("settledOn")} value={receivedOn} onChange={setReceivedOn} today={today} required disabled={busy} />
                  {!receiptDateValid && <p className="notice error" role="alert">{t("receiptDateRange", {from: row.issueOn, to: today})}</p>}
                <label className="invoice-check">
                  <input
                    type="checkbox"
                    checked={paidConfirmed}
                    onChange={(e) => setPaidConfirmed(e.target.checked)}
                  />
                  {t("settleConfirm")}
                </label>
                <button
                  className="secondary"
                  type="submit"
                  disabled={busy || !paidConfirmed || !receiptDateValid}
                >
                  {t("settle")}
                </button>
                </form>
                <InfoHint notes={[t("settlementHelp")]} />
              </details>
            )}
          </>
        )}
        {error && (
          <p className="notice error" role="alert">
            {t(invoiceErrorKey(error))}{" "}
            <button type="button" className="text-button" onClick={refresh}>
              {t("refresh")}
            </button>
          </p>
        )}
        {editable && (
          <details className="invoice-details">
            <summary>{t("cancel")}</summary>
            <p>{t("cancelConfirm")}</p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => action("cancel")}
            >
              {t("cancel")}
            </button>
          </details>
        )}
      </div>
    </Modal>
  );
}
