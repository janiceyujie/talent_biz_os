"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { dateInZone } from "@/lib/domain/dates";
import { useLabels } from "@/lib/i18n/labels";
import { defaultProjectType, projectTypes } from "@/lib/project-types";
import { saveContact } from "@/lib/actions/contacts";
import { saveCalendarItem } from "@/lib/actions/calendar";
import { savePayment, savePaymentWithId } from "@/lib/actions/payments";
import { saveProject } from "@/lib/actions/projects";
import { saveTemplate } from "@/lib/actions/templates";
import { localeNames, locales, toLocale } from "@/lib/i18n/config";
import { placeholderKeys, placeholderName, toDisplay, toStored } from "@/lib/templates/placeholders";
import { isSigned } from "@/lib/domain/phases";
import { paymentBalance, receiptHistory, type PaymentReceipt } from "@/lib/domain/payment-receipts";
import { money } from "@/lib/domain/money";
import { supportedCurrencies } from "@/lib/domain/money";
import { moneyPreview } from "@/lib/domain/money-preview";
import { PaymentReceiptHistory } from "./payment-receipt-history";
import { ReceiptCorrection } from "./receipt-correction";
import { MoneyBreakdown, SettlementAmount } from "./money-preview";
import { placeSuggestions } from "@/lib/calendar/places";
import {
  calendarKinds,
  contactRoles,
  stages,
  transportModes,
  type ReplyTemplate,
  type CalendarItem,
  type Project,
  type Stage,
  type TransportMode,
} from "@/lib/types";
import { useAppData, usePreviewTemplates } from "./app-data";
import { ContactPicker, type NewContact } from "./contact-picker";
import { OrganizationPicker } from "./organization-picker";
import { DateTimeInput } from "./date-time-input";
import { TimeZonePicker } from "./time-zone-picker";
import { Modal } from "./modal";

export type RecordData = Record<string, string | number | boolean>;
export type EditorKind = "project" | "contact" | "calendar" | "payment" | "template" | "draft";
/** `focus` opens the form at one field (e.g. a project's missing rights), expanding its section. */
export type Editor = { kind: EditorKind; item?: RecordData; focus?: string };

/** A typed record as form values: nulls become "", nested values are dropped. */
export function toRecord(o: object): RecordData {
  return Object.fromEntries(
    Object.entries(o)
      .map(([k, v]) => [k, v ?? ""] as const)
      .filter((e): e is [string, string | number | boolean] => ["string", "number", "boolean"].includes(typeof e[1])),
  );
}

/** A calendar item as form values, travel details flattened in. */
export const calendarRecord = (c: CalendarItem): RecordData => ({ ...toRecord(c), ...(c.travel ?? {}) });

export const projectRecord = (p: Project): RecordData => ({
  ...toRecord(p),
  ...toRecord(p.details),
  nextAction: p.nextAction?.title ?? "",
  nextDue: p.nextAction?.dueDate ?? "",
});

type Option = readonly [value: string, label: string];
const options = <K extends string>(keys: readonly K[], label: (k: K) => string): Option[] =>
  keys.map((k) => [k, label(k)] as const);

type Saver = (data: Record<string, unknown>) => Promise<string | null>; // the record, plus a project's new contact

// Kinds whose table is built. The rest open read-only until wired.
const savers: Partial<Record<EditorKind, Saver>> = {
  project: saveProject,
  contact: saveContact,
  payment: savePayment,
  calendar: saveCalendarItem,
  template: saveTemplate,
};

// Kinds stored as to-dos; the rest are calendar events. Kept in step with lib/actions/calendar.
const todoKinds: readonly string[] = ["todo", "deliverable", "payment"];

/**
 * One add/edit dialog for every record kind. Saving goes through the kind's
 * server action; kinds without one open read-only with a note.
 */
