// Which expected payment a notice of money in may settle (decision 0013): the
// amount within a fee's difference below the expected total, then the payer's
// name as the tiebreaker. Only ever a suggestion: the person presses Mark as
// received. Pure, no server-only imports: the Intake screen runs it.
import { paymentBalance } from "@/lib/domain/payment-receipts";
import type { Payment } from "@/lib/types";
import type { NoticeFields } from "./fields";

/** A transfer fee taken out on the way: up to NT$30, or 1% of a larger payment. */
export const feeTolerance = (expected: number) => Math.max(30, expected * 0.01);

/** Remaining due, after recorded cash and confirmed withholding. */
export const expectedTotal = (p: Payment) => paymentBalance(p).remaining;

/** Payments a notice could settle: income still expected, in the notice's currency. */
export const openIncome = (payments: Payment[], currency: string) =>
  payments.filter((p) => p.direction === "in" && p.status === "expected" && !p.voided && p.currency === currency);

export type NoticeMatch = { payment: Payment; shortBy: number } | null;

/**
 * The one payment this notice most likely settles, or null when none is
 * close or the amount alone can't tell two apart and the payer's name doesn't
 * either. `namesFor` gives the names of a payment's project's people.
 */
export function matchNotice(notice: Pick<NoticeFields, "amount" | "currency" | "payer">, payments: Payment[], namesFor: (p: Payment) => string[]): NoticeMatch {
  const close = openIncome(payments, notice.currency)
    .map((payment) => ({ payment, shortBy: Math.round((expectedTotal(payment) - notice.amount) * 100) / 100 }))
    .filter((m) => m.shortBy >= 0 && m.shortBy <= feeTolerance(expectedTotal(m.payment)));
  if (close.length <= 1) return close[0] ?? null;
  const payer = (notice.payer ?? "").replace(/\s+/g, "").toLowerCase();
  const named = payer ? close.filter((m) => namesFor(m.payment).some((n) => namesMatch(payer, n))) : [];
  return named.length === 1 ? named[0] : null;
}

/**
 * Whether a payer as a bank shows it matches a name: banks cut names short
 * and mask a character ("Wang*ming"), so the visible characters must line up.
 */
export function namesMatch(payer: string, name: string) {
  const p = payer.replace(/\s+/g, "").toLowerCase();
  const n = name.replace(/\s+/g, "").toLowerCase();
  if (p.length < 2 || !n) return false;
  if (p.includes(n) || n.includes(p)) return true;
  const [pc, nc] = [[...p], [...n]];
  if (pc.length !== nc.length || !/[*＊○Ｏ]/.test(p)) return false;
  return pc.every((c, i) => /[*＊○Ｏ]/.test(c) || c === nc[i]);
}
