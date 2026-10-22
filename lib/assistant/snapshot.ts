// What the assistant's model reads (decision 0023): one bounded snapshot of the
// workspace or of one project, built in code from the rows the server fetched.
// Never original message text, contact details, bank details, or another
// talent's data. Every string is cleaned of invisible characters and checked
// for instructions aimed at an AI; what's found is reported by kind and place,
// for the ai_call log, never shown or sent back. Pure functions.
import type { PlanItem } from "@/lib/calendar/planner";
import { findInstructions, stripInvisible } from "@/lib/ai/safety";
import { totalsByCurrency } from "@/lib/domain/money";
import { paymentRemaining, paymentTotal } from "@/lib/domain/workflow";
import type { Contract, Payment, Project, ProjectSummary } from "@/lib/types";
import { moneyAnswer } from "./answers";

/** Lines per list; past it, the snapshot says how many were left out. */
export const SNAPSHOT_LINES = { projects: 30, schedule: 40, money: 20, payments: 20, events: 30, people: 20 } as const;
/** Days of the calendar an overview carries, today included. */
export const SCHEDULE_DAYS = 14;
const TEXT_MAX = 300; // a title, a name, a label
const DETAIL_MAX = 600; // one of a project's details
const NOTES_MAX = 1500;

const cut = (text: string | null | undefined, max = TEXT_MAX) => {
  const t = (text ?? "").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};
const capped = <T, U>(rows: T[], max: number, map: (row: T) => U) => ({ items: rows.slice(0, max).map(map), omitted: Math.max(0, rows.length - max) });

const scheduleLine = (i: PlanItem) => ({
  date: i.date,
  start: i.start,
  end: i.end,
  title: cut(i.title),
  kind: i.kind,
  project: cut(i.project),
  amount: i.amount,
});

type Common = { today: string; timeZone: string };

export type OverviewSource = Common & {
  payments: Payment[];
  projectNames: Pick<ProjectSummary, "id" | "title" | "stage">[];
  schedule: PlanItem[]; // the next SCHEDULE_DAYS days' items
  projects: ProjectSummary[]; // active, most recently updated first
  projectsTotal: number;
};

/** The workspace at a glance: money still open, what's coming, and the active projects. */
export function overviewSnapshot(s: OverviewSource) {
  const money = (direction: "in" | "out") => {
    const a = moneyAnswer(s.payments, s.projectNames, s.today, direction);
    if (a.kind !== "money") throw new Error("unreachable");
    const lines = capped(a.lines, SNAPSHOT_LINES.money, (l) => ({ ...l, label: cut(l.label), project: cut(l.project) }));
    return { totals: a.totals, overdue: a.overdue, payments: lines.items, omitted: a.more + lines.omitted };
  };
  const schedule = capped(
    s.schedule.filter((i) => !i.done),
    SNAPSHOT_LINES.schedule,
    scheduleLine,
  );
  const projects = capped(s.projects, SNAPSHOT_LINES.projects, (p) => ({
    title: cut(p.title),
    counterparty: cut(p.counterparty),
    stage: p.stage,
    nextStep: p.nextAction ? { title: cut(p.nextAction.title), due: p.nextAction.dueDate } : null,
  }));
  return {
    scope: "workspace overview",
    today: s.today,
    timeZone: s.timeZone,
    moneyToComeIn: money("in"),
    moneyToPay: money("out"),
    moneyNote: "Open payments on signed deals and payments with no project, as on Today: what's left to come or to pay, per currency.",
    schedule: { days: SCHEDULE_DAYS, items: schedule.items, omitted: schedule.omitted },
    activeProjects: { items: projects.items, omitted: Math.max(projects.omitted, s.projectsTotal - projects.items.length) },
    notIncluded: [
      "money already received or paid, and past totals (Finance has them)",
      "each project's details, notes, payments, and people (choose the project as the scope)",
      "archived and closed projects",
      "messages and their text",
      "contact details",
    ],
  };
}

export type ProjectSource = Common & {
  project: Project;
  payments: Payment[];
  schedule: PlanItem[]; // this project's items, from a while back to the future
  people: { name: string; label: string }[];
  organizations: { name: string; role: string; primary: boolean }[];
  contracts: Contract[]; // newest version first
};

