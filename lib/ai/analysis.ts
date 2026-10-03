// What the model returns for one message, and the cleaned-up form we store
// (message_analysis.analysis). The model only fills this schema; it has no
// tools, so nothing in a message can make it act. Every value is a proposal
// the person confirms or edits in the inbox.
import { z } from "zod";
import { projectTypeKeys } from "@/lib/project-types";

const messageTypes = ["gig_offer", "contract", "payment_note", "other"] as const;

/** The JSON shape the model must produce. Strings, not nulls, for unknowns ("" = not stated) — easier for small models. */
// Field order matters: generation follows it, so facts come first and the
// labels (type, confidence) last, after the model has read everything.
export const modelOutput = z.object({
  language: z.string().describe("BCP 47 code of the language the message is written in, e.g. zh-TW, en, ja"),
  title: z.string().describe("Short project name, e.g. '11/14 Blue Room 演出'"),
  summary: z.string().describe("Two or three sentences, in the output language"),
  counterparty: z.object({
    name: z.string().describe("The person who wrote, e.g. 'Maya' — not the company"),
    company: z.string().describe("Venue, brand, or company, as stated"),
    email: z.string(),
    phone: z.string(),
  }),
  dates: z
    .array(
      z.object({
        what: z.string().describe("What happens then, e.g. performance, load-in, deadline"),
        date: z.string().describe("YYYY-MM-DD, or empty if no date"),
        time: z.string().describe("HH:mm 24-hour, or empty"),
        timeZone: z.string().describe("IANA zone if stated or clear from the place, else empty"),
        asStated: z.string().describe("The words used in the message"),
      }),
    )
    .describe("Every date or time mentioned"),
  money: z.object({
    amount: z.number().describe("The fee offered, as a number; 0 if no amount is stated"),
    currency: z.string().describe("ISO code: NT$, 台幣, 元 → TWD; US$ → USD; 円 → JPY; empty if no amount"),
    taxIncluded: z.enum(["yes", "no", "unknown"]),
    asStated: z.string(),
  }),
  paymentTerms: z.string().describe("Deposit, balance, method, timing, as stated"),
  replyBy: z.string().describe("YYYY-MM-DD the sender wants an answer by, or empty"),
  venue: z.string(),
  setLength: z.string(),
  loadIn: z.string(),
  equipment: z.string(),
  deliverables: z.string(),
  rights: z.string().describe("Usage rights, exclusivity"),
  asks: z.array(z.string()).describe("What the sender is asking for, in the output language"),
  missing: z.array(z.string()).describe("Important details not stated (e.g. no load-in time), plus any assumption you made, in the output language"),
  messageType: z.enum(messageTypes),
  projectType: z.enum(projectTypeKeys as [string, ...string[]]),
  confidence: z.number().describe("0 to 1: how sure you are this extraction is right"),
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
// Small models sometimes write a filler word instead of leaving a field empty.
const filler = /^(未提及|未提供|無|沒有|不明|未知|n\/?a|none|not (mentioned|stated|provided)|unknown|-+)$/i;
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

/** Stored form: invalid dates, times, and zones dropped rather than kept as garbage; amounts ≥ 0; confidence in [0, 1]. */
export function normalize(o: ModelOutput) {
  return {
    messageType: o.messageType,
    projectType: o.projectType as (typeof projectTypeKeys)[number],
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
    replyBy: isDate(o.replyBy) ? o.replyBy : "",
    gig: { venue: clean(o.venue, 200), setLength: clean(o.setLength, 200), loadIn: clean(o.loadIn, 200), equipment: clean(o.equipment) },
    deliverables: clean(o.deliverables),
    rights: clean(o.rights),
    asks: o.asks.slice(0, 10).map((a) => clean(a, 300)).filter(Boolean),
    missing: o.missing.slice(0, 10).map((m) => clean(m, 300)).filter(Boolean),
    confidence: Math.min(1, Math.max(0, Number.isFinite(o.confidence) ? o.confidence : 0)),
  };
}
export type MessageAnalysis = ReturnType<typeof normalize>;
