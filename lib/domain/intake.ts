// From intake to project: which project a message belongs to, and what it would
// change there. Pure functions over the analysis and the talent's records —
// the AI only extracted the facts; these rules decide what to propose, and the
// person confirms every item. See docs/design/intake-to-project.md.
import type { MessageAnalysis } from "@/lib/ai/analysis";
import { projectType } from "@/lib/project-types";
import type { CalendarItem, Contact, Contract, ContractTerms, Payment, Project, ProjectDate, ProjectSummary, ProjectDetails, Stage, TermChange } from "@/lib/types";
import { isSigned } from "./phases";
import { paymentTotal } from "./workflow";

export type IntakeContext = {
  projects: ProjectSummary[];
  contacts: Contact[];
  payments: Payment[];
  calendar: CalendarItem[];
  /** The day the message arrived, YYYY-MM-DD in the talent's time zone. */
  receivedOn: string;
  /** The person's default for answering a message with no stated reply-by date. */
  replyWithinDays: number;
  /** Messages already filed on projects: who sent them and the dates they gave. */
  filed: FiledMessage[];
  contracts: Contract[];
};

export type FiledMessage = {
  projectId: string;
  counterparty: { name: string; company: string; email: string };
  dates: ProjectDate[];
};

/** The filed messages among a list of messages, for matching later ones to their projects. */
export function filedMessages(
  messages: { id: string; projectId: string | null; status: string; analysis: Pick<MessageAnalysis, "counterparty" | "dates"> | null }[],
  except = "",
): FiledMessage[] {
  return messages.flatMap((m) =>
    m.projectId && m.status === "confirmed" && m.analysis && m.id !== except
      ? [{ projectId: m.projectId, counterparty: m.analysis.counterparty, dates: m.analysis.dates.filter((d) => d.date).map((d) => ({ what: d.what, date: d.date, time: d.time, timeZone: d.timeZone })) }]
      : [],
  );
}

// ---------------------------------------------------------------------------
// Target: which project is this?

export type TargetReason =
  | { kind: "contact"; value: string } // same email, company, or name
  | { kind: "earlier"; value: string } // an earlier message from the same sender is filed on the project
  | { kind: "date"; value: string } // a date the project already has
  | { kind: "detail"; value: string } // same venue, event, brand, campaign…
  | { kind: "title"; value: string }
  | { kind: "payment"; value: number }; // the total of an expected payment the amount matches

export type TargetSuggestion = { projectId: string; score: number; reasons: TargetReason[] };

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => !!a && !!b && norm(a) === norm(b);
/** One contains the other, for names like "Blue Room" vs. "The Blue Room Taipei". */
const overlaps = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x));
};

/** Pieces of a title to compare: words, and pairs of characters for text without spaces. */
function titleGrams(s: string) {
  const grams = new Set<string>();
  for (const word of norm(s).split(/[\s\p{P}\p{S}]+/u).filter(Boolean)) {
    if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+$/u.test(word))
      for (let i = 0; i < word.length - 1; i++) grams.add(word.slice(i, i + 2));
    else if (word.length > 1 && !/^\d+$/.test(word)) grams.add(word);
  }
  return grams;
}
const titleSimilarity = (a: string, b: string) => {
  const x = titleGrams(a);
  const y = titleGrams(b);
  if (!x.size || !y.size) return 0;
  const shared = [...x].filter((g) => y.has(g)).length;
  return shared / Math.min(x.size, y.size);
};

/** Fields that name the deal's place or occasion; a match is a good sign it's the same project. */
export const identifyingFields = ["venue", "eventName", "brand", "campaign", "product", "work"];

/** A project's dates: the ones kept on it, plus its calendar events. */
function datesOf(project: ProjectSummary, calendar: CalendarItem[]) {
  return [
    ...(project.details.dates ?? []).map((d) => d.date),
    ...calendar.filter((c) => c.projectId === project.id && c.source === "event" && !c.archived).map((c) => c.date),
  ];
}

const ended = (stage: Stage) => stage === "declined" || stage === "cancelled" || stage === "closed";

/**
 * Live projects ranked by how likely the message is about them, with reasons.
 * Only projects with a real signal (more than a similar title) are returned;
 * an empty list means "probably a new project". Always a suggestion.
 */
