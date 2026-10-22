// Project workflow rules: settlement, reply templates, summaries, notifications.
// Pure functions over AppData so they run on the server or in the browser.
import { projectTypes } from "@/lib/project-types";
import { contentWords, displayName, placeholderKey, type PlaceholderKey } from "@/lib/templates/placeholders";
import type { AppData, Payment, PaymentReceipt, Project, ProjectSummary, ReplyTemplate } from "@/lib/types";
import { isSigned } from "./phases";
import { minorUnitFactor, minorUnits, quote, totalsByCurrency, type Currency } from "./money";

export const paymentTotal = (p: Pick<Payment, "amount" | "taxRate" | "taxIncluded" | "currency">) =>
  quote(p.amount, p.taxRate, p.taxIncluded, p.currency).total;

/** Receipts that count (decision 0021): not replaced by a correction, not withdrawn. */
export function activeReceipts(p: Pick<Payment, "receipts">) {
  const replaced = new Set(p.receipts.flatMap((r) => (r.replacesId ? [r.replacesId] : [])));
  return p.receipts.filter((r) => !r.withdrawn && !replaced.has(r.id));
}

const receiptSum = (p: Pick<Payment, "receipts" | "currency">, value: (r: PaymentReceipt) => number, from = "", to = "9999-12-31") =>
  activeReceipts(p)
    .filter((r) => r.date >= from && r.date <= to)
    .reduce((n, r) => n + minorUnits(value(r), p.currency), 0) / minorUnitFactor(p.currency);

/** Cash that actually moved for a payment, whatever its status; with dates, only receipts in them. */
export const paymentCash = (p: Pick<Payment, "receipts" | "currency">, from?: string, to?: string) => receiptSum(p, (r) => r.cash, from, to);

/** Kept back by the payer (withholding tax, the NHI premium): counts toward the total, not as cash. */
export const paymentWithheld = (p: Pick<Payment, "receipts" | "currency">) => receiptSum(p, (r) => r.withheld);

type Covered = Pick<Payment, "amount" | "taxRate" | "taxIncluded" | "currency" | "receipts">;

/** Total less what its active receipts cover (cash and withheld); never below zero. */
function uncovered(p: Covered) {
  const units = minorUnits(paymentTotal(p), p.currency) - minorUnits(paymentCash(p), p.currency) - minorUnits(paymentWithheld(p), p.currency);
  return Math.max(0, units) / minorUnitFactor(p.currency);
}

/** Still to come on an open payment: the total less what's arrived and been withheld. 0 once closed. */
export const paymentRemaining = (p: Covered & Pick<Payment, "status">) => (p.status === "expected" ? uncovered(p) : 0);

/** What a payment closed short by: the person said the rest won't come. 0 while it's open. */
export const paymentShort = (p: Covered & Pick<Payment, "status">) => (p.status === "settled" ? uncovered(p) : 0);

/**
 * A payment's status once its receipts or total change: settled when receipts cover it, or when
 * the person says the rest won't come (`rest`); otherwise open. A closed payment nothing has
 * arrived on is open again: one that won't be paid at all is cancelled, not settled.
 */
export function statusAfterReceipts(p: Covered, rest: "coming" | "closed"): "expected" | "settled" {
  if (uncovered(p) === 0) return "settled";
  return rest === "closed" && activeReceipts(p).length > 0 ? "settled" : "expected";
}

/** The tax-inclusive quote, or null while the fee isn't decided (quote not set). */
export const projectQuoteTotal = (p: Pick<Project, "quotedAmount" | "taxRate" | "taxIncluded" | "currency">) =>
  p.quotedAmount === null ? null : quote(p.quotedAmount, p.taxRate, p.taxIncluded, p.currency).total;

/**
 * Quoted vs. billed vs. received for one project, plus what still blocks
 * closing. `received` is cash from every receipt, `withheld` what payers kept
 * back (claimable), `pending` what's still to come on open payments, and
 * `shortfall` what payments closed short by (decision 0021).
 * Everything is in the project's currency; income in another currency can't
 * be compared with the quote yet, so it's totalled apart in `otherIncome`.
 */