export function RecordEditor({
  editor,
  onClose,
  onSaved,
  onPrepareInvoice,
}: {
  editor: Editor;
  onClose: () => void;
  onSaved?: (data: RecordData) => void;
  onPrepareInvoice?: (data: RecordData) => void;
}) {
  const data$ = useAppData();
  const localTemplates = usePreviewTemplates();
  const tPreview = useTranslations("preview");
  const t = useTranslations("editor");
  const tFinance = useTranslations("finance");
  const tInvoice = useTranslations("invoices");
  const tProjects = useTranslations("projects");
  const tTone = useTranslations("tone");
  const labels = useLabels();
  const uiLocale = toLocale(useLocale());
  const typeOptions = options(
    projectTypes.map((pt) => pt.key),
    labels.projectType,
  );
  const today = dateInZone(data$.talent.timeZone);
  const defaults: Record<EditorKind, RecordData> = {
    project: {
      title: "",
      counterparty: "",
      counterpartyId: "",
      type: defaultProjectType,
      stage: "offer",
      quotedAmount: "", // blank = quote not set
      currency: "TWD",
      taxRate: 5,
      taxIncluded: false,
      contractNotes: "",
      deliverables: "",
      rights: "",
      travel: "",
      notes: "",
    },
    contact: { name: "", role: "counterparty", organizationId: "", organizationName: "", email: "", phone: "", billingAddress: "", notes: "" },
    calendar: {
      title: "",
      date: today,
      time: "",
      timeZone: data$.talent.timeZone,
      kind: "todo",
      location: "",
      projectId: "",
      notes: "",
      done: false,
      endDate: "",
      endTime: "",
      endTimeZone: "",
      transportMode: "high_speed_rail",
      operator: "",
      serviceNumber: "",
      destination: "",
      seat: "",
      hotelName: "",
    },
    payment: {
      label: "",
      projectId: "",
      direction: "in",
      recordedDate: today,
      dueDate: "",
      installment: "regular",
      status: "expected",
      settledDate: "",
      settledAmount: "",
      invoiceRef: "",
      invoiceOn: "",
      amount: 0,
      currency: "TWD",
      taxRate: 5,
      taxIncluded: false,
      notes: "",
    },
    template: { title: "", projectType: defaultProjectType, kind: "past_reply", language: uiLocale, tone: tTone("natural"), body: "" },
    draft: { projectId: "", subject: "", recipient: "", projectType: defaultProjectType, source: "", body: "" },
  };
  const kind = editor.kind;
  const onSave = savers[kind];
  const [newContact, setNewContact] = useState<NewContact | null>(null); // a project's partner, added to contacts on save
  // Opening at one field: focus it once the dialog is open (opening it moves focus to its first control).
  // The dialog is a child, so its effect has run by the time this one does.
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (editor.focus) form.current?.querySelector<HTMLElement>(`[data-field="${editor.focus}"]`)?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on opening
  const originalPayment = kind === "payment" ? data$.payments.find(p => p.id === editor.item?.id) : undefined;
  const [correction, setCorrection] = useState<{receipt: PaymentReceipt; operation: "correct" | "withdraw"} | null>(null);
  const history = originalPayment ? receiptHistory(originalPayment) : [];
  const balance = originalPayment ? paymentBalance(originalPayment) : null;
  const [data, setData] = useState<RecordData>(() => {
    const initial = { ...defaults[kind], ...editor.item };
    if (kind === "payment") {
      initial.receiptId = crypto.randomUUID();
      initial.receiptRevision = history.length;
      initial.shortfallReason = "";
      initial.withheldAmount = "";
      initial.settledAmount = "";
      // Editing metadata must not silently record a second cash movement.
      if (originalPayment) initial.status = editor.item?.receiptEntry || (!history.length && editor.item?.status === "settled") ? "settled" : "expected";
      if (initial.status === "settled") initial.settledDate = today;
    }
    if (kind === "payment" && !initial.id && !editor.item?.currency && initial.projectId) {
      initial.currency = data$.projects.find((p) => p.id === initial.projectId)?.currency ?? initial.currency;
    }
    // Templates are stored with neutral placeholders; edit them in the reader's language.
    if (kind === "template") initial.body = toDisplay(String(initial.body), uiLocale);
    // A contact's organisation, as the picker shows it; a company typed before organisations existed becomes one on save.
    if (kind === "contact") {
      initial.organizationId = String(initial.organizationId ?? "");
      initial.organizationName = data$.organizations.find((o) => o.id === initial.organizationId)?.name ?? String(initial.company ?? "");
    }
    // A project's client (decision 0012) and main contact, as the pickers show them.
    if (kind === "project") {
      initial.organizationId = String(initial.clientId ?? "");
      initial.organizationName = String(initial.counterparty ?? "");
      initial.contactName = data$.contacts.find((c) => c.id === initial.counterpartyId)?.name ?? "";
    }
    return initial;
  });
  const [pending, setPending] = useState(false);
  // Unsaved-change protection: closing an edited form asks first.
  const [initialData] = useState(data);
  const dirty = JSON.stringify(data) !== JSON.stringify(initialData);
  const [confirming, setConfirming] = useState(false);
  const keepEditing = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // React can reuse the cancel button, so autofocus does not run on this transition.
    if (confirming) keepEditing.current?.focus();
  }, [confirming]);
  const requestClose = () => {
    if (pending) return; // a save in flight decides the outcome
    if (dirty) {
      setConfirming(true);
      if (confirming) keepEditing.current?.focus();
    }
    else onClose();
  };
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const travel = kind === "calendar" && data.kind === "travel";
  const stay = kind === "calendar" && data.kind === "accommodation";
  const [error, setError] = useState<string | null>(null);

  const change = (key: string, value: string | number | boolean) =>
    setData((d) => ({
      ...d,
      [key]: value,
      ...(key === "shortfallReason" && value !== "withholding" ? { withheldAmount: "" } : {}),
      ...(key === "direction" ? { shortfallReason: "", withheldAmount: "" } : {}),
      ...(key === "status" ? { settledDate: value === "settled" ? d.settledDate || today : "" } : {}),
      ...(key === "projectId" && value ? { currency: data$.projects.find((p) => p.id === String(value))?.currency ?? d.currency } : {}),
      // An arrival or check-out usually happens in the same zone; start from it.
      ...(key === "endDate" && value ? { endTimeZone: d.endTimeZone || d.timeZone } : {}),
      // A trip's arrival or a stay's check-out isn't another kind's end time: drop it on switching.
      ...(key === "kind" && (d.kind === "travel" || d.kind === "accommodation") && value !== d.kind
        ? { endDate: "", endTime: "", endTimeZone: "" }
        : {}),
    }));

  function field(key: string, label: string, type = "text", required = false, options?: Option[], list?: string, disabled = false) {
    if (type === "date" || type === "time") {
      return <DateTimeInput key={key} kind={type} label={label} value={String(data[key] ?? "")} onChange={value => change(key,value)} today={today} required={required} disabled={disabled} field={key}/>;
    }
    return (
      <label key={key}>
        {label}
        {required ? " *" : ""}
        {options ? (
          <select aria-label={label} data-field={key} value={String(data[key])} disabled={disabled} onChange={(e) => change(key, e.target.value)}>
            {options.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        ) : type === "textarea" ? (
          <textarea
            aria-label={label}
            data-field={key}
            disabled={disabled}
            rows={4}
            required={required}
            maxLength={key === "billingAddress" ? 600 : 10000}
            value={String(data[key] ?? "")}
            onChange={(e) => change(key, e.target.value)}
          />
        ) : type === "checkbox" ? (
          <input aria-label={label} type="checkbox" disabled={disabled} checked={!!data[key]} onChange={(e) => change(key, e.target.checked)} />
        ) : (
          <input
            aria-label={label}
            data-field={key}
            disabled={disabled}
            type={type}
            required={required}
            step={type === "number" ? key === "taxRate" ? "0.0001" : (key === "amount" || key === "quotedAmount" || key === "settledAmount") && data.currency === "JPY" ? "1" : "0.01" : undefined}
            min={type === "number" ? 0 : undefined}
            max={key === "taxRate" ? 100 : undefined}
            maxLength={200}
            list={list}
            value={String(data[key] ?? "")}
            // A cleared number stays "" (not set) rather than becoming 0.
            onChange={(e) =>
              change(key, type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)
            }
          />
        )}
      </label>
    );
  }

  // New links go to live, signed projects only (the server checks too); an
  // item keeps the link it already has.
  const projectLink = () => (
    <div>
      {field("projectId", t("field.project"), "text", false, [
        ["", t("unlinked")],
        ...data$.projects
          .filter((p) => (!p.archived && isSigned(p.stage)) || p.id === data.projectId)
          .map((p) => [p.id, p.title] as const),
      ], undefined, Boolean(kind === "calendar" && data.grantApplicationId))}
      {kind === "calendar" && data.grantApplicationId ? <Link className="text-button" href={`/grants?application=${data.grantApplicationId}`}>{t("grantSource")}</Link> : <small className="muted">{t("signedOnly")}</small>}
    </div>
  );

  const currencyOptions = supportedCurrencies.map((currency) => [currency, `${currency} · ${tFinance(`currencyNames.${currency}`)}`] as const);
  const projectCurrencyLocked = kind === "project" && Boolean(data.id) && data$.payments.some((p) => p.projectId === data.id);
  const pricing = (amountKey: string, amountRequired = true, legend = t("section.amount"), amountLabel = t("field.amount")) => (
    <fieldset className="form-section">
      <legend>{legend}</legend>
      <div className="form-grid">
        {field(amountKey, amountLabel, "number", amountRequired, undefined, undefined, kind === "payment" && history.length > 0)}
        {field("currency", t("field.currency"), "text", true, currencyOptions, undefined, (amountKey === "quotedAmount" && projectCurrencyLocked) || (kind === "payment" && history.length > 0))}
        {field("taxRate", t("field.taxRate"), "number", true, undefined, undefined, kind === "payment" && history.length > 0)}
        {field("taxIncluded", t("field.taxIncluded"), "checkbox", false, undefined, undefined, kind === "payment" && history.length > 0)}
      </div>
      <MoneyBreakdown totals={moneyPreview(data[amountKey], data.taxRate, !!data.taxIncluded, String(data.currency))} currency={String(data.currency)} />
      {amountKey === "quotedAmount" && projectCurrencyLocked && <small className="muted">{t("projectCurrencyLocked")}</small>}
    </fieldset>
  );
  // Income is collected, a cost is paid: the payment form's words follow the direction.
  const out = data.direction === "out";

  const canPrepareInvoice = !!onPrepareInvoice && kind === "payment" && !data.id && !!data.projectId &&
    data.direction === "in" && data.status === "expected" && data.currency === "USD" && Number(data.amount) > 0 && !data.invoiceRef;

  if (correction && originalPayment) return <ReceiptCorrection payment={originalPayment} receipt={correction.receipt} operation={correction.operation} today={today} onCancel={() => setCorrection(null)} onDone={onClose}/>;

  return (
    <Modal title={t(editor.item?.id ? "titleEdit" : "titleNew", { kind })} onClose={requestClose}>
      <form
        ref={form}
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!onSave) return;
          if (data$.preview) {
            if (kind !== "template") { setError(tPreview("readOnly")); return; }
            localTemplates.save({...data, id: String(data.id || crypto.randomUUID()), body: toStored(String(data.body)), archived: false} as ReplyTemplate);
            onSaved?.(data);
            onClose();
            return;
          }
          setPending(true);
          // A typed main contact who isn't a contact yet is added as one, with any details given.
          const typedContact = kind === "project" && !data.counterpartyId && String(data.contactName ?? "").trim();
          const prepareInvoice = (e.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement &&
            ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value === "invoice";
          const input = typedContact ? { ...data, newContact: { email: "", phone: "", ...newContact, name: typedContact } } : data;
          try {
            const result = kind === "payment" ? await savePaymentWithId(input) : await onSave(input);
            const failure = typeof result === "string" ? result : result && "error" in result ? result.error : null;
            if (failure) setError(failure);
            else {
              const saved = result && typeof result === "object" && "id" in result ? { ...data, id: result.id } : data;
              onSaved?.(saved);
              onClose();
              if (prepareInvoice) onPrepareInvoice?.(saved);
            }
          } catch {
            setError(tInvoice("error"));
          } finally {
            setPending(false);
          }
        }}
      >
        {/* Locked while saving, so what's saved is what's on screen. */}
        <fieldset className="editor-fields" disabled={pending}>
          {kind === "project" && (
            <>
              <fieldset className="form-section">
                <legend>{t("section.basics")}</legend>
                {field("title", t("field.projectTitle"), "text", true)}
                <div className="form-grid">
                  {field("type", t("field.type"), "text", true, typeOptions)}
                  <div>
                    {field("stage", t("field.stage"), "text", true, options(stages, labels.stage))}
                    <p className="muted">{tProjects(`stageNote.${stages.includes(data.stage as Stage) ? (data.stage as Stage) : "offer"}`)}</p>
                  </div>
                </div>
                {/* The client organisation, then its main contact (optional): decision 0012. */}
                <OrganizationPicker
                  label={t("clientField")}
                  value={{ name: String(data.organizationName ?? ""), organizationId: String(data.organizationId ?? "") }}
                  onChange={(v) => setData((d) => ({ ...d, organizationName: v.name, organizationId: v.organizationId }))}
                />
                <ContactPicker
                  label={t("mainContactField")}
                  required={false}
                  newAt={String(data.organizationName ?? "").trim() || undefined}
                  // The client's people first.
                  contacts={[...data$.contacts].sort(
                    (a, b) => Number(b.organizationId === data.organizationId) - Number(a.organizationId === data.organizationId),
                  )}
                  value={{
                    name: String(data.contactName ?? ""),
                    contactId: String(data.counterpartyId ?? ""),
                    newContact,
                  }}
                  onChange={(v) => {
                    setData((d) => ({ ...d, contactName: v.name, counterpartyId: v.contactId }));
                    setNewContact(v.newContact);
                  }}
                />
              </fieldset>
              {pricing("quotedAmount", false, t("section.quote"), t("field.quotedAmount"))}
              <p className="muted">{t("quoteHelp")}</p>
              {/* Can be filled in later; collapsing keeps what's typed. */}
              <details className="form-details" open={editor.focus ? true : undefined}>
                <summary>{t("section.dealDetails")}</summary>
                {field("contractNotes", t("field.contractNotes"), "textarea")}
                {field("deliverables", t("field.deliverables"), "textarea")}
                {field("rights", t("field.rights"), "textarea")}
                {field("travel", t("field.travel"), "textarea")}
                {field("notes", t("field.notes"), "textarea")}
              </details>
            </>
          )}
          {kind === "contact" && (
            <>
              {field("name", t("field.name"), "text", true)}
              {field("role", t("field.role"), "text", true, options(contactRoles, labels.contactRole))}
              {/* Where they work: an organisation picked or typed new, or none (decision 0012). */}
              <OrganizationPicker
                label={t("field.organization")}
                required={false}
                value={{ name: String(data.organizationName ?? ""), organizationId: String(data.organizationId ?? "") }}
                onChange={(v) => setData((d) => ({ ...d, organizationName: v.name, organizationId: v.organizationId }))}
              />
              <div className="form-grid">
                {field("email", t("field.email"), "email")}
                {field("phone", t("field.phone"), "tel")}
              </div>
              {field("billingAddress", t("field.billingAddress"), "textarea")}
              {field("notes", t("field.notes"), "textarea")}
            </>
          )}
          {kind === "calendar" && (
            <>
              {field("title", t("field.itemTitle"), "text", true)}
              <div className="form-grid">
                {field("date", t(travel ? "field.departDate" : stay ? "field.checkInDate" : "field.date"), "date", true)}
                {field("time", t(travel ? "field.departTime" : stay ? "field.checkInTime" : "field.time"), "time", travel || stay)}

                <TimeZonePicker
                  label={t("field.timeZone")}
                  required
                  value={String(data.timeZone ?? "")}
                  onChange={(zone) => change("timeZone", zone)}
                />
                {field(
                  "kind",
                  t("field.kind"),
                  "text",
                  true,
                  // An existing item can't move between to-dos and events.
                  options(calendarKinds, labels.calendarKind).filter(
                    ([k]) => !data.source || todoKinds.includes(k) === (data.source === "todo"),
                  ),
                )}
              </div>
              {!travel && !stay && !todoKinds.includes(String(data.kind)) && (
                // An ordinary event's end, in the same zone as its start.
                <div className="form-grid">
                  {field("endDate", t("field.endDate"), "date")}
                  {field("endTime", t("field.endTime"), "time", !!data.endDate)}
                </div>
              )}
              {projectLink()}
              {travel && (
                <>
                  <div className="form-grid">
                    {field("transportMode", t("field.transportMode"), "text", true, options(transportModes, labels.transportMode))}
                    {field("operator", t("field.operator"))}
                    {field("serviceNumber", t("field.serviceNumber"))}
                    {field("seat", t("field.seat"))}
                  </div>
                  {field("location", t("field.departFrom"), "text", false, undefined, "places")}
                  {field("destination", t("field.destination"), "text", false, undefined, "places")}
                </>
              )}
              {stay && (
                <>
                  {field("hotelName", t("field.hotelName"), "text", true)}
                  {field("location", t("field.hotelAddress"))}
                </>
              )}
              {(travel || stay) && (
                <>
                  <div className="form-grid">
                    {field("endDate", t(stay ? "field.checkOutDate" : "field.arriveDate"), "date")}
                    {field("endTime", t(stay ? "field.checkOutTime" : "field.arriveTime"), "time", !!data.endDate)}
                    <TimeZonePicker
                      label={t("field.endTimeZone")}
                      required={!!data.endDate}
                      value={String(data.endTimeZone ?? "")}
                      onChange={(zone) => change("endTimeZone", zone)}
                    />
                  </div>
                  {!!(data.endDate || data.endTime || data.endTimeZone) && (
                    <button
                      type="button"
                      className="text-button left"
                      onClick={() => setData((d) => ({ ...d, endDate: "", endTime: "", endTimeZone: "" }))}
                    >
                      {t("clearEnd")}
                    </button>
                  )}
                  <p className="muted">{t("travelHelp")}</p>
                  <datalist id="places">
                    {placeSuggestions(
                      (data.transportMode as TransportMode | "") || "",
                      uiLocale,
                      data$.calendar.flatMap((c) => (c.kind === "travel" ? [c.location, c.travel?.destination ?? ""] : [])),
                    ).map((place) => (
                      <option key={place} value={place} />
                    ))}
                  </datalist>
                </>
              )}
              {!todoKinds.includes(String(data.kind)) && !travel && !stay && field("location", t("field.location"))}
              {field("notes", t("field.notes"), "textarea")}
              {todoKinds.includes(String(data.kind)) && field("done", t("field.done"), "checkbox")}
            </>
          )}
          {kind === "payment" && (
            <>
              {/* What it is and which way it goes, then how much, then when it moves. */}
              {field("label", t("field.label"), "text", true)}
              {projectLink()}
              {field("direction", t("field.direction"), "text", true, options(["in", "out"] as const, labels.direction), undefined, history.length > 0)}
              {pricing("amount")}
              <fieldset className="form-section">
                <legend>{t(out ? "section.paying" : "section.collecting")}</legend>
                <div className="form-grid">
                  {field(
                    "status",
                    t("settlement.entry"),
                    "text",
                    true,
                    [["expected", t("settlement.noEntry")], ...(!balance || balance.remaining > 0 ? [["settled", t(out ? "settlement.recordPaid" : "settlement.recordReceived")] as Option] : [])],
                  )}
                  {field("installment", t("field.installment"), "text", true, options(["regular", "deposit", "balance"] as const, labels.installment))}
                  {data.status === "settled" && field("settledDate", t(out ? "field.settledDateOut" : "field.settledDateIn"), "date", true)}
                  {data.status === "settled" && <SettlementAmount totals={history.length && balance ? {net: balance.remaining, tax: 0, total: balance.remaining} : moneyPreview(data.amount, data.taxRate, !!data.taxIncluded, String(data.currency))} currency={String(data.currency)} out={out} value={String(data.settledAmount ?? "")} onChange={value => change("settledAmount", value)} reason={String(data.shortfallReason ?? "")} onReasonChange={value => change("shortfallReason", value)} withheldValue={String(data.withheldAmount ?? "")} onWithheldChange={value => change("withheldAmount", value)} />}
                  {field("dueDate", t(out ? "field.dueDateOut" : "field.dueDateIn"), "date")}
                  {field("recordedDate", t("field.recordedDate"), "date", true)}
                </div>
                <p className="muted">{t(out ? "paymentHelpOut" : "paymentHelpIn")}</p>
              </fieldset>
              {history.length > 0 && balance && <details className="form-details" open>
                <summary data-field="receiptHistory">{t("settlement.history")}</summary>
                <dl className="editor-money-summary">
                  <div><dt>{t(out ? "settlement.actualPaid" : "settlement.actualReceived")}</dt><dd>{money(balance.cash, uiLocale, String(data.currency))}</dd></div>
                  <div><dt>{t("settlement.withheld")}</dt><dd>{money(balance.withheld, uiLocale, String(data.currency))}</dd></div>
                  <div className="is-total"><dt>{t("settlement.remaining")}</dt><dd>{money(balance.remaining, uiLocale, String(data.currency))}</dd></div>
                </dl>
                {originalPayment && <PaymentReceiptHistory key={originalPayment.id} payment={originalPayment} timeZone={data$.talent.timeZone} preview={!!data$.preview} disabled={dirty || !!data$.preview || !!originalPayment.voided} onAmend={(receipt, operation) => setCorrection({receipt,operation})} />}
                {dirty && <p className="muted">{t("receiptCorrection.saveFirst")}</p>}
              </details>}
              {!out && data.currency === "USD" && field("invoiceOn", t("field.invoiceOn"), "date")}
              <details className="form-details">
                <summary>{t("section.other")}</summary>
                {field("invoiceRef", t("field.invoiceRef"))}
                {field("notes", t("field.notes"), "textarea")}
              </details>
            </>
          )}
          {kind === "template" && (
            <>
              {field("title", t("field.templateTitle"), "text", true)}
              <div className="form-grid">
                {field("projectType", t("field.type"), "text", true, typeOptions)}
                {field("kind", t("field.templateKind"), "text", true, [
                  ["past_reply", t("kind.pastReply")],
                  ["template", t("kind.template")],
                ])}
                {field(
                  "language",
                  t("field.language"),
                  "text",
                  true,
                  locales.map((l) => [l, localeNames[l]] as const),
                )}
              </div>
              <p className="muted">{t("languageHelp")}</p>
              {field("tone", t("field.tone"))}
              {field("body", t("field.body"), "textarea", true)}
              <p className="muted">
                {t("templateHelp", {
                  placeholders: placeholderKeys.map((key) => placeholderName(key, uiLocale)).join(" "),
                })}
              </p>
            </>
          )}
          {kind === "draft" && (
            <>
              {projectLink()}
              {field("subject", t("field.subject"), "text", true)}
              {field("recipient", t("field.recipient"), "email")}
              {field("projectType", t("field.type"), "text", true, typeOptions)}
              {field("source", t("field.source"), "textarea")}
              {field("body", t("field.draftBody"), "textarea", true)}
            </>
          )}
        </fieldset>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {data$.preview && <p className="muted">{tPreview(kind === "template" ? "localTemplates" : "readOnly")}</p>}
        {!onSave && <p className="muted">{t("notWired")}</p>}
        {confirming ? (
          <footer className="modal-actions" role="alertdialog" aria-label={t("unsaved")}>
            <p className="muted">{t("unsaved")}</p>
            <button type="button" className="secondary" ref={keepEditing} onClick={() => setConfirming(false)}>
              {t("keepEditing")}
            </button>
            <button type="button" className="primary" onClick={onClose}>
              {t("discard")}
            </button>
          </footer>
        ) : (
          <footer className="modal-actions">
            <button type="button" className="secondary" disabled={pending} onClick={requestClose}>
              {t("cancel")}
            </button>
            <button disabled={!onSave || pending || (!!data$.preview && kind !== "template")} type="submit" className={canPrepareInvoice ? "secondary" : "primary"}>
              {pending ? t("saving") : t("save")}
            </button>
            {canPrepareInvoice && (
              <button disabled={pending || !!data$.preview} type="submit" name="next" value="invoice" className="primary">
                {tInvoice("saveAndPrepare")}
              </button>
            )}
          </footer>
        )}
      </form>
    </Modal>
  );
}