export function suggestTargets(a: MessageAnalysis, ctx: IntakeContext): TargetSuggestion[] {
  const who = a.counterparty;
  const out: TargetSuggestion[] = [];
  for (const project of ctx.projects) {
    if (project.archived) continue;
    const reasons: TargetReason[] = [];
    let score = 0;

    const contact = ctx.contacts.find((c) => c.id === project.counterpartyId);
    if (contact && same(contact.email, who.email)) {
      score += 5;
      reasons.push({ kind: "contact", value: contact.email });
    } else {
      const names = [project.counterparty, contact?.name ?? "", contact?.company ?? ""];
      const hit = [who.company, who.name].find((n) => names.some((m) => same(m, n) || (n.length >= 4 && overlaps(m, n))));
      if (hit) {
        score += 3;
        reasons.push({ kind: "contact", value: hit });
      }
    }

    // Messages already filed here: the same sender is as good a sign as a linked contact.
    const earlier = ctx.filed.filter((f) => f.projectId === project.id);
    if (!reasons.length) {
      const byEmail = earlier.find((f) => same(f.counterparty.email, who.email));
      const byName = [who.company, who.name].find((n) =>
        earlier.some((f) => [f.counterparty.company, f.counterparty.name].some((m) => same(m, n) || (n.length >= 4 && overlaps(m, n)))),
      );
      if (byEmail) {
        score += 5;
        reasons.push({ kind: "earlier", value: who.email });
      } else if (byName) {
        score += 3;
        reasons.push({ kind: "earlier", value: byName });
      }
    }

    const projectDates = new Set([...datesOf(project, ctx.calendar), ...earlier.flatMap((f) => f.dates.map((d) => d.date))]);
    const date = a.dates.find((d) => d.date && projectDates.has(d.date));
    if (date) {
      score += 3;
      reasons.push({ kind: "date", value: date.date });
    }

    for (const key of identifyingFields) {
      const theirs = a.details[key]?.value ?? "";
      const ours = projectField(project, key);
      if (theirs && ours && overlaps(theirs, ours)) {
        score += 2;
        reasons.push({ kind: "detail", value: ours });
        break;
      }
    }

    if (a.intent === "payment") {
      const amount = statedAmount(a);
      const match = amount ? expectedIncome(project, ctx.payments).find((p) => near(paymentTotal(p), amount)) : undefined;
      if (match) {
        score += 2;
        reasons.push({ kind: "payment", value: paymentTotal(match) });
      }
    }

    if (titleSimilarity(a.title, project.title) >= 0.5) {
      score += 1;
      reasons.push({ kind: "title", value: project.title });
    }

    // A finished project still takes a late payment notice, but rarely anything else.
    if (ended(project.stage) && a.intent !== "payment") score -= 2;
    if (score >= 3) out.push({ projectId: project.id, score, reasons });
  }
  return out.sort((x, y) => y.score - x.score);
}

// ---------------------------------------------------------------------------
// Project fields: where a registry field lives on a project.

/** Registry fields with their own home on the project (the form edits these). */
const homes: Record<string, "deliverables" | "rights" | "travel"> = {
  deliverables: "deliverables",
  usageRights: "rights",
  travel: "travel",
};

export function projectField(project: Pick<Project, "details">, key: string) {
  const home = homes[key];
  return (home ? project.details[home] : project.details.fields?.[key]) ?? "";
}

/** Details with one registry field set, in its home. */
export function withField(details: ProjectDetails, key: string, value: string): ProjectDetails {
  const home = homes[key];
  return home ? { ...details, [home]: value } : { ...details, fields: { ...details.fields, [key]: value } };
}

/** The fields a project of this type keeps: its registry fields. Intent fields (proposedChanges…) are about the message, not the deal. */
export const keptFields = (type: string): string[] => projectType(type).extraction.fields.map((f) => f.key);

// ---------------------------------------------------------------------------
// Changes: what the message would change on an existing project.

type Base = {
  /** Stable within one proposal; the review screen keys ticks and edits by it. */
  id: string;
  /** Pre-ticked. A tick applies the value as the person edited it. */
  ticked: boolean;
  /** The exact words it came from. */
  asStated: string;
};

export type TodoPurpose = "reply" | "awaitContract" | "sendInvoice";

