// Finance and partner reports over AppData. TWD only for the MVP, like every
// other summary. Pure functions; run anywhere.
import type { AppData, Organization, Payment, ProjectSummary } from "@/lib/types";
import { dateInZone } from "./dates";
import { minorUnits } from "./money";
import { isSigned } from "./phases";
import { paymentCash, paymentTotal, projectQuoteTotal } from "./workflow";

const units = (n: number) => minorUnits(n, "TWD");
const live = (p: Payment) => !p.voided && p.status !== "cancelled";

/** Whole days from one local date to another. */
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

export const agingBuckets = ["notDue", "late1to30", "late31plus", "noDueDate"] as const;

/**
 * Contract totals for live signed projects (not tied to a date range: a
 * contract isn't income), outstanding income by age, and six months of cash
 * actually moved.
 */
export function financeInsights(data: AppData, now = new Date()) {
  const today = dateInZone(data.talent.timeZone, 0, now);
  const payments = data.payments.filter(live);
  const signed = data.projects.filter((p) => !p.archived && isSigned(p.stage));
  const quoted = signed.filter((p) => p.quotedAmount !== null);
  const billedFor = (p: ProjectSummary) =>
    payments.filter((x) => x.projectId === p.id && x.direction === "in").reduce((n, x) => n + units(paymentTotal(x)), 0);
  const contracted = quoted.reduce((n, p) => n + units(projectQuoteTotal(p)!), 0);
  const unbilled = quoted.reduce((n, p) => n + Math.max(0, units(projectQuoteTotal(p)!) - billedFor(p)), 0);

  const aging = Object.fromEntries(agingBuckets.map((b) => [b, 0])) as Record<(typeof agingBuckets)[number], number>;
  for (const p of payments.filter((x) => x.direction === "in" && x.status === "expected")) {
    const late = p.dueDate ? daysBetween(p.dueDate, today) : null;
    const bucket = late === null ? "noDueDate" : late <= 0 ? "notDue" : late <= 30 ? "late1to30" : "late31plus";
    aging[bucket] += units(paymentTotal(p));
  }

  const monthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 5 + i);
    const month = d.toISOString().slice(0, 7);
    const cash = (direction: Payment["direction"]) =>
      payments
        .filter((x) => x.direction === direction && x.status === "settled" && (x.settledDate ?? "").startsWith(month))
        .reduce((n, x) => n + units(paymentCash(x)), 0) / 100;
    return { month, received: cash("in"), paid: cash("out") };
  });

  return {
    contracted: contracted / 100,
    unbilled: unbilled / 100,
    unknownQuotes: signed.length - quoted.length,
    aging: agingBuckets.map((bucket) => ({ bucket, amount: aging[bucket] / 100 })),
    monthly,
  };
}

export const evidenceLevels = ["tooFew", "manyLate", "allOnTime", "someLate"] as const;

/**
 * Per organisation (decision 0012): the signed projects it's the client of
 * (archived ones too — they're history) and how their income payments arrived
 * against their due dates. A record of what happened, not a credit score.
 * Only projects linked to the organisation count: the same name never implies
 * the same organisation. Organisations that were never a client of signed work
 * (an agency, a venue) have nothing to show and aren't listed.
 */
export function partnerInsights(data: AppData, now = new Date()) {
  const today = dateInZone(data.talent.timeZone, 0, now);
  return data.organizations
    .filter((o) => !o.archived)
    .map((organization: Organization) => {
      const projects = data.projects.filter((p) => isSigned(p.stage) && p.clientId === organization.id);
      const titles = new Map(projects.map((p) => [p.id, p.title]));
      const rows = data.payments
        .filter((x) => live(x) && x.direction === "in" && x.projectId && titles.has(x.projectId) && x.amount > 0)
        .map((x) => ({
          ...x,
          projectTitle: titles.get(x.projectId!)!,
          total: paymentTotal(x),
          lateDays: x.dueDate
            ? Math.max(0, daysBetween(x.dueDate, x.status === "settled" ? (x.settledDate ?? today) : today))
            : null,
        }))
        .sort((a, b) => (b.dueDate ?? b.recordedDate).localeCompare(a.dueDate ?? a.recordedDate));
      const paid = rows.filter((x) => x.status === "settled" && x.dueDate && x.settledDate);
      const late = paid.filter((x) => x.lateDays! > 0);
      const overdue = rows.filter((x) => x.status === "expected" && x.dueDate && x.dueDate < today);
      return {
        organization,
        projects,
        rows,
        paidCount: paid.length,
        lateCount: late.length,
        onTimeRate: paid.length ? Math.round(((paid.length - late.length) / paid.length) * 100) : null,
        averageLateDays: late.length ? Math.round(late.reduce((n, x) => n + x.lateDays!, 0) / late.length) : 0,
        overdueCount: overdue.length,
        overdueAmount: overdue.reduce((n, x) => n + units(x.total), 0) / 100,
        unknownDue: rows.filter((x) => !x.dueDate).length,
        evidence: (paid.length < 3
          ? "tooFew"
          : late.length >= 3
            ? "manyLate"
            : late.length === 0
              ? "allOnTime"
              : "someLate") as (typeof evidenceLevels)[number],
      };
    })
    .filter((r) => r.projects.length > 0)
    .sort((a, b) => b.overdueAmount - a.overdueAmount || b.projects.length - a.projects.length);
}
