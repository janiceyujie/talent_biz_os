import { quote, minorUnitFactor, minorUnits } from "./money";
import { paymentBalance, receiptHistory, type PaymentBalanceSource } from "./payment-receipts";

/** A typo correction must not round amounts, change tax, or change outstanding debt. */
export function currencyCorrectionPreservesAmounts(p: PaymentBalanceSource, to: string) {
  const numbers = [p.amount, p.settledAmount, ...receiptHistory(p).flatMap(r => [r.cash, r.withheld])].filter((n): n is number => n !== null);
  if (numbers.some(n => minorUnits(n, to) / minorUnitFactor(to) !== n)) return false;
  const before = quote(p.amount, p.taxRate, p.taxIncluded, p.currency);
  const after = quote(p.amount, p.taxRate, p.taxIncluded, to);
  const balanceBefore = paymentBalance(p), balanceAfter = paymentBalance({...p, currency: to});
  return before.net === after.net && before.tax === after.tax && before.total === after.total &&
    balanceBefore.cash === balanceAfter.cash && balanceBefore.withheld === balanceAfter.withheld && balanceBefore.remaining === balanceAfter.remaining;
}
