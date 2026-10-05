"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { dateInZone } from "@/lib/domain/dates";
import { useLabels } from "@/lib/i18n/labels";
import { projectTypes } from "@/lib/project-types";
import { saveContact } from "@/lib/actions/contacts";
import { saveCalendarItem } from "@/lib/actions/calendar";
import { savePayment } from "@/lib/actions/payments";
import { saveProject } from "@/lib/actions/projects";
import { saveTemplate } from "@/lib/actions/templates";
import { localeNames, locales, toLocale } from "@/lib/i18n/config";
import { placeholderKeys, placeholderName, toDisplay } from "@/lib/templates/placeholders";
import { isSigned } from "@/lib/domain/phases";
import { placeSuggestions } from "@/lib/calendar/places";
import {
  calendarKinds,
  contactRoles,
  stages,
  transportModes,
  type CalendarItem,
  type Project,
  type Stage,
  type TransportMode,
} from "@/lib/types";
import { useAppData } from "./app-data";
import { ContactPicker } from "./contact-picker";
import { TimeZonePicker } from "./time-zone-picker";
import { Modal } from "./modal";

export type RecordData = Record<string, string | number | boolean>;
export type EditorKind = "project" | "contact" | "calendar" | "payment" | "template" | "draft";
export type Editor = { kind: EditorKind; item?: RecordData };

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

