// Money: money still expected, at a glance — what's overdue, due this week, and outstanding in total.
import { plusDays } from "@/lib/calendar/planner";
import { paymentTotal } from "@/lib/domain/workflow";
import type { Payment } from "@/lib/types";

export const MONEY_WEEK_DAYS = 7; // "this week": today and the six days after

export function outstandingMoney(payments: Payment[], today: string) {
  const open = payments.filter((p) => !p.voided && p.status === "expected");
  const incoming = open.filter((p) => p.direction === "in");
  const weekEnd = plusDays(today, MONEY_WEEK_DAYS - 1);
  const total = (rows: Payment[]) => rows.reduce((n, p) => n + paymentTotal(p), 0);
  return {
    overdue: total(incoming.filter((p) => p.dueDate && p.dueDate < today)),
    thisWeek: total(incoming.filter((p) => p.dueDate && p.dueDate >= today && p.dueDate <= weekEnd)),
    toReceive: total(incoming),
    toPay: total(open.filter((p) => p.direction === "out")),
  };
}