/** One project: its confirmed details and notes, money, dates, people, and contract. */
export function projectSnapshot(s: ProjectSource) {
  const p = s.project;
  const d = p.details ?? {};
  const payments = capped(
    s.payments.filter((x) => !x.voided).sort((a, b) => (a.dueDate ?? a.recordedDate).localeCompare(b.dueDate ?? b.recordedDate)),
    SNAPSHOT_LINES.payments,
    (x) => ({
      label: cut(x.label),
      direction: x.direction,
      status: x.status,
      currency: x.currency,
      total: paymentTotal(x), // tax included
      remaining: paymentRemaining(x),
      due: x.dueDate,
      settled: x.settledDate,
    }),
  );
  const open = s.payments.filter((x) => !x.voided && x.status === "expected");
  const events = capped(s.schedule, SNAPSHOT_LINES.events, (i) => ({ ...scheduleLine(i), done: i.done }));
  const people = capped(s.people, SNAPSHOT_LINES.people, (x) => ({ name: cut(x.name), role: cut(x.label) }));
  const latest = s.contracts[0];
  return {
    scope: "one project",
    today: s.today,
    timeZone: s.timeZone,
    project: {
      title: cut(p.title),
      type: p.type,
      stage: p.stage,
      counterparty: cut(p.counterparty),
      // Tax in words, not a flag: a model reading "taxIncluded: false" tends to quote the flag back.
      quote:
        p.quotedAmount === null
          ? null
          : { amount: p.quotedAmount, currency: p.currency, tax: p.taxRate ? `${p.taxRate}% ${p.taxIncluded ? "included in the amount" : "added on top of the amount"}` : "none" },
      archived: p.archived,
      details: {
        deliverables: cut(d.deliverables, DETAIL_MAX),
        rights: cut(d.rights, DETAIL_MAX),
        travel: cut(d.travel, DETAIL_MAX),
        contractNotes: cut(d.contractNotes, DETAIL_MAX),
        fields: Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, cut(v, DETAIL_MAX)])),
        dates: (d.dates ?? []).slice(0, SNAPSHOT_LINES.events),
        toConfirm: (d.toConfirm ?? []).slice(0, SNAPSHOT_LINES.people).map((x) => cut(x)),
      },
      notes: cut(p.notes, NOTES_MAX),
    },
    money: {
      stillToComeIn: totalsByCurrency(open.filter((x) => x.direction === "in"), paymentRemaining),
      stillToPay: totalsByCurrency(open.filter((x) => x.direction === "out"), paymentRemaining),
      payments: payments.items,
      omitted: payments.omitted,
    },
    calendar: { items: events.items, omitted: events.omitted },
    people: { items: people.items, omitted: people.omitted },
    companies: s.organizations.slice(0, SNAPSHOT_LINES.people).map((o) => ({ name: cut(o.name), role: cut(o.role), primary: o.primary })),
    contract: latest ? { version: latest.version, status: latest.status, versions: s.contracts.length } : null,
    notIncluded: ["the messages filed under it and their text", "contact details", "other projects"],
  };
}

/**
 * Every string cleaned of invisible characters, and what was found where: "hidden_text:project.notes",
 * "instructions_to_ai:activeProjects.items[].title". Array positions are folded, so a flag names a field.
 */
export function cleanSnapshot<T>(snapshot: T): { snapshot: T; flags: string[] } {
  const flags = new Set<string>();
  const walk = (value: unknown, where: string): unknown => {
    if (typeof value === "string") {
      const visible = stripInvisible(value);
      if (visible.removed) flags.add(`hidden_text:${where}`);
      if (findInstructions(visible.text)) flags.add(`instructions_to_ai:${where}`);
      return visible.text;
    }
    if (Array.isArray(value)) return value.map((v) => walk(v, `${where}[]`));
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, where ? `${where}.${k}` : k)]));
    return value;
  };
  return { snapshot: walk(snapshot, "") as T, flags: [...flags].sort() };
}
