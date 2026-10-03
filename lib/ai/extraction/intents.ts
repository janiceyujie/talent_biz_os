// What a message is doing, whatever the deal is about. The intent decides what
// filing it should do (start a project, update one, add a payment to-do, flag
// a change); the project type (lib/project-types) decides which deal fields
// apply. Labels people see are in the message catalogs (labels.intent).
import type { FieldDefinition } from "./fields";

export type IntentDefinition = { key: string; description: string; fields: readonly FieldDefinition[] };

export const intents = [
  {
    key: "inquiry",
    description: "A new inquiry or offer: asking about availability, interest, or a fee for work not yet agreed.",
    fields: [],
  },
  {
    key: "negotiation",
    description: "Discussing terms of work already under discussion: a counter-offer, a changed fee, scope, or date.",
    fields: [{ key: "proposedChanges", description: "What they propose to change, from what to what" }],
  },
  {
    key: "confirmation",
    description: "Agreeing to or confirming terms, a booking, or a date.",
    fields: [{ key: "confirmedTerms", description: "What exactly is being confirmed" }],
  },
  {
    key: "contract",
    description: "Sending, revising, or discussing a contract or its clauses.",
    fields: [
      { key: "contractStage", description: "draft, revised, final for signature, or signed" },
      { key: "keyTerms", description: "The main clauses, or what a revision changes: term, exclusivity, usage, cancellation, penalties" },
    ],
  },
  {
    key: "logistics",
    description: "Practical arrangements or changes for agreed work: schedule, location, travel, technical needs.",
    fields: [{ key: "changes", description: "What is arranged or changed" }],
  },
  {
    key: "payment",
    description: "About money for work: invoice, payment request or reminder, notice that payment was sent, tax forms.",
    fields: [
      { key: "invoiceRef", description: "Invoice, receipt, or order number" },
      { key: "paymentStatus", description: "requested, reminder, sent or paid, or problem" },
      { key: "amountDue", description: "The amount this message is about, as stated" },
    ],
  },
  {
    key: "cancellation",
    description: "Cancelling or postponing agreed or discussed work.",
    fields: [
      { key: "reason", description: "Why, as stated" },
      { key: "cancellationFee", description: "Any cancellation or kill fee" },
      { key: "newDate", description: "New date if postponed" },
    ],
  },
  {
    key: "other",
    description: "Anything else, including messages that aren't about work.",
    fields: [],
  },
] as const satisfies readonly IntentDefinition[];

export type Intent = (typeof intents)[number]["key"];
export const intentKeys = intents.map((i) => i.key) as [Intent, ...Intent[]];