type Saver = (data: RecordData) => Promise<string | null>;

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
}: {
  editor: Editor;
  onClose: () => void;
  onSaved?: (data: RecordData) => void;
}) {
  const data$ = useAppData();
  const t = useTranslations("editor");
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
      type: "gig",
      stage: "offer",
      quotedAmount: "", // blank = 報價未定
      currency: "TWD",
      taxRate: 5,
      taxIncluded: false,
      contractNotes: "",
      deliverables: "",
      rights: "",
      travel: "",
      notes: "",
    },
    contact: { name: "", role: "counterparty", company: "", email: "", phone: "", notes: "" },
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
      amount: 0,
      currency: "TWD",
      taxRate: 5,
      taxIncluded: false,
      notes: "",
    },
    template: { title: "", projectType: "gig", kind: "past_reply", language: uiLocale, tone: tTone("natural"), body: "" },
    draft: { projectId: "", subject: "", recipient: "", projectType: "gig", source: "", body: "" },
  };
  const kind = editor.kind;
  const onSave = savers[kind];
  const [data, setData] = useState<RecordData>(() => {
    const initial = { ...defaults[kind], ...editor.item };
    // Templates are stored with neutral placeholders; edit them in the reader's language.
    if (kind === "template") initial.body = toDisplay(String(initial.body), uiLocale);
    return initial;
  });
  const [pending, setPending] = useState(false);
  // Unsaved-change protection: closing an edited form asks first.
  const [initialData] = useState(data);
  const dirty = JSON.stringify(data) !== JSON.stringify(initialData);
  const [confirming, setConfirming] = useState(false);
  const requestClose = () => {
    if (pending) return; // a save in flight decides the outcome
    if (dirty) setConfirming(true);
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
      ...(key === "status" ? { settledDate: value === "settled" ? d.settledDate || today : "" } : {}),
      // An arrival or check-out usually happens in the same zone; start from it.
      ...(key === "endDate" && value ? { endTimeZone: d.endTimeZone || d.timeZone } : {}),
      // A trip's arrival or a stay's check-out isn't another kind's end time: drop it on switching.
      ...(key === "kind" && (d.kind === "travel" || d.kind === "accommodation") && value !== d.kind
        ? { endDate: "", endTime: "", endTimeZone: "" }
        : {}),
    }));

  function field(key: string, label: string, type = "text", required = false, options?: Option[], list?: string) {
    return (
      <label key={key}>
        {label}
        {required ? " *" : ""}
        {options ? (
          <select aria-label={label} value={String(data[key])} onChange={(e) => change(key, e.target.value)}>
            {options.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        ) : type === "textarea" ? (
          <textarea
            aria-label={label}
            rows={4}
            required={required}
            maxLength={10000}
            value={String(data[key] ?? "")}
            onChange={(e) => change(key, e.target.value)}
          />
        ) : type === "checkbox" ? (
          <input aria-label={label} type="checkbox" checked={!!data[key]} onChange={(e) => change(key, e.target.checked)} />
        ) : (
          <input
            aria-label={label}
            type={type}
            required={required}
            step={type === "number" ? "0.01" : undefined}
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
      ])}
      <small className="muted">{t("signedOnly")}</small>
    </div>
  );

  const pricing = (amountKey: string, amountRequired = true, legend = t("section.amount"), amountLabel = t("field.amount")) => (
    <fieldset className="form-section">
      <legend>{legend}</legend>
      <div className="form-grid">
        {field(amountKey, amountLabel, "number", amountRequired)}
        {field("currency", t("field.currency"), "text", true, [["TWD", "TWD"]])}
        {field("taxRate", t("field.taxRate"), "number", true)}
        {field("taxIncluded", t("field.taxIncluded"), "checkbox")}
      </div>
    </fieldset>
  );
  // Income is collected, a cost is paid: the payment form's words follow the direction.
  const out = data.direction === "out";

  return (
    <Modal title={t(editor.item?.id ? "titleEdit" : "titleNew", { kind })} onClose={requestClose}>
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!onSave) return;
          setPending(true);
          const failure = await onSave(data);
          setPending(false);
          if (failure) setError(failure);
          else {
            onSaved?.(data);
            onClose();
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
                <ContactPicker
                  label={t("field.counterparty")}
                  contacts={data$.contacts}
                  name={String(data.counterparty ?? "")}
                  contactId={String(data.counterpartyId ?? "")}
                  onChange={({ name, contactId }) => setData((d) => ({ ...d, counterparty: name, counterpartyId: contactId }))}
                />
              </fieldset>
              {pricing("quotedAmount", false, t("section.quote"), t("field.quotedAmount"))}
              <p className="muted">{t("quoteHelp")}</p>
              {/* Can be filled in later; collapsing keeps what's typed. */}
              <details className="form-details">
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
              {field("company", t("field.company"))}
              <div className="form-grid">
                {field("email", t("field.email"), "email")}
                {field("phone", t("field.phone"), "tel")}
              </div>
              {field("notes", t("field.notes"), "textarea")}
            </>
          )}
          {kind === "calendar" && (
            <>
              {field("title", t("field.itemTitle"), "text", true)}
              <div className="form-grid">
                {field("date", t(travel ? "field.departDate" : stay ? "field.checkInDate" : "field.date"), "date", true)}
                {field("time", t(travel ? "field.departTime" : stay ? "field.checkInTime" : "field.time"), "time", travel || stay)}
                {!travel && !stay && !todoKinds.includes(String(data.kind)) && field("endTime", t("field.endTime"), "time")}
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
              {field("direction", t("field.direction"), "text", true, options(["in", "out"] as const, labels.direction))}
              {pricing("amount")}
              <fieldset className="form-section">
                <legend>{t(out ? "section.paying" : "section.collecting")}</legend>
                <div className="form-grid">
                  {field(
                    "status",
                    t(out ? "field.statusOut" : "field.statusIn"),
                    "text",
                    true,
                    options(["expected", "settled"] as const, (status) => labels.paymentStatus({ status, direction: out ? "out" : "in" })),
                  )}
                  {field("installment", t("field.installment"), "text", true, options(["regular", "deposit", "balance"] as const, labels.installment))}
                  {data.status === "settled" && field("settledDate", t(out ? "field.settledDateOut" : "field.settledDateIn"), "date", true)}
                  {data.status === "settled" && field("settledAmount", t("field.settledAmount"), "number")}
                  {field("dueDate", t(out ? "field.dueDateOut" : "field.dueDateIn"), "date")}
                  {field("recordedDate", t("field.recordedDate"), "date", true)}
                </div>
                <p className="muted">{t(out ? "paymentHelpOut" : "paymentHelpIn")}</p>
              </fieldset>
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
        {!onSave && <p className="muted">{t("notWired")}</p>}
        {confirming ? (
          <footer className="modal-actions" role="alertdialog" aria-label={t("unsaved")}>
            <p className="muted">{t("unsaved")}</p>
            <button type="button" className="secondary" autoFocus onClick={() => setConfirming(false)}>
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
            <button disabled={!onSave || pending} type="submit" className="primary">
              {pending ? t("saving") : t("save")}
            </button>
          </footer>
        )}
      </form>
    </Modal>
  );
}