export type Change = Base &
  (
    | { kind: "fee"; from: number | null; to: number; taxIncluded: boolean | null }
    | { kind: "field"; key: string; from: string; to: string }
    | { kind: "contractNotes"; from: string; to: string }
    /**
     * A changed or new date. `eventId` when it moves a calendar event; otherwise kept on the project
     * (`index` when replacing one). `asEvent`: becomes a calendar event, for a signed project.
     */
    | {
        kind: "date";
        from: ProjectDate | null;
        to: ProjectDate;
        eventId: string | null;
        index: number | null;
        asEvent: boolean;
        /** `from` was given by an earlier message on the project, not kept on it; applying adds the date. */
        earlier: boolean;
      }
    | { kind: "stage"; from: Stage; to: Stage }
    /** Mark an expected payment received; the shortfall is often withheld tax. */
    | { kind: "settlePayment"; paymentId: string; expected: number; amount: number; settledOn: string; invoiceRef: string }
    /** No expected payment matches: offer to record it instead of guessing. */
    | { kind: "newPayment"; label: "received" | "cancellationFee"; amount: number; settled: boolean; date: string }
    | { kind: "paymentNote"; paymentId: string; note: string }
    | { kind: "todo"; purpose: TodoPurpose; dueDate: string }
    | { kind: "toConfirm"; items: string[] }
    /**
     * A new contract version: its terms, and how they differ from the previous version (or, for
     * the first, where they conflict with the project's agreed terms). `same`: nothing differs from
     * the previous version — likely a duplicate, so it starts unticked.
     */
    | {
        kind: "contractVersion";
        version: number;
        status: "received" | "signed";
        terms: ContractTerms;
        diff: TermChange[];
        against: "version" | "project";
        supersedesId: string | null;
        same: boolean;
      }
  );

/** An item as recorded in the audit log and shown on the project timeline: what was (or would have been) changed. */
export type ChangeRecord = Change;

/**
 * A judgment call the person answers rather than ticks: a confirmation with no
 * contract doesn't move the stage by itself (many gigs never have one).
 * Choosing `signed` adds `ifSigned` to the proposal.
 */
export type StageQuestion = { from: Stage; choices: [Stage, Stage]; ifSigned: Change[] };