export function projectSettlement(data: AppData, project: ProjectSummary) {
  const rows = data.payments.filter((p) => p.projectId === project.id && !p.voided && p.status !== "cancelled");
  const allIncome = rows.filter((p) => p.direction === "in");
  const income = allIncome.filter((p) => p.currency === project.currency);
  const units = (n: number) => minorUnits(n, project.currency);
  const factor = minorUnitFactor(project.currency);
  const sum = (list: Payment[], value: (p: Payment) => number) => list.reduce((n, p) => n + units(value(p)), 0);
  const quoteTotal = projectQuoteTotal(project);
  const quoted = units(quoteTotal ?? 0);
  const billed = sum(income, paymentTotal);
  return {
    quoted: quoteTotal === null ? null : quoted / factor,
    billed: billed / factor,
    received: sum(income, (p) => paymentCash(p)) / factor,
    withheld: sum(income, paymentWithheld) / factor,
    pending: sum(income, paymentRemaining) / factor,
    shortfall: sum(income, paymentShort) / factor,
    unbilled: quoteTotal === null ? 0 : (quoted - billed) / factor, // nothing to compare while the quote is unset
    otherIncome: totalsByCurrency(allIncome.filter((p) => p.currency !== project.currency), paymentTotal),
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
    quote: project && project.quotedAmount !== null ? words.quote(projectQuoteTotal(project)!, project.taxRate, project.currency) : "",
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

/**
 * Payments as totals, reminders, and matching count them (decision 0018): money still expected
 * counts only for signed work or no project, since a deal being negotiated may never happen;
 * money that moved always counts, whatever the deal's stage.
 */
export function countedPayments<P extends Pick<Payment, "status" | "projectId">>(payments: P[], projects: Pick<ProjectSummary, "id" | "stage">[]): P[] {
  const signed = new Set(projects.filter((p) => isSigned(p.stage)).map((p) => p.id));
  return payments.filter((p) => p.status !== "expected" || !p.projectId || signed.has(p.projectId));
}

/**
 * Cash-basis totals for one currency and a date range. Money that moved counts on each receipt's
 * own date, whatever the deal's stage (decision 0021); money still to come counts what's left, on
 * the day it was recorded, and only as countedPayments allows (decision 0018). `rows` is the ledger:
 * payments dated in the range, and any with a receipt in it.
 */
export function summarize(
  data: { payments: Payment[]; projects: Pick<ProjectSummary, "id" | "stage">[] },
  from = "",
  to = "9999-12-31",
  currency: Currency = "TWD",
) {
  const live = data.payments.filter((p) => p.currency === currency && !p.voided && p.status !== "cancelled");
  const counted = new Set(countedPayments(live, data.projects));
  const inRange = (p: Payment) => paymentDate(p) >= from && paymentDate(p) <= to;
  const cash = (p: Payment) => paymentCash(p, from, to);
  const rows = live.filter((p) => (counted.has(p) && inRange(p)) || cash(p) > 0);
  const open = rows.filter((p) => counted.has(p) && p.status === "expected" && inRange(p));
  const total = (list: Payment[], value: (p: Payment) => number) =>
    list.reduce((n, p) => n + minorUnits(value(p), currency), 0) / minorUnitFactor(currency);
  const income = live.filter((p) => p.direction === "in");
  return {
    rows,
    received: total(income, cash),
    receivable: total(open.filter((p) => p.direction === "in"), paymentRemaining),
    paid: total(live.filter((p) => p.direction === "out"), cash),
    payable: total(open.filter((p) => p.direction === "out"), paymentRemaining),
    split: projectTypes.map((t) => ({
      type: t.key,
      amount: total(income.filter((p) => p.projectType === t.key), cash),
    })),
  };
}

/** Signed and not finished: execution, or settlement still collecting. */
export const isSignedOpen = (p: ProjectSummary) => !p.archived && isSigned(p.stage) && p.stage !== "closed";
