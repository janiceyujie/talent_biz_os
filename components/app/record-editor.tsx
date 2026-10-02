"use client";

import { useState } from "react";
import { dateInZone } from "@/lib/domain/dates";
import {
  calendarKindLabels,
  contactRoleLabels,
  directionLabels,
  installmentLabels,
  stageLabels,
} from "@/lib/labels";
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
const entries = <K extends string>(labels: Record<K, string>, keys: readonly K[]): Option[] =>
  keys.map((k) => [k, labels[k]] as const);
const typeOptions: Option[] = projectTypes.map((t) => [t.key, t.label] as const);

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

const names: Record<EditorKind, string> = {
  project: "合作案",
  contact: "藝人與合作方",
  calendar: "行程／待辦",
  payment: "內帳紀錄",
  template: "回覆範本",
  draft: "回覆草稿",
};

/**
 * One add/edit dialog for every record kind. Saving goes through the kind's
 * server action; kinds without one open read-only with a note.
 */
export function RecordEditor({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const data$ = useAppData();
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
    template: { title: "", projectType: "gig", kind: "past_reply", tone: "自然專業", body: "" },
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
    field("projectId", "關聯合作案", "text", false, [
      ["", "未關聯"],
      ...data$.projects
        .filter((p) => !p.archived || p.id === data.projectId)
        .map((p) => [p.id, p.title] as const),
    ]);

  const pricing = (amountKey: string) => (
    <div className="form-grid">
      {field(amountKey, "金額", "number", true)}
      {field("currency", "幣別", "text", true, [["TWD", "TWD"]])}
      {field("taxRate", "稅率 %", "number", true)}
      {field("taxIncluded", "輸入金額已含稅", "checkbox")}
    </div>
  );

  return (
    <Modal title={`${editor.item?.id ? "編輯" : "新增"}${names[kind]}`} onClose={onClose}>
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
            {field("title", "合作案名稱", "text", true)}
            <div className="form-grid">
              <div>
                {field("counterpartyId", "合作方名單", "text", false, [
                  ["", "自行輸入"],
                  ...data$.contacts
                    .filter((c) => !c.archived || c.id === data.counterpartyId)
                    .map((c) => [c.id, c.name] as const),
                ])}
                {!data.counterpartyId && field("counterparty", "合作方")}
              </div>
              {field("type", "商案類型", "text", true, typeOptions)}
              {field("stage", "階段", "text", true, entries(stageLabels, stages))}
            </div>
            {pricing("quotedAmount")}
            {field("contractNotes", "合約內容與待確認事項", "textarea")}
            {field("deliverables", "交付項目", "textarea")}
            {field("rights", "素材授權範圍／期限", "textarea")}
            {field("travel", "交通與住宿安排", "textarea")}
            {field("notes", "備註", "textarea")}
          </>
        )}
        {kind === "contact" && (
          <>
            {field("name", "名稱", "text", true)}
            {field("role", "身分", "text", true, entries(contactRoleLabels, contactRoles))}
            {field("company", "公司／團隊")}
            <div className="form-grid">
              {field("email", "Email", "email")}
              {field("phone", "電話", "tel")}
            </div>
            {field("notes", "備註", "textarea")}
          </>
        )}
        {kind === "calendar" && (
          <>
            {field("title", "事項名稱", "text", true)}
            <div className="form-grid">
              {field("date", "日期", "date", true)}
              {field("time", "時間", "time")}
              {field("timeZone", "時區", "text", true)}
              {field(
                "kind",
                "事項類型",
                "text",
                true,
                // An existing item can't move between to-dos and events.
                entries(calendarKindLabels, calendarKinds).filter(
                  ([k]) => !data.source || todoKinds.includes(k) === (data.source === "todo"),
                ),
              )}
            </div>
            {projectLink()}
            {!todoKinds.includes(String(data.kind)) && field("location", "地點／會議網址")}
            {field("notes", "備註", "textarea")}
            {todoKinds.includes(String(data.kind)) && field("done", "已完成", "checkbox")}
          </>
        )}
        {kind === "payment" && (
          <>
            {field("label", "紀錄名稱", "text", true)}
            {projectLink()}
            <div className="form-grid">
              {field("direction", "收支類型", "text", true, entries(directionLabels, ["in", "out"]))}
              {field("recordedDate", "登錄日期", "date", true)}
              {field("dueDate", "付款期限", "date")}
              {field("installment", "款項階段", "text", true, entries(installmentLabels, ["regular", "deposit", "balance"]))}
              {field("status", "付款狀態", "text", true, [
                ["expected", data.direction === "in" ? "待收" : "待付"],
                ["settled", data.direction === "in" ? "已收" : "已付"],
              ])}
              {field("invoiceRef", "發票／請款編號")}
              {data.status === "settled" && field("settledDate", "實際收付日期", "date", true)}
              {data.status === "settled" && field("settledAmount", "實收／實付金額（留空＝全額）", "number")}
            </div>
            <p className="muted">
              一筆紀錄代表一筆完整收付。分次收款請拆成訂金與尾款；尚未收到款項時保持「待收」。已收／已付的報表依實際收付日期計算。實際入帳少於應收（例如扣繳、二代健保）時，填寫實收金額，差額會另外顯示。
            </p>
            {pricing("amount")}
            {field("notes", "備註", "textarea")}
          </>
        )}
        {kind === "template" && (
          <>
            {field("title", "範本名稱", "text", true)}
            <div className="form-grid">
              {field("projectType", "商案類型", "text", true, typeOptions)}
              {field("kind", "來源類型", "text", true, [
                ["past_reply", "過往回覆"],
                ["template", "回覆範本"],
              ])}
            </div>
            {field("tone", "語氣說明")}
            {field("body", "回覆內容", "textarea", true)}
            <p className="muted">
              可使用 {"{{合作方}}、{{藝人}}、{{案件名稱}}、{{邀約內容}}、{{報價}}、{{交付內容}}、{{授權範圍}}、{{下一步期限}}"}
              。缺少資料會標記待確認。過往回覆不能直接套用；另存範本前請移除舊案的固定人名、金額與檔期。
            </p>
          </>
        )}
        {kind === "draft" && (
          <>
            {projectLink()}
            {field("subject", "信件主旨", "text", true)}
            {field("recipient", "收件人", "email")}
            {field("projectType", "商案類型", "text", true, typeOptions)}
            {field("source", "邀約內容", "textarea")}
            {field("body", "草稿內容", "textarea", true)}
          </>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {!onSave && <p className="muted">此類資料尚未接上資料庫，儲存功能開發中。</p>}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button disabled={!onSave || pending} type="submit" className="primary">
            {pending ? "儲存中…" : "儲存"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
