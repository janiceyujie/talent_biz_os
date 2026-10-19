"use client";
import { useId, useState, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { useAppData } from "@/components/app/app-data";
import { Modal } from "@/components/app/modal";
import { InfoHint } from "@/components/app/info-hint";
import { DateTimeInput } from "@/components/app/date-time-input";
import { isSigned } from "@/lib/domain/phases";
import { dateInZone } from "@/lib/domain/dates";
import { invoiceAmounts, invoiceErrorKey } from "@/lib/invoices/domain";
import type { InvoiceDetail, InvoiceDefaults } from "@/lib/invoices/types";
import { InvoiceBuyerSaveback } from "./buyer-saveback";
import { invoiceBuyers, type InvoiceBuyer } from "@/lib/invoices/buyers";
import { InvoiceBuyerPicker } from "./buyer-picker";
import { InvoiceDefaultsControls } from "./defaults-controls";
import { InvoiceTaxControls, initialTaxDraft, taxDraftInput, taxPreview } from "./tax-controls";
import { billingDocumentKind, defaultDocumentKind, isBillingCurrency, type BillingDocumentKind } from "@/lib/invoices/document";
import { InvoiceDocumentNotice } from "./document-notice";
import { invoiceRequest } from "./request";
import { InvoiceAddressFields } from "./address-fields";
import { emptyAddress, matchingAddress, postalAddressInput, type AddressDraft } from "@/lib/invoices/address";

export function InvoiceEditor({
  existing,
  availablePayments,
  defaults,
  projectId,
  initialPaymentId,
  onClose,
  onSaved,
}: {
  initialPaymentId?: string;
  existing?: InvoiceDetail;
  availablePayments?: string[];
  defaults?: InvoiceDefaults;
  projectId?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const data = useAppData(),
    t = useTranslations("invoices"),
    today = dateInZone(data.talent.timeZone);
  const payments = data.payments.filter(
    (p) =>
      (!availablePayments || availablePayments.includes(p.id)) &&
      isBillingCurrency(p.currency) &&
      p.amount > 0 &&
      p.direction === "in" &&
      p.status === "expected" &&
      !p.voided &&
      (!p.projectId ||
        data.projects.some(
          (pr) => pr.id === p.projectId && !pr.archived && isSigned(pr.stage),
        )) &&
      (!projectId || p.projectId === projectId),
  );
  const first =
    payments.find((p) => p.id === (existing?.paymentId || initialPaymentId)) || payments[0];
  const project = data.projects.find((p) => p.id === first?.projectId);
  const language =
    existing?.snapshot.documentLanguage || "en";
  const initialKind = existing ? billingDocumentKind(existing.snapshot) : defaultDocumentKind(first?.currency || "USD");
  const emailTemplate = (lang: "en" | "zh-TW", label: string, kind: BillingDocumentKind = initialKind) => ({
    subject: t(kind === "tw_payment_request" ? (lang === "en" ? "requestSubjectEn" : "requestSubjectZh") : (lang === "en" ? "emailSubjectEn" : "emailSubjectZh"), { label }),
    body: t(kind === "tw_payment_request" ? (lang === "en" ? "requestBodyEn" : "requestBodyZh") : (lang === "en" ? "emailBodyEn" : "emailBodyZh"), { label }),
  });
  const [form, setFormState] = useState({
    documentKind: initialKind,
    documentLanguage:
      existing?.snapshot.documentLanguage || "en",
    paymentId: existing?.paymentId || first?.id || "",
    issueOn: existing?.issueOn || first?.invoiceOn || today,
    dueOn: existing?.dueOn || first?.dueDate || today,
    sellerName:
      existing?.snapshot.sellerName || data.talent.name,
    sellerAddress:
      existing?.snapshot.sellerAddress || "",
    sellerEmail:
      existing?.snapshot.sellerEmail ||
      data.person.email,
    buyerName: existing?.snapshot.buyerName || project?.counterparty || "",
    buyerAddress: existing?.snapshot.buyerAddress || "",
    recipient: existing?.snapshot.recipient || "",
    description: existing?.snapshot.description || first?.label || "",
    paymentInstructions:
      existing?.snapshot.paymentInstructions ||
      "",
    taxNote: existing?.snapshot.taxNote || "",
    subject:
      existing?.snapshot.subject ||
      emailTemplate(language, first?.label || "").subject,
    body:
      existing?.snapshot.body ||
      emailTemplate(language, first?.label || "").body,
  });
  const [sellerAddressParts, setSellerAddressParts] = useState<AddressDraft|null>(() => existing?.snapshot.sellerAddressParts || (existing?.snapshot.sellerAddress ? null : emptyAddress()));
  const [buyerAddressParts, setBuyerAddressParts] = useState<AddressDraft|null>(() => existing?.snapshot.buyerAddressParts || (existing?.snapshot.buyerAddress ? null : emptyAddress()));
  const [autoGmailDraft, setAutoGmailDraft] = useState(existing?.autoGmailDraft ?? false);
  const [taxConfirmed, setTaxConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [usTax, setUsTax] = useState(!!existing?.snapshot.taxReview);
  const [taxDraft, setTaxDraft] = useState(() => initialTaxDraft(existing?.snapshot.taxReview, first?.taxIncluded));
  const setForm = (value: SetStateAction<typeof form>) => {
    const next = typeof value === "function" ? value(form) : value;
    setTaxConfirmed(false);
    if (taxDraft.catalogue && (next.description !== form.description || next.buyerAddress !== form.buyerAddress || next.sellerAddress !== form.sellerAddress)) {
      setTaxDraft(current => ({ ...current, catalogue: undefined, rate: "", treatment: "", source: "" }));
    }
    setFormState(next);
  };
  const [buyerSource, setBuyerSource] = useState<InvoiceBuyer | null>(null);
  const taxId = useId();
  const selected = payments.find((p) => p.id === form.paymentId);
  const reviewedTax = usTax ? taxPreview(taxDraft) : undefined;
  const amounts = selected && (!usTax || reviewedTax) ? invoiceAmounts(reviewedTax
    ? { ...selected, taxRate: reviewedTax.rate, taxIncluded: reviewedTax.included } : selected) : undefined;
  const money = (n: number, currency = selected?.currency || "USD") =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(n);
  const field = (
    key: Exclude<
      keyof typeof form,
      "paymentId" | "documentLanguage" | "documentKind" | "issueOn" | "dueOn"
    >,
    multi = false,
  ) => (
    <label key={key}>
      {t(key)}
      {multi ? (
        <textarea
          required
          rows={3}
          maxLength={
            key === "body"
              ? 4000
              : key === "description"
                ? 1500
                : key.endsWith("Address")
                  ? 600
                  : 1200
          }
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      ) : (
        <input
          required
          type={key === "recipient" || key === "sellerEmail" ? "email" : "text"}
          maxLength={
            key === "subject"
              ? 200
              : key === "recipient" || key === "sellerEmail"
                ? 254
                : 150
          }
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      )}
    </label>
  );
  const changePayment = (id: string) => {
    const p = payments.find((p) => p.id === id);
    if (!p) return;
    setForm({
      ...form,
      paymentId: id,
      documentKind: defaultDocumentKind(p.currency),
      taxNote: "",
      description: p.label,
      dueOn: p.dueDate || today,
      buyerName:
        data.projects.find((pr) => pr.id === p.projectId)?.counterparty || "",
      buyerAddress: "",
      recipient: "",
      subject: emailTemplate(form.documentLanguage, p.label, defaultDocumentKind(p.currency)).subject,
      body: emailTemplate(form.documentLanguage, p.label, defaultDocumentKind(p.currency)).body,
    });
    setTaxConfirmed(false);
    setBuyerSource(null);
    setBuyerAddressParts(emptyAddress());
    setUsTax(false);
    setTaxDraft(initialTaxDraft(undefined, p.taxIncluded));
  };
  return (
    <Modal
      title={existing ? t("edit") : t("create")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="invoice-form"
        onInvalidCapture={(e) => {
          const details = (e.target as HTMLElement).closest("details");
          if (details) details.open = true;
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await invoiceRequest<{ id: string }>("/api/invoices", {
              ...form,
              sellerAddressParts: sellerAddressParts || undefined,
              buyerAddressParts: buyerAddressParts || undefined,
              id: existing?.id,
              revision: existing?.revision,
              taxConfirmed,
              taxReview: usTax ? taxDraftInput(taxDraft) : undefined,
              paymentBasis: selected && { amount: selected.amount, taxRate: selected.taxRate, taxIncluded: selected.taxIncluded },
              autoGmailDraft,
            });
            onSaved(r.id);
          } catch (e) {
            setError(e instanceof Error ? e.message : "unavailable");
          } finally {
            setBusy(false);
          }
        }}
      >
        {!payments.length ? (
          <p className="notice">{t("noPayments")}</p>
        ) : (
          <>
            <label>
              {t("payment")}
              <select
                value={form.paymentId}
                disabled={!!existing || busy}
                onChange={(e) => changePayment(e.target.value)}
              >
                {payments.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {money(invoiceAmounts(p).total, p.currency)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("documentKind")}
              <select value={form.documentKind} disabled={busy} onChange={e => {
                const next = e.target.value as BillingDocumentKind;
                const before = emailTemplate(form.documentLanguage, selected?.label || "", form.documentKind);
                const after = emailTemplate(form.documentLanguage, selected?.label || "", next);
                setForm({...form, documentKind: next,
                  subject: form.subject === before.subject ? after.subject : form.subject,
                  body: form.body === before.body ? after.body : form.body});
                setUsTax(false);
                setTaxDraft(initialTaxDraft(undefined, selected?.taxIncluded));
              }}>
                {selected?.currency !== "TWD" && <option value="commercial_invoice">{t("documentKinds.commercial_invoice")}</option>}
                <option value="tw_payment_request">{t("documentKinds.tw_payment_request")}</option>
              </select>
            </label>
            <InvoiceDocumentNotice kind={form.documentKind} />
            <label>
              {t("documentLanguage")}
              <select
                value={form.documentLanguage}
                onChange={(e) => {
                  const next = e.target.value as "en" | "zh-TW",
                    before = emailTemplate(
                      form.documentLanguage,
                      selected?.label || "",
                      form.documentKind,
                    ),
                    after = emailTemplate(next, selected?.label || "", form.documentKind);
                  setForm({
                    ...form,
                    documentLanguage: next,
                    subject:
                      form.subject === before.subject
                        ? after.subject
                        : form.subject,
                    body: form.body === before.body ? after.body : form.body,
                  });
                }}
              >
                <option value="en">{t("languageEnglish")}</option>
                <option value="zh-TW">{t("languageChinese")}</option>
              </select>
            </label>
            <div className="invoice-fields">
              <DateTimeInput
                kind="date"
                label={t("issueOn")}
                today={today}
                value={form.issueOn}
                onChange={(v) => setForm({ ...form, issueOn: v })}
              />
              <DateTimeInput
                kind="date"
                label={t("dueOn")}
                today={today}
                value={form.dueOn}
                onChange={(v) => setForm({ ...form, dueOn: v })}
              />
            </div>
            <InvoiceBuyerPicker key={form.paymentId}
              buyers={invoiceBuyers(data.contacts, data.organizations, data.projects.find((p) => p.id === selected?.projectId))}
              value={{buyerName: form.buyerName, buyerAddress: form.buyerAddress, recipient: form.recipient}}
              disabled={busy}
              onApply={(buyer, source) => {setForm((current) => ({...current, ...buyer})); setBuyerSource(source); setBuyerAddressParts(matchingAddress(buyer.buyerAddress, source.buyerAddressParts) || (buyer.buyerAddress ? null : emptyAddress()));}} />
            <div className="invoice-fields">
              {field("buyerName")}
              {field("recipient")}
            </div>
            <InvoiceAddressFields label={t("buyerAddress")} section="buyer" text={form.buyerAddress} value={buyerAddressParts} disabled={busy} onChange={(text,parts)=>{setBuyerAddressParts(parts);setForm({...form,buyerAddress:text});}} />
            {buyerSource && <InvoiceBuyerSaveback key={buyerSource.id} source={buyerSource}
              address={form.buyerAddress} addressParts={buyerAddressParts ? postalAddressInput.safeParse(buyerAddressParts).data : undefined} email={form.recipient} disabled={busy || (!!buyerAddressParts && !postalAddressInput.safeParse(buyerAddressParts).success)} onBusy={setBusy} />}
            {field("description", true)}
            <details className="invoice-details" open={!existing}>
              <summary>{t("parties")}</summary>
              <InvoiceDefaultsControls
                defaults={defaults}
                addressValid={!sellerAddressParts || postalAddressInput.safeParse(sellerAddressParts).success}
                value={{ sellerName: form.sellerName, sellerAddress: form.sellerAddress, sellerAddressParts: sellerAddressParts ? postalAddressInput.safeParse(sellerAddressParts).data : undefined, sellerEmail: form.sellerEmail, paymentInstructions: form.paymentInstructions }}
                disabled={busy}
                onApply={(value) => {setForm((current) => ({ ...current, ...value }));setSellerAddressParts(value.sellerAddressParts || (value.sellerAddress ? null : emptyAddress()));}}
                onBusy={setBusy}
              />
              <div className="invoice-fields">
                {field("sellerName")}
                {field("sellerEmail")}
              </div>
              <InvoiceAddressFields label={t("sellerAddress")} section="seller" text={form.sellerAddress} value={sellerAddressParts} disabled={busy} onChange={(text,parts)=>{setSellerAddressParts(parts);setForm({...form,sellerAddress:text});}} />
              {field("paymentInstructions", true)}
            </details>
            {selected && form.documentKind === "commercial_invoice" && <InvoiceTaxControls saleOn={form.issueOn} enabled={usTax} value={taxDraft} disabled={busy}
              currentRate={selected.taxRate} currentIncluded={selected.taxIncluded}
              onEnabled={value => { setUsTax(value); setTaxConfirmed(false); }}
              onChange={value => { setTaxDraft(value); setTaxConfirmed(false); }} />}
            {usTax && !amounts && <p className="muted" role="status">{t("taxSetup.pending")}</p>}
            <div className="invoice-amounts" aria-live="polite">
              {amounts && (
                <>
                  <span>
                    {t("subtotal")} <b>{money(amounts.subtotal)}</b>
                  </span>
                  <span>
                    {t("tax")} <b>{money(amounts.tax)}</b>
                  </span>
                  <span>
                    {t("total")} <b>{money(amounts.total)}</b>
                  </span>
                </>
              )}
            </div>
            <div>
              <div className="invoice-actions">
                <label htmlFor={taxId}>{t("taxNote")}</label>
                <InfoHint label={t("taxNote")} notes={[t("taxPlaceholder")]} />
              </div>
              <input
                id={taxId}
                required
                maxLength={500}
                value={form.taxNote}
                onChange={(e) => setForm({ ...form, taxNote: e.target.value })}
              />
            </div>
            <label className="invoice-check">
              <input
                type="checkbox"
                required
                checked={taxConfirmed}
                onChange={(e) => setTaxConfirmed(e.target.checked)}
              />
              {t("taxConfirmed")}
            </label>
            <label className="invoice-check"><input type="checkbox" checked={autoGmailDraft} onChange={e=>setAutoGmailDraft(e.target.checked)} />{t("autoDraft")}</label>
            <InfoHint notes={[t("autoDraftHelp")]} />
            <details className="invoice-details">
              <summary>{t("email")}</summary>
              {field("subject")}
              {field("body", true)}
            </details>
          </>
        )}
        {error && (
          <p className="notice error" role="alert">
            {t(invoiceErrorKey(error))}
          </p>
        )}
        <footer className="invoice-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("close")}
          </button>
          <InfoHint notes={[t("scheduledHelp")]} />
          <button className="primary" disabled={busy || !payments.length || (usTax && !reviewedTax)}>
            {busy ? t("saving") : t("save")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