export type Proposal = { changes: Change[]; question: StageQuestion | null };

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** A plain amount from text like "NT$19,950" or "19,950" followed by the Chinese word for dollars; null if there isn't exactly one number. */
export function parseAmount(text: string) {
  const numbers = norm(text).match(/\d[\d,]*(\.\d+)?/g) ?? [];
  if (numbers.length !== 1) return null;
  const n = Number(numbers[0].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The amount the message is about: the payment field, else the fee (TWD only, the MVP's currency). */
function statedAmount(a: MessageAnalysis) {
  const due = parseAmount(a.details.amountDue?.value ?? "");
  if (due) return due;
  return a.money.amount !== null && (a.money.currency === "TWD" || !a.money.currency) ? a.money.amount : null;
}

const near = (expected: number, amount: number) => amount <= expected && amount >= expected * 0.85;

const expectedIncome = (project: Pick<Project, "id">, payments: Payment[]) =>
  payments.filter((p) => p.projectId === project.id && p.direction === "in" && p.status === "expected" && !p.voided);

/** Words in the message that mean a contract is coming. A hint for a to-do the person ticks, not a fact. */
const promisesContract = (a: MessageAnalysis) =>
  /合約|合同|契約|contract|agreement/i.test(
    [a.summary, a.details.confirmedTerms?.value ?? "", ...a.asks, a.paymentTerms].join(" "),
  );

const statusIs = (a: MessageAnalysis, pattern: RegExp) => pattern.test(a.details.paymentStatus?.value ?? "");

/** Dates the message mentions, compared with the project's. */
function dateChanges(a: MessageAnalysis, project: Project, ctx: IntakeContext, ticked: boolean, postponed = false): Change[] {
  const signed = isSigned(project.stage);
  const kept = project.details.dates ?? [];
  const events = ctx.calendar.filter((c) => c.projectId === project.id && c.source === "event" && !c.archived);
  type Known = { date: ProjectDate; eventId: string | null; index: number | null; earlier: boolean };
  const onProject: Known[] = [
    ...events.map((e) => ({ date: { what: e.title, date: e.date, time: e.time, timeZone: e.timeZone }, eventId: e.id, index: null, earlier: false })),
    ...kept.map((d, index) => ({ date: d, eventId: null, index, earlier: false })),
  ];
  // Dates that earlier messages on this project gave but the project doesn't keep (e.g. it predates kept dates).
  const fromMessages: Known[] = ctx.filed
    .filter((f) => f.projectId === project.id)
    .flatMap((f) => f.dates)
    .filter((d, i, all) => !onProject.some((e) => e.date.date === d.date) && all.findIndex((x) => x.date === d.date && x.time === d.time) === i)
    .map((d) => ({ date: d, eventId: null, index: null, earlier: true }));
  const existing = [...onProject, ...fromMessages];
  const deadline = a.replyBy;
  const out: Change[] = [];
  const stated = a.dates.filter((d) => d.date && !(d.date === deadline && !d.time));
  stated.forEach((d, i) => {
    const to: ProjectDate = { what: d.what, date: d.date, time: d.time, timeZone: d.timeZone };
    if (onProject.some((e) => e.date.date === to.date && (!to.time || e.date.time === to.time))) return; // already there
    // The same occasion, or the same day at a set time, is a change; anything else is a new date
    // (a rehearsal shouldn't move the show). A postponement moves the one date there is.
    const match =
      existing.find((e) => overlaps(e.date.what, to.what)) ??
      existing.find((e) => e.date.date === to.date) ??
      (postponed && existing.length === 1 && stated.length === 1 ? existing[0] : undefined);
    out.push({
      id: `date:${i}`,
      kind: "date",
      ticked,
      asStated: d.asStated,
      from: match?.date ?? null,
      to: { ...to, what: match?.date.what || to.what },
      eventId: match?.eventId ?? null,
      index: match?.index ?? null,
      asEvent: signed && !match?.eventId,
      earlier: match?.earlier ?? false,
    });
  });
  return out;
}

function feeChange(a: MessageAnalysis, project: Project, ticked: boolean): Change[] {
  const amount = a.money.amount;
  if (amount === null || (a.money.currency && a.money.currency !== "TWD")) return [];
  const taxSame = a.money.taxIncluded === null || a.money.taxIncluded === project.taxIncluded;
  if (project.quotedAmount === amount && taxSame) return [];
  return [
    { id: "fee", kind: "fee", ticked, asStated: a.money.asStated, from: project.quotedAmount, to: amount, taxIncluded: a.money.taxIncluded },
  ];
}

/** Type fields the message states that differ from the project's; `onlyEmpty` for a second inquiry, which fills gaps. */
function fieldChanges(a: MessageAnalysis, project: Project, ticked: boolean, onlyEmpty = false): Change[] {
  return keptFields(project.type).flatMap((key): Change[] => {
    const stated = a.details[key];
    if (!stated) return [];
    const from = projectField(project, key);
    if (same(from, stated.value) || (onlyEmpty && from)) return [];
    return [{ id: `field:${key}`, kind: "field", ticked, asStated: stated.asStated, key, from, to: stated.value }];
  });
}

const stageChange = (project: Project, to: Stage, ticked: boolean, asStated = ""): Change[] =>
  project.stage === to ? [] : [{ id: "stage", kind: "stage", ticked, asStated, from: project.stage, to }];

function paymentChanges(a: MessageAnalysis, project: Project, ctx: IntakeContext): Change[] {
  if (!isSigned(project.stage)) return []; // payments attach only to signed projects (decision 0004)
  const out: Change[] = [];
  const expected = expectedIncome(project, ctx.payments);
  const amount = statedAmount(a);
  const asStated = a.details.amountDue?.asStated || a.money.asStated;
  const paid = statusIs(a, /sent|paid|已匯|已付|已轉|已支付|匯出|入帳|付款完成/i);

  if (paid) {
    const byAmount = amount ? expected.filter((p) => near(paymentTotal(p), amount)) : [];
    const match = byAmount.length === 1 ? byAmount[0] : expected.length === 1 ? expected[0] : undefined;
    if (match) {
      const total = paymentTotal(match);
      out.push({
        id: "payment",
        kind: "settlePayment",
        ticked: true,
        asStated,
        paymentId: match.id,
        expected: total,
        amount: amount ?? total,
        settledOn: ctx.receivedOn,
        invoiceRef: a.details.invoiceRef?.value ?? "",
      });
      // The last one in: the project is settled.
      if (expected.length === 1 && project.stage !== "closed") out.push(...stageChange(project, "closed", true));
    } else if (amount && !expected.length) {
      out.push({ id: "payment", kind: "newPayment", ticked: false, asStated, label: "received", amount, settled: true, date: ctx.receivedOn });
    } else if (expected.length) {
      // Several could match: the review screen asks which one; nothing is ticked.
      const first = byAmount[0] ?? expected[0];
      out.push({
        id: "payment",
        kind: "settlePayment",
        ticked: false,
        asStated,
        paymentId: first.id,
        expected: paymentTotal(first),
        amount: amount ?? paymentTotal(first),
        settledOn: ctx.receivedOn,
        invoiceRef: a.details.invoiceRef?.value ?? "",
      });
    }
  } else if (statusIs(a, /request|invoice|發票|請款|開立/i)) {
    out.push({ id: "todo:sendInvoice", kind: "todo", ticked: true, asStated, purpose: "sendInvoice", dueDate: addDays(ctx.receivedOn, 3) });
  } else if (statusIs(a, /remind|提醒|催/i)) {
    const target = (amount ? expected.find((p) => near(paymentTotal(p), amount)) : undefined) ?? (expected.length === 1 ? expected[0] : undefined);
    if (target) out.push({ id: "paymentNote", kind: "paymentNote", ticked: true, asStated, paymentId: target.id, note: a.summary });
  }
  return out;
}

/**
 * What a message would change on an existing project, by its intent. Values
 * equal to the project's aren't shown; fields the message doesn't mention are
 * never proposed. Computed when the screen opens, so it reflects the project
 * as it is now.
 */
export function proposeChanges(a: MessageAnalysis, project: Project, ctx: IntakeContext): Proposal {
  const changes: Change[] = [];
  let question: StageQuestion | null = null;
  const towardNegotiating = project.stage === "offer" ? stageChange(project, "negotiating", true) : [];

  switch (a.intent) {
    case "inquiry":
      // A second offer for the same project: fill what's missing, change nothing already set.
      if (project.quotedAmount === null) changes.push(...feeChange(a, project, true));
      changes.push(...fieldChanges(a, project, true, true));
      changes.push(...dateChanges(a, project, ctx, true).filter((c) => c.kind === "date" && (!c.from || c.earlier)));
      break;
    case "negotiation":
      // A proposal isn't an agreement: shown, recorded on the timeline, not ticked.
      changes.push(...feeChange(a, project, false), ...fieldChanges(a, project, false), ...dateChanges(a, project, ctx, false));
      changes.push(...towardNegotiating);
      break;
    case "confirmation": {
      changes.push(...feeChange(a, project, true), ...fieldChanges(a, project, true), ...dateChanges(a, project, ctx, true));
      if (promisesContract(a))
        changes.push({
          id: "todo:awaitContract",
          kind: "todo",
          ticked: true,
          asStated: a.details.confirmedTerms?.asStated ?? "",
          purpose: "awaitContract",
          dueDate: addDays(ctx.receivedOn, 7),
        });
      if (!isSigned(project.stage) && !ended(project.stage)) {
        const keep: Stage = project.stage === "offer" ? "negotiating" : project.stage;
        // What signing unlocks: dates kept on the project become calendar events. Dates this message
        // changes or adds already carry `asEvent` once the person answers "signed" (applied together).
        const replaced = new Set(changes.flatMap((c) => (c.kind === "date" && c.index !== null ? [c.index] : [])));
        question = {
          from: project.stage,
          choices: ["signed", keep],
          ifSigned: (project.details.dates ?? []).flatMap((d, index): Change[] =>
            replaced.has(index)
              ? []
              : [{ id: `event:${index}`, kind: "date", ticked: true, asStated: "", from: d, to: d, eventId: null, index, asEvent: true, earlier: false }],
          ),
        };
      }
      break;
    }
    case "contract": {
      changes.push(contractVersion(a, project, ctx));
      const terms = a.details.keyTerms;
      if (terms && !same(terms.value, project.details.contractNotes ?? ""))
        changes.push({ id: "contractNotes", kind: "contractNotes", ticked: true, asStated: terms.asStated, from: project.details.contractNotes ?? "", to: terms.value });
      changes.push(...feeChange(a, project, true), ...fieldChanges(a, project, true), ...dateChanges(a, project, ctx, true));
      const stage = a.details.contractStage;
      if (stage && signedStage(a) && !isSigned(project.stage))
        changes.push(...stageChange(project, "signed", true, stage.asStated));
      else changes.push(...towardNegotiating);
      break;
    }
    case "logistics":
      changes.push(...fieldChanges(a, project, true), ...dateChanges(a, project, ctx, true));
      break;
    case "payment":
      changes.push(...paymentChanges(a, project, ctx));
      break;
    case "cancellation": {
      const newDate = a.details.newDate;
      if (newDate) {
        // Postponed: the new date replaces the old one.
        changes.push(...dateChanges(a, project, ctx, true, true));
      } else {
        changes.push(...stageChange(project, "cancelled", true, a.details.reason?.asStated ?? ""));
        const fee = parseAmount(a.details.cancellationFee?.value ?? "");
        if (fee && isSigned(project.stage))
          changes.push({
            id: "payment",
            kind: "newPayment",
            ticked: true,
            asStated: a.details.cancellationFee!.asStated,
            label: "cancellationFee",
            amount: fee,
            settled: false,
            date: ctx.receivedOn,
          });
      }
      break;
    }
    case "other":
      break;
  }

  changes.push(...commonChanges(a, project.details.toConfirm ?? [], ctx));
  return { changes, question };
}

/** For every message: a reply to-do and the open questions to ask the other side. */
function commonChanges(a: MessageAnalysis, toConfirm: string[], ctx: IntakeContext): Change[] {
  const out: Change[] = [];
  out.push({
    id: "todo:reply",
    kind: "todo",
    // A payment notice or a non-work message rarely needs an answer.
    ticked: a.intent !== "other" && a.intent !== "payment",
    asStated: a.replyByStated,
    purpose: "reply",
    dueDate: a.replyBy || addDays(ctx.receivedOn, ctx.replyWithinDays),
  });
  const items = a.missing.filter((m) => !toConfirm.some((t) => same(t, m)));
  if (items.length) out.push({ id: "toConfirm", kind: "toConfirm", ticked: true, asStated: "", items });
  return out;
}

// ---------------------------------------------------------------------------
// Contracts: each version's terms, compared with the one before.

const signedStage = (a: MessageAnalysis) => /signed|已簽|簽署完成|雙方簽/i.test(a.details.contractStage?.value ?? "");

/** A contract's terms as the message states them. */
export function contractTerms(a: MessageAnalysis, type: string): ContractTerms {
  const twd = a.money.amount !== null && (a.money.currency === "TWD" || !a.money.currency);
  return {
    fee: twd ? a.money.amount : null,
    taxIncluded: a.money.taxIncluded,
    paymentTerms: a.paymentTerms,
    keyTerms: a.details.keyTerms?.value ?? "",
    fields: proposedProject({ ...a, projectType: type as MessageAnalysis["projectType"] }).fields,
    dates: proposedProject(a).dates,
  };
}

/** The project's agreed terms, in the same shape, for comparing a first contract with what was agreed. */
export function projectTerms(project: Project): ContractTerms {
  return {
    fee: project.quotedAmount,
    taxIncluded: project.quotedAmount === null ? null : project.taxIncluded,
    paymentTerms: "",
    keyTerms: "",
    fields: Object.fromEntries(keptFields(project.type).map((k) => [k, projectField(project, k)]).filter(([, v]) => v)),
    dates: project.details.dates ?? [],
  };
}

const showDate = (d: ProjectDate) => [d.date, d.time].filter(Boolean).join(" ");

/**
 * Field-by-field differences. Between versions, anything added, removed, or changed; against the
 * project (`conflictsOnly`), only values both state and that differ — a contract silent on a term
 * doesn't contradict it.
 */
export function diffTerms(before: ContractTerms, after: ContractTerms, conflictsOnly = false): TermChange[] {
  const out: TermChange[] = [];
  const add = (key: string, b: string, x: string) => {
    if (same(b, x) || (!b && !x) || (conflictsOnly && (!b || !x))) return;
    out.push({ key, before: b, after: x });
  };
  const yesNo = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");
  add("fee", before.fee === null ? "" : String(before.fee), after.fee === null ? "" : String(after.fee));
  if (before.taxIncluded !== null && after.taxIncluded !== null) add("taxIncluded", yesNo(before.taxIncluded), yesNo(after.taxIncluded));
  add("paymentTerms", before.paymentTerms, after.paymentTerms);
  add("keyTerms", before.keyTerms, after.keyTerms);
  for (const key of new Set([...Object.keys(before.fields), ...Object.keys(after.fields)]))
    add(`field:${key}`, before.fields[key] ?? "", after.fields[key] ?? "");
  // Dates pair up by occasion, or by day; unpaired ones were added or removed.
  const paired = new Set<ProjectDate>();
  for (const d of after.dates) {
    const match = before.dates.find((b) => !paired.has(b) && (overlaps(b.what, d.what) || b.date === d.date));
    if (match) paired.add(match);
    add(`date:${match?.what || d.what}`, match ? showDate(match) : "", showDate(d));
  }
  for (const b of before.dates) if (!paired.has(b)) add(`date:${b.what}`, showDate(b), "");
  return out;
}

/** The contract version a contract message would add. */
function contractVersion(a: MessageAnalysis, project: Project, ctx: IntakeContext): Change {
  const versions = ctx.contracts.filter((c) => c.projectId === project.id);
  const previous = versions.filter((c) => c.status !== "void").sort((x, y) => y.version - x.version)[0];
  const terms = contractTerms(a, project.type);
  const diff = previous ? diffTerms(previous.terms, terms) : diffTerms(projectTerms(project), terms, true);
  const same = !!previous && diff.length === 0;
  return {
    id: "contractVersion",
    kind: "contractVersion",
    ticked: !same,
    asStated: a.details.contractStage?.asStated ?? "",
    version: Math.max(0, ...versions.map((c) => c.version)) + 1,
    status: signedStage(a) ? "signed" : "received",
    terms,
    diff,
    against: previous ? "version" : "project",
    supersedesId: previous?.id ?? null,
    same,
  };
}

// ---------------------------------------------------------------------------
// A new project: the project, its contact, the reply to-do, the to-confirm list.

export type NewProjectProposal = {
  project: {
    title: string;
    type: Project["type"];
    counterparty: string;
    quotedAmount: number | null;
    taxIncluded: boolean;
    fields: Record<string, string>; // registry fields, by key
    dates: ProjectDate[];
  };
  /** Link the matching contact, or create one from the sender; null when the message names nobody. */
  contact: { existing: Contact } | { create: { name: string; company: string; email: string; phone: string } } | null;
  /** In a currency other than the MVP's TWD: kept in the notes, not as the quote. */
  foreignAmount: { amount: number; currency: string } | null;
  changes: Change[]; // reply to-do and to-confirm list, as tickable extras
};

/** A proposed contact: same email first, then the same company or name. Never assumed — the person confirms it. */
export function matchContact(contacts: Contact[], who: { name: string; company: string; email: string }) {
  const live = contacts.filter((c) => !c.archived);
  return (
    live.find((c) => same(c.email, who.email)) ??
    live.find((c) => same(c.company, who.company) || same(c.name, who.company)) ??
    live.find((c) => same(c.name, who.name))
  );
}

/** The type fields and dates a message gives a new project (the reply-by date is a to-do, not a project date). */
export function proposedProject(a: MessageAnalysis) {
  const fields: Record<string, string> = {};
  for (const key of keptFields(a.projectType)) if (a.details[key]) fields[key] = a.details[key].value;
  const dates: ProjectDate[] = a.dates
    .filter((d) => d.date && !(d.date === a.replyBy && !d.time))
    .map((d) => ({ what: d.what, date: d.date, time: d.time, timeZone: d.timeZone }));
  return { fields, dates };
}

export function proposeNewProject(a: MessageAnalysis, fallbackTitle: string, ctx: IntakeContext): NewProjectProposal {
  const existing = matchContact(ctx.contacts, a.counterparty);
  const who = a.counterparty;
  const twd = a.money.amount !== null && (a.money.currency === "TWD" || !a.money.currency);
  const { fields, dates } = proposedProject(a);
  return {
    project: {
      title: (a.title || fallbackTitle).slice(0, 200),
      type: a.projectType,
      counterparty: existing?.name ?? (who.company || who.name),
      quotedAmount: twd ? a.money.amount : null,
      taxIncluded: a.money.taxIncluded ?? false,
      fields,
      dates,
    },
    contact: existing
      ? { existing }
      : who.name || who.company
        ? { create: { name: who.name || who.company, company: who.name ? who.company : "", email: who.email, phone: who.phone } }
        : null,
    foreignAmount: !twd && a.money.amount !== null ? { amount: a.money.amount, currency: a.money.currency } : null,
    changes: commonChanges(a, [], ctx),
  };
}
