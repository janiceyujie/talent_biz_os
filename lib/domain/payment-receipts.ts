import { minorUnitFactor, minorUnits, quote } from "./money";

/** Append-only cash and confirmed withholding entries, persisted with their payment. */
export type PaymentReceipt = {
  id: string; date: string; cash: number; withheld: number;
  replacesId?:string|null; replaces?: string; withdrawn?: boolean; note?: string; recordedAt?: string; recordedBy?: string;
};
export type PaymentBalanceSource = {
  amount: number; taxRate: number; taxIncluded: boolean; currency: string;
  status: string; settledAmount?: number | null;
  settledOn?: string | null; settledDate?: string | null;
  receipts?: PaymentReceipt[];
};
export function receiptHistory(p: PaymentBalanceSource): PaymentReceipt[] {
  if (p.receipts?.length) return p.receipts.map(r=>(r.replacesId&&!r.replaces?{...r,replaces:r.replacesId}:r));
  // Preserve legacy cash without guessing that an unexplained difference was tax.
  if (p.status !== "settled") return [];
  return [{ id: "legacy", date: p.settledDate ?? p.settledOn ?? "", cash: p.settledAmount ?? quote(p.amount, p.taxRate, p.taxIncluded, p.currency).total, withheld: 0 }];
}
/** Keep the audit trail, but count only the latest non-withdrawn version of each receipt. */
export function activeReceipts(p: PaymentBalanceSource): PaymentReceipt[] {
  const history = receiptHistory(p);
  const replaced = new Set(history.flatMap(r => r.replaces ? [r.replaces] : []));
  return history.filter(r => !r.withdrawn && !replaced.has(r.id));
}
export function paymentBalance(p: PaymentBalanceSource) {
  const factor = minorUnitFactor(p.currency);
  const receipts = activeReceipts(p);
  const total = minorUnits(quote(p.amount, p.taxRate, p.taxIncluded, p.currency).total, p.currency);
  const cash = receipts.reduce((n, r) => n + minorUnits(r.cash, p.currency), 0);
  const withheld = receipts.reduce((n, r) => n + minorUnits(r.withheld, p.currency), 0);
  return { cash: cash / factor, withheld: withheld / factor, remaining: p.status === "cancelled" ? 0 : Math.max(0, total - cash - withheld) / factor };
}
export function cashInRange(p: PaymentBalanceSource, from = "", to = "9999-12-31") {
  return activeReceipts(p).filter(r => r.date >= from && r.date <= to)
    .reduce((n, r) => n + minorUnits(r.cash, p.currency), 0) / minorUnitFactor(p.currency);
}
export class ReceiptError extends Error {
  constructor(public code: "receiptReasonRequired" | "receiptChanged" | "receiptInvalid" | "receiptLocked" | "withholdingInvalid") { super(code); }
}
/** Call only under the payment's database row lock. A stable ID makes retries safe. */
export function appendReceipt(p: PaymentBalanceSource, input: { id: string; date: string; cash: number; withheld?: number; reason?: string; revision?: number; recordedAt?: string; recordedBy?: string }) {
  const factor = minorUnitFactor(p.currency);
  const withheldAmount = input.withheld ?? 0;
  const withheld = minorUnits(withheldAmount, p.currency);
  if (!Number.isFinite(withheldAmount) || withheldAmount < 0 || withheld / factor !== withheldAmount ||
      (input.reason === "withholding" ? withheld <= 0 : withheld !== 0)) throw new ReceiptError("withholdingInvalid");
  const previous = receiptHistory(p);
  const duplicate = previous.find(r => r.id === input.id);
  if (duplicate) {
    if (duplicate.replaces || duplicate.date !== input.date || duplicate.cash !== input.cash || duplicate.withheld !== withheldAmount) throw new ReceiptError("receiptChanged");
    return receiptValues(p, previous);
  }
  if (input.revision !== undefined && previous.length !== input.revision) throw new ReceiptError("receiptChanged");
  const cash = minorUnits(input.cash, p.currency);
  const remaining = minorUnits(paymentBalance(p).remaining, p.currency);
  if (p.status === "cancelled" || remaining <= 0 || !Number.isFinite(input.cash) || input.cash < 0 || cash / factor !== input.cash) throw new ReceiptError("receiptInvalid");
  const gap = Math.max(0, remaining - cash);
  if (gap && !["unpaid", "withholding"].includes(input.reason ?? "")) throw new ReceiptError("receiptReasonRequired");
  if (withheld > gap) throw new ReceiptError("withholdingInvalid");
  if (cash + withheld <= 0) throw new ReceiptError("receiptInvalid");
  return receiptValues(p, [...previous, { id: input.id, date: input.date, cash: cash / factor, withheld: withheld / factor, ...(input.recordedAt ? {recordedAt:input.recordedAt} : {}), ...(input.recordedBy ? {recordedBy:input.recordedBy} : {}) }]);
}
function receiptValues(p: PaymentBalanceSource, receipts: PaymentReceipt[]) {
  const balance = paymentBalance({ ...p, receipts });
  return { receipts, settledAmount: balance.cash, status: balance.remaining > 0 ? "expected" as const : "settled" as const,
    settledOn: balance.remaining > 0 ? null : activeReceipts({ ...p, receipts }).map(r => r.date).sort().at(-1)! };
}

