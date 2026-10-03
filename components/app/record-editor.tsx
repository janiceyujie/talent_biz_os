"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
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
import { placeSuggestions, timeZoneSuggestions } from "@/lib/calendar/places";
import {
  calendarKinds,
  contactRoles,
  stages,
  transportModes,
  type CalendarItem,
  type Project,
  type TransportMode,
} from "@/lib/types";
import { useAppData } from "./app-data";
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

  const pricing = (amountKey: string, amountRequired = true) => (
    <div className="form-grid">
      {field(amountKey, t("field.amount"), "number", amountRequired)}
      {field("currency", t("field.currency"), "text", true, [["TWD", "TWD"]])}
      {field("taxRate", t("field.taxRate"), "number", true)}
      {field("taxIncluded", t("field.taxIncluded"), "checkbox")}
    </div>
  );

  return (
    <Modal title={t(editor.item?.id ? "titleEdit" : "titleNew", { kind })} onClose={onClose}>
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
        {kind === "project" && (
          <>
            {field("title", t("field.projectTitle"), "text", true)}
            <div className="form-grid">
              <div>
                {field("counterpartyId", t("field.counterpartyList"), "text", false, [
                  ["", t("typeIn")],
                  ...data$.contacts
                    .filter((c) => !c.archived || c.id === data.counterpartyId)
                    .map((c) => [c.id, c.name] as const),
                ])}
                {!data.counterpartyId && field("counterparty", t("field.counterparty"))}
              </div>
              {field("type", t("field.type"), "text", true, typeOptions)}
              {field("stage", t("field.stage"), "text", true, options(stages, labels.stage))}
            </div>
            {pricing("quotedAmount", false)}
            <p className="muted">{t("quoteHelp")}</p>
            {field("contractNotes", t("field.contractNotes"), "textarea")}
            {field("deliverables", t("field.deliverables"), "textarea")}
            {field("rights", t("field.rights"), "textarea")}
            {field("travel", t("field.travel"), "textarea")}
            {field("notes", t("field.notes"), "textarea")}
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
              {field("timeZone", t("field.timeZone"), "text", true, undefined, "time-zones")}
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
                  {field("endTimeZone", t("field.endTimeZone"), "text", !!data.endDate, undefined, "time-zones")}
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
                <datalist id="time-zones">
                  {timeZoneSuggestions().map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
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
            {field("label", t("field.label"), "text", true)}
            {projectLink()}
            <div className="form-grid">
              {field("direction", t("field.direction"), "text", true, options(["in", "out"] as const, labels.direction))}
              {field("recordedDate", t("field.recordedDate"), "date", true)}
              {field("dueDate", t("field.dueDate"), "date")}
              {field(
                "installment",
                t("field.installment"),
                "text",
                true,
                options(["regular", "deposit", "balance"] as const, labels.installment),
              )}
              {field(
                "status",
                t("field.status"),
                "text",
                true,
                options(["expected", "settled"] as const, (status) =>
                  labels.paymentStatus({ status, direction: data.direction === "out" ? "out" : "in" }),
                ),
              )}
              {field("invoiceRef", t("field.invoiceRef"))}
              {data.status === "settled" && field("settledDate", t("field.settledDate"), "date", true)}
              {data.status === "settled" && field("settledAmount", t("field.settledAmount"), "number")}
            </div>
            <p className="muted">
              {t("paymentHelp")}
            </p>
            {pricing("amount")}
            {field("notes", t("field.notes"), "textarea")}
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
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {!onSave && <p className="muted">{t("notWired")}</p>}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t("cancel")}
          </button>
          <button disabled={!onSave || pending} type="submit" className="primary">
            {pending ? t("saving") : t("save")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
