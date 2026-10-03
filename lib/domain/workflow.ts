// Project workflow rules: settlement, reply templates, summaries, notifications.
// Pure functions over AppData so they run on the server or in the browser.
import { projectTypes } from "@/lib/project-types";
import { openStages } from "@/lib/labels";
import { contentWords, displayName, placeholderKey, type PlaceholderKey } from "@/lib/templates/placeholders";
import type { AppData, Payment, Project, ReplyTemplate } from "@/lib/types";
import { dateInZone } from "./dates";
import { minorUnits, quote } from "./money";

export const paymentTotal = (p: Pick<Payment, "amount" | "taxRate" | "taxIncluded" | "currency">) =>
  quote(p.amount, p.taxRate, p.taxIncluded, p.currency).total;

/** Cash that actually moved for a settled payment: the settled amount, or the full total. */
export const paymentCash = (p: Payment) => (p.status === "settled" ? (p.settledAmount ?? paymentTotal(p)) : 0);

export const projectQuoteTotal = (p: Project) =>
  quote(p.quotedAmount, p.taxRate, p.taxIncluded, p.currency).total;

/**
 * Quoted vs. billed vs. received for one project, plus what still blocks
 * closing. `shortfall` is billed income that settled for less than its total
 * (withholding, fees) — shown on its own rather than left as outstanding.
 */
export function projectSettlement(data: AppData, project: Project) {
  const rows = data.payments.filter((p) => p.projectId === project.id && !p.voided && p.status !== "cancelled");
  const income = rows.filter((p) => p.direction === "in");
  const units = (n: number) => minorUnits(n, project.currency);
  const sum = (list: Payment[], value: (p: Payment) => number) => list.reduce((n, p) => n + units(value(p)), 0);
  const settled = income.filter((p) => p.status === "settled");
  const quoted = units(projectQuoteTotal(project));
  const billed = sum(income, paymentTotal);
  const received = sum(settled, paymentCash);
  return {
    quoted: quoted / 100,
    billed: billed / 100,
    received: received / 100,
    pending: sum(income.filter((p) => p.status === "expected"), paymentTotal) / 100,
    shortfall: (sum(settled, paymentTotal) - received) / 100,
    unbilled: (quoted - billed) / 100,
    openItems: data.calendar.filter((c) => c.projectId === project.id && c.source === "todo" && !c.archived && !c.done),
    unpaidCosts: rows.filter((p) => p.direction === "out" && p.status === "expected"),
  };
}

/** Thrown for a past reply: it carries an old project's names and fees, so it's never applied directly. */
export class PastReplyError extends Error {}

/**
 * Fill a template's placeholders from one project. Placeholders may be written
 * in any language; the result reads in the template's own language, including
 * the quote and the marker for a missing value (never guessed). `missing`
 * lists placeholder keys, or the name as typed when it isn't one we fill.
 */
export function renderTemplate(template: ReplyTemplate, source: string, project: Project | undefined) {
  if (template.kind !== "template") throw new PastReplyError();
  const words = contentWords[template.language];
  const values: Record<PlaceholderKey, string> = {
    offer: source,
    counterparty: project?.counterparty || "",
    artist: project?.artist || "",
    project: project?.title || "",
    deliverables: project?.details.deliverables || "",
    rights: project?.details.rights || "",
    next_due: project?.nextAction?.dueDate || "",
    quote: project && project.quotedAmount > 0 ? words.quote(projectQuoteTotal(project), project.taxRate) : "",
  };
  const missing = new Set<string>();
  const body = template.body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, name: string) => {
    const key = placeholderKey(name);
    if (key && values[key]) return values[key];
    const shown = key ? displayName(key, template.language) : name;
    missing.add(key ?? name);
    return words.missing(shown);
  });
  return { body, missing: [...missing] };
}

/** Date a payment counts on: settled date once settled, otherwise the recorded date. */
export const paymentDate = (p: Payment) => (p.status === "settled" ? p.settledDate || p.recordedDate : p.recordedDate);

/** Cash-basis totals for a date range (TWD only for the MVP): settled rows count their cash. */
export function summarize(data: AppData, from = "", to = "9999-12-31") {
  const rows = data.payments.filter(
    (p) => !p.voided && p.status !== "cancelled" && paymentDate(p) >= from && paymentDate(p) <= to,
  );
  const value = (p: Payment) => (p.status === "settled" ? paymentCash(p) : paymentTotal(p));
  const sum = (match: (p: Payment) => boolean) =>
    rows.filter(match).reduce((n, p) => n + minorUnits(value(p), p.currency), 0) / 100;
  return {
    rows,
    received: sum((p) => p.direction === "in" && p.status === "settled"),
    receivable: sum((p) => p.direction === "in" && p.status === "expected"),
    paid: sum((p) => p.direction === "out" && p.status === "settled"),
    payable: sum((p) => p.direction === "out" && p.status === "expected"),
    split: projectTypes.map((t) => ({
      type: t.key,
      amount: sum((p) => p.direction === "in" && p.status === "settled" && p.projectType === t.key),
    })),
  };
}

export const isActiveProject = (p: Project) => !p.archived && openStages.includes(p.stage);

/** Structured so each screen words it in the active language. */
export type Notification =
  | { id: string; kind: "calendar"; title: string; date: string; time: string; overdue: boolean; href: string }
  | { id: string; kind: "overduePayment"; title: string; date: string; amount: number; href: string };

/**
 * In-app notifications: open to-dos due within a week (overdue ones stay),
 * events in the coming week, and overdue income. A past event isn't overdue.
 */
export function notifications(data: AppData, now = new Date()): Notification[] {
  const today = dateInZone(data.talent.timeZone, 0, now);
  const soon = dateInZone(data.talent.timeZone, 7, now);
  return [
    ...data.calendar
      .filter((c) => !c.archived && !c.done && c.date <= soon && (c.source === "todo" || c.date >= today))
      .map((c) => ({
        id: `calendar:${c.id}:${c.date}:${c.time}`,
        kind: "calendar" as const,
        title: c.title,
        date: c.date,
        time: c.time,
        overdue: c.date < today,
        href: `/calendar?day=${c.date}`,
      })),
    ...data.payments
      .filter((p) => !p.voided && p.direction === "in" && p.status === "expected" && p.dueDate && p.dueDate < today)
      .map((p) => ({
        id: `payment:${p.id}:${p.dueDate}`,
        kind: "overduePayment" as const,
        title: p.label,
        date: p.dueDate!,
        amount: paymentTotal(p),
        href: "/finance",
      })),
  ];
}
