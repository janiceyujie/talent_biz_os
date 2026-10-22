// Received this month: money received this calendar month (talent's zone) next to last month's, cash basis, per currency.
import { supportedCurrencies, type Currency } from "@/lib/domain/money";
import { summarize } from "@/lib/domain/workflow";

const monthStart = (date: string, back = 0) => {
  const d = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - back);
  return d.toISOString().slice(0, 10);
};
const dayBefore = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export function monthIncome(data: Parameters<typeof summarize>[0], today: string) {
  const thisStart = monthStart(today);
  const lastStart = monthStart(today, 1);
  // One figure per currency that has any money in either month; TWD alone when none does.
  const received = (from: string, to: string, currency: Currency) => summarize(data, from, to, currency).received;
  const rows = supportedCurrencies.map((currency) => ({
    currency,
    thisMonth: received(thisStart, today, currency),
    lastMonth: received(lastStart, dayBefore(thisStart), currency),
  }));
  const moved = rows.filter((r) => r.thisMonth || r.lastMonth);
  return moved.length ? moved : rows.slice(0, 1);
}
