// What the model returns for one message, and the cleaned-up form we store
// (message_analysis.analysis). Built from the registries: intents
// (lib/ai/extraction/intents.ts) and project types (lib/project-types), so a
// new type or field is a definition, not a schema edit. The model only fills
// this schema; it has no tools. Every value is a proposal the person confirms.
import { z } from "zod";
import { projectTypeKeys, projectTypes, type ProjectType, type ProjectTypeDefinition } from "@/lib/project-types";
import { intentKeys, intents, type Intent, type IntentDefinition } from "./extraction/intents";
import type { Flag } from "./safety";

/** Flags the model may raise; `hidden_text` comes only from the deterministic check (lib/ai/safety.ts). */
const modelFlagKinds = ["instructions_to_ai", "payment_details", "inconsistency", "other"] as const;

/** Every type- or intent-specific field key the model may use. */
const typeDefinitions: readonly ProjectTypeDefinition[] = projectTypes;
const intentDefinitions: readonly IntentDefinition[] = intents;
const fieldsOf = (projectType: string, intent: string) => [
  ...(typeDefinitions.find((t) => t.key === projectType)?.extraction.fields ?? []),
  ...(intentDefinitions.find((i) => i.key === intent)?.fields ?? []),
];
const detailKeys = [
  ...new Set([...typeDefinitions.flatMap((t) => t.extraction.fields), ...intentDefinitions.flatMap((i) => i.fields)].map((f) => f.key)),
];

// Field order matters: generation follows it, so the facts come first and the
// labels (intent, type, confidence) last, after the model has read everything.
export const modelOutput = z.object({
  language: z.string().describe("BCP 47 code of the language the message is written in, e.g. zh-TW, en, ja"),
  title: z.string().describe("Short name for the work, e.g. '11/14 Blue Room show'"),
  summary: z.string().describe("Two or three sentences, in the output language"),
  counterparty: z.object({
    name: z.string().describe("The person who wrote — not the company"),
    company: z.string().describe("Their company, venue, brand, or agency"),
    email: z.string(),
    phone: z.string(),
  }),
  dates: z
    .array(
      z.object({
        what: z.string().describe("What happens then: performance, shoot, posting, deadline…"),
        date: z.string().describe("YYYY-MM-DD, or empty"),
        time: z.string().describe("HH:mm 24-hour, or empty"),
        timeZone: z.string().describe("IANA zone if stated or clear from the place, else empty"),
        asStated: z.string().describe("The exact words used"),
      }),
    )
    .describe("Every date or time mentioned"),
  money: z.object({
    amount: z.number().describe("The fee for the artist as a plain number; 0 if none is stated"),
    currency: z.string().describe("ISO 4217 code; empty if no amount"),
    taxIncluded: z.enum(["yes", "no", "unknown"]),
    asStated: z.string().describe("The exact words used"),
  }),
  paymentTerms: z.string().describe("Deposit, balance, method, timing — as stated"),
  replyBy: z.object({
    date: z.string().describe("YYYY-MM-DD the sender wants an answer by, or empty"),
    asStated: z.string().describe("The exact words used"),
  }),
  details: z
    .array(
      z.object({
        field: z.enum(detailKeys as [string, ...string[]]),
        value: z.string().describe("The value, briefly, in the message's own words or a faithful summary"),
        asStated: z.string().describe("The exact words it comes from"),
      }),
    )
    .describe("Fields for the chosen project type and intent, only those the message states"),
  asks: z.array(z.string()).describe("What the sender is asking for, in the output language"),
  missing: z.array(z.string()).describe("Details a professional would need that aren't stated, and any assumption made, in the output language"),
  flags: z
    .array(
      z.object({
        kind: z.enum(modelFlagKinds),
        note: z.string().describe("What looks wrong, in one sentence, in the output language"),
        asStated: z.string().describe("The exact words"),
      }),
    )
    .describe("Anything the person should be warned about; empty for an ordinary message"),
  intent: z.enum(intentKeys as [string, ...string[]]),
  projectType: z.enum(projectTypeKeys as [string, ...string[]]),
  confidence: z.number().describe("0 to 1: how sure you are the extraction is right and complete"),
});
export type ModelOutput = z.infer<typeof modelOutput>;

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isZone = (v: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return true;
  } catch {
    return false;
  }
};

// Models sometimes write a filler word instead of leaving a field empty.
const filler = /^(未提及|未提供|未說明|無|沒有|不明|未知|n\/?a|none|not (mentioned|stated|provided|specified)|unknown|-+)$/i;
const clean = (v: string, max = 2000) => {
  const text = v.trim();
  return filler.test(text) ? "" : text.slice(0, max);
};