export type ReceiptAmendment = {
  id: string; targetId: string; revision: number; operation: "correct" | "withdraw";
  date: string; cash: number; withheld: number; note: string; recordedAt: string; recordedBy: string;
};
/** Append an audited replacement; never edit or remove the original cash record. */
export function amendReceipt(p: PaymentBalanceSource, input: ReceiptAmendment) {
  const history = receiptHistory(p);
  const target = history.find(r => r.id === input.targetId);
  if (!target || p.status === "cancelled") throw new ReceiptError("receiptChanged");
  const next: PaymentReceipt = {
    id: input.id, replaces: target.id, withdrawn: input.operation === "withdraw",
    date: input.operation === "withdraw" ? target.date : input.date,
    cash: input.operation === "withdraw" ? 0 : input.cash,
    withheld: input.operation === "withdraw" ? 0 : input.withheld,
    note: input.note.trim(), recordedAt: input.recordedAt, recordedBy: input.recordedBy,
  };
  if (!next.note || next.note.length > 500) throw new ReceiptError("receiptInvalid");
  const duplicate = history.find(r => r.id === input.id);
  if (duplicate) {
    if ((["replaces", "withdrawn", "date", "cash", "withheld", "note", "recordedBy"] as const).some(k => duplicate[k] !== next[k])) throw new ReceiptError("receiptChanged");
    return receiptValues(p, history);
  }
  if (history.length !== input.revision || !activeReceipts(p).some(r => r.id === target.id)) throw new ReceiptError("receiptChanged");
  const factor = minorUnitFactor(p.currency);
  if (![next.cash, next.withheld].every(n => Number.isFinite(n) && n >= 0 && n <= 9_999_999_999.99 && minorUnits(n, p.currency) / factor === n)) throw new ReceiptError("receiptInvalid");
  if (!next.withdrawn && next.cash + next.withheld <= 0) throw new ReceiptError("receiptInvalid");
  const receipts = [...history, next];
  const totals = paymentBalance({ ...p, receipts });
  const gross = quote(p.amount, p.taxRate, p.taxIncluded, p.currency).total;
  // Cash overpayments remain allowed, but withholding cannot exceed the non-cash part of the bill.
  if (minorUnits(totals.withheld, p.currency) > Math.max(0, minorUnits(gross, p.currency) - minorUnits(totals.cash, p.currency))) throw new ReceiptError("withholdingInvalid");
  return receiptValues(p, receipts);
}

/** Compare each change with the entry it actually replaces, in exact currency units. */
export function receiptAudit(p: PaymentBalanceSource) {
  const history = receiptHistory(p);
  const byId = new Map(history.map(row => [row.id, row]));
  const successors = new Map(history.filter(row => row.replaces).map(row => [row.replaces!, row]));
  const factor = minorUnitFactor(p.currency);
  return history.map(row => {
    const previous = row.replaces ? byId.get(row.replaces) : undefined;
    const successor = successors.get(row.id);
    return {row, previous, successor, active: !row.withdrawn && !successor,
      cashDelta: previous ? (minorUnits(row.cash, p.currency) - minorUnits(previous.cash, p.currency)) / factor : null,
      withheldDelta: previous ? (minorUnits(row.withheld, p.currency) - minorUnits(previous.withheld, p.currency)) / factor : null};
  }).reverse();
}
