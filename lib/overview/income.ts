// Received this month: money received this calendar month (talent's zone) next to last month's, cash basis.
import { summarize } from "@/lib/domain/workflow";
import type { AppData } from "@/lib/types";

const monthStart = (date: string, back = 0) => {
  const d = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - back);
  return d.toISOString().slice(0, 10);
};
const dayBefore = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export function monthIncome(data: Pick<AppData, "payments">, today: string) {
  const thisStart = monthStart(today);
  const lastStart = monthStart(today, 1);
  const received = (from: string, to: string) => summarize(data, from, to).received;
  return { thisMonth: received(thisStart, today), lastMonth: received(lastStart, dayBefore(thisStart)) };
}
