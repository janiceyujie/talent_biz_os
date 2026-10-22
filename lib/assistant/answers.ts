// The assistant's answers worked out in code, without a model (decision 0023):
// the quick prompts' schedule and money questions; and the shape of every answer. Pure functions over the
// same helpers the calendar and Today's money widget use, so the answers
// match those screens. The server fetches the rows (lib/assistant/data.ts).
import { planItems, plusDays, type PlanSource } from "@/lib/calendar/planner";
import { totalsByCurrency, type Currency } from "@/lib/domain/money";
import { countedPayments, paymentRemaining } from "@/lib/domain/workflow";
import type { CalendarKind, Payment, ProjectSummary } from "@/lib/types";

export const assistantIntents = ["today", "tomorrow", "receivable", "payable"] as const;
/** The longest question in the person's own words. */
export const QUESTION_MAX = 2000;
export type AssistantIntent = (typeof assistantIntents)[number];

/** Lines an answer lists; past it, it says how many more there are rather than dropping them silently. */
export const ANSWER_LINES = 30;

export type ScheduleLine = {
  start: string; // HH:mm in the talent's zone, "" when untimed
  end: string;
  title: string;
  kind: CalendarKind;
  project: string;
  amount: { value: number; currency: Currency } | null; // a payment due that day; negative when paid out
};
export type MoneyLine = { label: string; project: string; dueDate: string | null; amount: number; currency: Currency; overdue: boolean };
export type Totals = { currency: Currency; amount: number }[];

export type AssistantAnswer =
  | { kind: "text"; text: string } // the model's answer to a question in the person's own words, shown as plain text
  | { kind: "schedule"; date: string; timeZone: string; lines: ScheduleLine[]; more: number }
  | { kind: "money"; direction: "in" | "out"; today: string; totals: Totals; overdue: Totals; lines: MoneyLine[]; more: number };

/** The day an intent asks about: today or tomorrow in the talent's zone. */
export const dayOf = (intent: "today" | "tomorrow", today: string) => (intent === "today" ? today : plusDays(today, 1));

/** What's still to do on a day: the calendar's items for it, finished to-dos left out. */
export function scheduleAnswer(source: PlanSource, day: string): AssistantAnswer {
  const items = planItems(source).filter((i) => i.date === day && !i.done);
  return {
    kind: "schedule",
    date: day,
    timeZone: source.talent.timeZone,
    lines: items.slice(0, ANSWER_LINES).map((i) => ({ start: i.start, end: i.end, title: i.title, kind: i.kind, project: i.project, amount: i.amount })),
    more: Math.max(0, items.length - ANSWER_LINES),
  };
}

/**
 * Money still to come in (or still to pay out): what's left on each open payment, one total per
 * currency, as Today's money widget counts it (signed work only, decision 0018), earliest due first.
 */
export function moneyAnswer(
  payments: Payment[],
  projects: Pick<ProjectSummary, "id" | "title" | "stage">[],
  today: string,
  direction: "in" | "out",
): AssistantAnswer {
  const titleOf = new Map(projects.map((p) => [p.id, p.title]));
  const open = countedPayments(payments, projects)
    .filter((p) => !p.voided && p.status === "expected" && p.direction === direction && paymentRemaining(p) > 0)
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const late = (p: Payment) => !!p.dueDate && p.dueDate < today;
  return {
    kind: "money",
    direction,
    today,
    totals: totalsByCurrency(open, paymentRemaining),
    overdue: totalsByCurrency(open.filter(late), paymentRemaining),
    lines: open.slice(0, ANSWER_LINES).map((p) => ({
      label: p.label,
      project: (p.projectId && titleOf.get(p.projectId)) || "",
      dueDate: p.dueDate,
      amount: paymentRemaining(p),
      currency: p.currency,
      overdue: late(p),
    })),
    more: Math.max(0, open.length - ANSWER_LINES),
  };
}
