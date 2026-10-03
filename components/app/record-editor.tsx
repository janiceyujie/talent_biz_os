"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { dateInZone } from "@/lib/domain/dates";
import { useLabels } from "@/lib/i18n/labels";
import { projectTypes } from "@/lib/project-types";
import { saveContact } from "@/lib/actions/contacts";
import { saveCalendarItem } from "@/lib/actions/calendar";
import { savePayment } from "@/lib/actions/payments";
import { saveProject } from "@/lib/actions/projects";
import { calendarKinds, contactRoles, stages, type Project } from "@/lib/types";
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
};

// Kinds stored as to-dos; the rest are calendar events. Kept in step with lib/actions/calendar.
const todoKinds: readonly string[] = ["todo", "deliverable", "payment"];

/**
 * One add/edit dialog for every record kind. Saving goes through the kind's
 * server action; kinds without one open read-only with a note.
 */
export function RecordEditor({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const data$ = useAppData();
  const t = useTranslations("editor");
  const tTone = useTranslations("tone");
  const labels = useLabels();
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
      quotedAmount: 0,
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
    template: { title: "", projectType: "gig", kind: "past_reply", tone: tTone("natural"), body: "" },
    draft: { projectId: "", subject: "", recipient: "", projectType: "gig", source: "", body: "" },
  };
  const kind = editor.kind;
  const onSave = savers[kind];
  const [data, setData] = useState<RecordData>(() => ({ ...defaults[kind], ...editor.item }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (key: string, value: string | number | boolean) =>
    setData((d) => ({
      ...d,
      [key]: value,
      ...(key === "status" ? { settledDate: value === "settled" ? d.settledDate || today : "" } : {}),
    }));

  function field(key: string, label: string, type = "text", required = false, options?: Option[]) {
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
            value={String(data[key] ?? "")}
            onChange={(e) => change(key, type === "number" ? Number(e.target.value) : e.target.value)}
          />
        )}
      </label>
    );
  }

  const projectLink = () =>
    field("projectId", t("field.project"), "text", false, [
      ["", t("unlinked")],
      ...data$.projects
        .filter((p) => !p.archived || p.id === data.projectId)
        .map((p) => [p.id, p.title] as const),
    ]);

  const pricing = (amountKey: string) => (
    <div className="form-grid">
      {field(amountKey, t("field.amount"), "number", true)}
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
          else onClose();
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
            {pricing("quotedAmount")}
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
              {field("date", t("field.date"), "date", true)}
              {field("time", t("field.time"), "time")}
              {field("timeZone", t("field.timeZone"), "text", true)}
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
            {!todoKinds.includes(String(data.kind)) && field("location", t("field.location"))}
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
            </div>
            {field("tone", t("field.tone"))}
            {field("body", t("field.body"), "textarea", true)}
            <p className="muted">
              {t("templateHelp", {
                // Language-neutral placeholder names arrive in i18n step 4; until then these are the stored tokens.
                placeholders: "{{合作方}}、{{藝人}}、{{案件名稱}}、{{邀約內容}}、{{報價}}、{{交付內容}}、{{授權範圍}}、{{下一步期限}}",
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
