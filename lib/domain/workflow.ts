// Project workflow rules: settlement, reply templates, summaries, notifications.
// Pure functions over AppData so they run on the server or in the browser.
import { projectType, projectTypes, type ProjectType } from "@/lib/project-types";
import { openStages } from "@/lib/labels";
import type { AppData, Payment, Project, ReplyTemplate } from "@/lib/types";
import { dateInZone } from "./dates";
import { minorUnits, money, quote } from "./money";

export const paymentTotal = (p: Pick<Payment, "amount" | "taxRate" | "taxIncluded" | "currency">) =>
  quote(p.amount, p.taxRate, p.taxIncluded, p.currency).total;

export const projectQuoteTotal = (p: Project) =>
  quote(p.quotedAmount, p.taxRate, p.taxIncluded, p.currency).total;

/** Quoted vs. billed vs. received for one project, plus what still blocks closing. */
export function projectSettlement(data: AppData, project: Project) {
  const rows = data.payments.filter((p) => p.projectId === project.id && !p.archived && p.status !== "cancelled");
  const income = rows.filter((p) => p.direction === "in");
  const sum = (list: Payment[]) => list.reduce((n, p) => n + minorUnits(paymentTotal(p), p.currency), 0);
  const quoted = minorUnits(projectQuoteTotal(project), project.currency);
  const billed = sum(income);
  const received = sum(income.filter((p) => p.status === "settled"));
  return {
    quoted: quoted / 100,
    billed: billed / 100,
    received: received / 100,
    pending: (billed - received) / 100,
    unbilled: (quoted - billed) / 100,
    openItems: data.calendar.filter((c) => c.projectId === project.id && !c.archived && !c.done),
    unpaidCosts: rows.filter((p) => p.direction === "out" && p.status === "expected"),
  };
}

export function starterTemplate(type: ProjectType) {
  const def = projectType(type);
  return {
    title: `${def.label}｜初次確認`,
    projectType: type,
    kind: "template" as const,
    tone: "自然專業",
    body: `{{合作方}} 您好，\n\n謝謝邀請 {{藝人}} 參與「{{案件名稱}}」。為了確認合作安排，想請您補充：\n${def.questions.map((q) => `• ${q}`).join("\n")}\n\n收到後我們會再確認檔期與合作條件，謝謝！`,
  };
}

/**
 * Fill a template's placeholders from one project. Missing values render as
 * 【待確認：欄位】, never guessed. Past replies are refused — they carry an old
 * project's names and fees.
 */
export function renderTemplate(template: ReplyTemplate, source: string, project?: Project) {
  if (template.kind !== "template")
    throw new Error("過往回覆僅供參考，不能直接套用。請先另存為範本，將舊案的人名、金額與檔期改成替換欄位。");
  const values: Record<string, string> = {
    邀約內容: source,
    合作方: project?.counterparty || "",
    藝人: project?.artist || "",
    案件名稱: project?.title || "",
    交付內容: project?.details.deliverables || "",
    授權範圍: project?.details.rights || "",
    下一步期限: project?.nextAction?.dueDate || "",
    報價:
      project && project.quotedAmount > 0
        ? `${money(projectQuoteTotal(project), project.currency)}（含稅，稅率 ${project.taxRate}%）`
        : "",
  };
  const missing = new Set<string>();
  const body = template.body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key: string) => {
    if (Object.hasOwn(values, key) && values[key]) return values[key];
    missing.add(key);
    return `【待確認：${key}】`;
  });
  return { body, missing: [...missing] };
}

/** Date a payment counts on: settled date once settled, otherwise the recorded date. */
export const paymentDate = (p: Payment) => (p.status === "settled" ? p.settledDate || p.recordedDate : p.recordedDate);

/** Cash-basis totals for a date range (TWD only for the MVP). */
export function summarize(data: AppData, from = "", to = "9999-12-31") {
  const rows = data.payments.filter(
    (p) => !p.archived && p.status !== "cancelled" && paymentDate(p) >= from && paymentDate(p) <= to,
  );
  const sum = (match: (p: Payment) => boolean) =>
    Math.round(rows.filter(match).reduce((n, p) => n + paymentTotal(p), 0) * 100) / 100;
  return {
    rows,
    received: sum((p) => p.direction === "in" && p.status === "settled"),
    receivable: sum((p) => p.direction === "in" && p.status === "expected"),
    paid: sum((p) => p.direction === "out" && p.status === "settled"),
    payable: sum((p) => p.direction === "out" && p.status === "expected"),
    split: projectTypes.map((t) => ({
      label: t.label,
      amount: sum((p) => p.direction === "in" && p.status === "settled" && p.projectType === t.key),
    })),
  };
}

export const isActiveProject = (p: Project) => !p.archived && openStages.includes(p.stage);

export type Notification = { id: string; title: string; detail: string; href: string };

/** In-app notifications: calendar items within a week, and overdue income. */
export function notifications(data: AppData, now = new Date()): Notification[] {
  const today = dateInZone(data.talent.timeZone, 0, now);
  const soon = dateInZone(data.talent.timeZone, 7, now);
  return [
    ...data.calendar
      .filter((c) => !c.archived && !c.done && c.date <= soon)
      .map((c) => ({
        id: `calendar:${c.id}:${c.date}:${c.time}`,
        title: c.title,
        detail: `${c.date} ${c.time}${c.date < today ? " · 已過期" : ""}`,
        href: `/calendar?day=${c.date}`,
      })),
    ...data.payments
      .filter((p) => !p.archived && p.direction === "in" && p.status === "expected" && p.dueDate && p.dueDate < today)
      .map((p) => ({
        id: `payment:${p.id}:${p.dueDate}`,
        title: `追蹤收款：${p.label}`,
        detail: `到期 ${p.dueDate} · ${money(paymentTotal(p), p.currency)}`,
        href: "/finance",
      })),
  ];
}