/** The currency from how the amount was written, when the model left it out. */
function currencyFrom(asStated: string) {
  if (/NT\$|NTD|TWD|台幣|新臺幣|新台幣|元/i.test(asStated)) return "TWD";
  if (/US\$|USD/i.test(asStated)) return "USD";
  if (/JPY|円/.test(asStated)) return "JPY";
  return "";
}

export type DetailValue = { value: string; asStated: string };

/**
 * Stored form. Invalid dates, times, and zones are dropped rather than kept as
 * garbage; amounts are ≥ 0; confidence is in [0, 1]; details keep only the
 * fields defined for the chosen project type and intent.
 */
export function normalize(o: ModelOutput) {
  const intent = o.intent as Intent;
  const projectType = o.projectType as ProjectType;
  const allowed = new Set(fieldsOf(projectType, intent).map((f) => f.key));
  const details: Record<string, DetailValue> = {};
  for (const d of o.details) {
    const value = clean(d.value, 1000);
    if (allowed.has(d.field) && value && !details[d.field]) details[d.field] = { value, asStated: clean(d.asStated, 500) };
  }
  return {
    intent,
    projectType,
    language: clean(o.language, 20),
    title: clean(o.title, 200),
    summary: clean(o.summary),
    counterparty: {
      name: clean(o.counterparty.name, 200),
      company: clean(o.counterparty.company, 200),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.counterparty.email.trim()) ? o.counterparty.email.trim() : "",
      phone: clean(o.counterparty.phone, 60),
    },
    dates: o.dates.slice(0, 20).map((d) => ({
      what: clean(d.what, 200),
      date: isDate(d.date) ? d.date : "",
      time: isTime(d.time) ? d.time : "",
      timeZone: d.timeZone && isZone(d.timeZone) ? d.timeZone : "",
      asStated: clean(d.asStated, 200),
    })),
    money: {
      amount: Number.isFinite(o.money.amount) && o.money.amount > 0 ? Math.round(o.money.amount * 100) / 100 : null,
      currency: /^[A-Z]{3}$/.test(o.money.currency.trim().toUpperCase())
        ? o.money.currency.trim().toUpperCase()
        : currencyFrom(o.money.asStated),
      taxIncluded: o.money.taxIncluded === "unknown" ? null : o.money.taxIncluded === "yes",
      asStated: clean(o.money.asStated, 200),
    },
    paymentTerms: clean(o.paymentTerms),
    replyBy: isDate(o.replyBy.date) ? o.replyBy.date : "",
    replyByStated: clean(o.replyBy.asStated, 200),
    details,
    asks: o.asks.slice(0, 10).map((a) => clean(a, 300)).filter(Boolean),
    missing: o.missing.slice(0, 10).map((m) => clean(m, 300)).filter(Boolean),
    flags: o.flags.slice(0, 5).map((f): Flag => ({ kind: f.kind, note: clean(f.note, 300), asStated: clean(f.asStated, 300), source: "model" })),
    confidence: Math.min(1, Math.max(0, Number.isFinite(o.confidence) ? o.confidence : 0)),
  };
}
export type MessageAnalysis = ReturnType<typeof normalize>;

/** The fields shown for an analysis, in definition order: its project type's, then its intent's. */
export const detailFieldKeys = (a: Pick<MessageAnalysis, "projectType" | "intent">) => fieldsOf(a.projectType, a.intent).map((f) => f.key);

/** Analyses stored before the registry (messageType, fixed gig fields) read as the current shape. */
export function upgradeAnalysis(raw: unknown): MessageAnalysis {
  const a = raw as Partial<MessageAnalysis> & {
    messageType?: string;
    gig?: Record<string, string>;
    deliverables?: string;
    rights?: string;
  };
  if (a.intent) return { ...(a as MessageAnalysis), flags: a.flags ?? [] };
  const legacyIntent: Record<string, Intent> = { gig_offer: "inquiry", contract: "contract", payment_note: "payment" };
  const details: Record<string, DetailValue> = {};
  for (const [key, value] of Object.entries({ ...a.gig, deliverables: a.deliverables, usageRights: a.rights }))
    if (value) details[key] = { value, asStated: "" };
  return {
    ...(a as MessageAnalysis),
    intent: legacyIntent[a.messageType ?? ""] ?? "other",
    replyByStated: "",
    details,
    flags: [],
  };
}
