// Project workflow rules: settlement, reply templates, summaries, notifications.
// Pure functions over AppData so they run on the server or in the browser.
import { cashInRange, paymentBalance, activeReceipts } from "./payment-receipts";
import { projectTypes } from "@/lib/project-types";
import { contentWords, displayName, placeholderKey, type PlaceholderKey } from "@/lib/templates/placeholders";
import type { AppData, Payment, Project, ProjectSummary, ReplyTemplate } from "@/lib/types";
import { isSigned } from "./phases";
import { minorUnitFactor, minorUnits, quote } from "./money";

export const paymentTotal = (p: Pick<Payment, "amount" | "taxRate" | "taxIncluded" | "currency">) =>
  quote(p.amount, p.taxRate, p.taxIncluded, p.currency).total;

/** Cash that actually moved, including partial receipts; withholding is excluded. */
export const paymentCash = (p: Payment) => paymentBalance(p).cash;
export const paymentRemaining = (p: Payment) => paymentBalance(p).remaining;
export const paymentWithheld = (p: Payment) => paymentBalance(p).withheld;

/** The tax-inclusive quote, or null while the fee isn't decided (quote not set). */
export const projectQuoteTotal = (p: Pick<Project, "quotedAmount" | "taxRate" | "taxIncluded" | "currency">) =>
  p.quotedAmount === null ? null : quote(p.quotedAmount, p.taxRate, p.taxIncluded, p.currency).total;

/**
 * Quoted vs. billed vs. received for one project, plus what still blocks
 * closing. Unpaid differences remain pending; confirmed withholding is separate
 * from both pending balances and cash received.
 */
export function projectSettlement(data: AppData, project: ProjectSummary) {
  const rows = data.payments.filter((p) => p.projectId === project.id && !p.voided && p.status !== "cancelled");
  // Compare income with the quote in its own currency; costs retain their original currency.
  const income = rows.filter((p) => p.direction === "in" && p.currency === project.currency);
  const units = (n: number) => minorUnits(n, project.currency);
  const factor = minorUnitFactor(project.currency);
  const sum = (list: Payment[], value: (p: Payment) => number) => list.reduce((n, p) => n + units(value(p)), 0);

  const quoteTotal = projectQuoteTotal(project);
  const quoted = units(quoteTotal ?? 0);
  const billed = sum(income, paymentTotal);
  const received = sum(income, paymentCash);
  return {
    quoted: quoteTotal === null ? null : quoted / factor,
    billed: billed / factor,
    received: received / factor,
    pending: sum(income, paymentRemaining) / factor,
    withheld: sum(income, paymentWithheld) / factor,
    shortfall: 0, // Unpaid differences are already included in pending; withholding is separate.
    unbilled: quoteTotal === null ? 0 : (quoted - billed) / factor, // nothing to compare while the quote is unset
    openItems: data.calendar.filter((c) => c.projectId === project.id && c.source === "todo" && !c.archived && !c.done),
    unpaidCosts: rows.filter((p) => p.direction === "out" && paymentRemaining(p) > 0),
  };
}

/** Financial handoff only: the confirmation dialog still reviews unfinished work. */
export function canReviewProjectClosure(data: AppData, project: ProjectSummary) {
  if (project.archived || project.stage !== "collecting_payment") return false;
  const settlement = projectSettlement(data, project);
  // Check every currency: an unpaid foreign-currency cost must also block the handoff.
  const unpaid = data.payments.some(p => p.projectId === project.id && !p.voided && paymentRemaining(p) > 0);
  return !unpaid && settlement.quoted !== null && settlement.billed > 0 &&
    settlement.unbilled === 0 && settlement.received + settlement.withheld > 0;
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
    quote: project && project.quotedAmount !== null ? words.quote(projectQuoteTotal(project)!, project.taxRate) : "",
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

/** Cash-basis totals by receipt date, with outstanding balances grouped by recorded date. */
export function summarize(data: Pick<AppData, "payments">, from = "", to = "9999-12-31", currency: Payment["currency"] = "TWD") {
  const live = data.payments.filter(p => p.currency === currency && !p.voided && p.status !== "cancelled");
  const inRange = (date: string) => date >= from && date <= to;
  const rows = live.filter(p => inRange(p.recordedDate) || activeReceipts(p).some(r => inRange(r.date)));
  const sum = (direction: Payment["direction"], cash: boolean, type?: Payment["projectType"]) => rows
    .filter(p => p.direction === direction && (!type || p.projectType === type))
    .reduce((n, p) => n + minorUnits(cash ? cashInRange(p, from, to) : inRange(p.recordedDate) ? paymentRemaining(p) : 0, currency), 0) / minorUnitFactor(currency);
  return { rows, received: sum("in", true), receivable: sum("in", false), paid: sum("out", true), payable: sum("out", false),
    split: projectTypes.map(t => ({ type: t.key, amount: sum("in", true, t.key) })) };

}

/** Signed and not finished: execution, or settlement still collecting. */
export const isSignedOpen = (p: ProjectSummary) => !p.archived && isSigned(p.stage) && p.stage !== "closed";
