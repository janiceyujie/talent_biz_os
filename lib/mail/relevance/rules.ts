import { domainOf, type MailMetadata } from "../metadata";
import { hasWorkWords } from "./keywords";

// The first step of the relevance check (decision 0013): rules on metadata
// alone, then thread memory. The first rule that matches decides; work rules
// come first, so a contact is never skipped. Gmail's tabs are never a reason to
// skip by themselves (offers land there too): Promotions and Updates count like
// bulk mail, skipped only with no work words in the subject.
// What no rule decides is left pending for the model step.

/** Bump when a rule changes what it decides; stored on each decision. */
export const RULES_VERSION = "rules-2";

export const ruleIds = ["sender_always", "sender_never", "contact", "thread", "esign", "spam", "trash", "draft", "sent", "bulk", "tab"] as const;
export type RuleId = (typeof ruleIds)[number];

export type RuleOutcome = "work" | "skipped" | "pending";
export type Verdict = { outcome: RuleOutcome; rule: RuleId | null };

/** An artist's own "always" or "never" for an address or a whole domain. */
export type SenderRule = {
  kind: "address" | "domain";
  value: string;
  verdict: "always" | "never";
};

export type RuleContext = {
  senderRules: SenderRule[];
  contacts: ReadonlySet<string>; // the talent's contacts' addresses, lowercased
  workThreads: ReadonlySet<string>; // threads with an email already decided as work
};

// E-sign services: their notices are contract work for almost anyone. Booking
// platforms differ per artist, so they belong in the artist's own sender rules.
const esignDomains = ["docusign.net", "docusign.com", "echosign.com", "adobesign.com", "hellosign.com", "dropboxsign.com", "pandadoc.com", "pandadoc.net"];

// Free mailbox providers: a domain rule there would cover strangers, so only address rules are offered.
const personalDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.com.tw",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "pchome.com.tw",
  "qq.com",
  "163.com",
]);
export const isPersonalDomain = (domain: string) => personalDomains.has(domain.toLowerCase());

const noReply = /^(no-?reply|do-?not-?reply|mailer-daemon)([+._-]|@)/;

const inDomain = (address: string, domain: string) => {
  const d = domainOf(address);
  return d === domain || d.endsWith(`.${domain}`);
};

/** Which sender rule applies: an address rule beats a domain rule. */
export function senderRuleFor(address: string, rules: SenderRule[]): SenderRule | undefined {
  if (!address) return undefined;
  return rules.find((r) => r.kind === "address" && r.value === address) ?? rules.find((r) => r.kind === "domain" && inDomain(address, r.value));
}

/** Mailing-list or machine-sent mail: list headers, a bulk precedence, auto-submitted, or a no-reply sender. */
export function isBulk(m: MailMetadata) {
  const h = m.headers;
  return (
    !!h["List-Unsubscribe"] ||
    !!h["List-Id"] ||
    /^(bulk|list|junk)$/i.test(h.Precedence.trim()) ||
    (!!h["Auto-Submitted"] && !/^no$/i.test(h["Auto-Submitted"].trim())) ||
    noReply.test(m.from.address)
  );
}

export function decide(m: MailMetadata, ctx: RuleContext): Verdict {
  const sender = senderRuleFor(m.from.address, ctx.senderRules);
  if (sender) return sender.verdict === "always" ? { outcome: "work", rule: "sender_always" } : { outcome: "skipped", rule: "sender_never" };
  if (m.from.address && ctx.contacts.has(m.from.address)) return { outcome: "work", rule: "contact" };
  if (ctx.workThreads.has(m.threadId)) return { outcome: "work", rule: "thread" };
  if (esignDomains.some((d) => inDomain(m.from.address, d))) return { outcome: "work", rule: "esign" };
  const labels = new Set(m.labels);
  if (labels.has("SPAM")) return { outcome: "skipped", rule: "spam" };
  if (labels.has("TRASH")) return { outcome: "skipped", rule: "trash" };
  if (labels.has("DRAFT")) return { outcome: "skipped", rule: "draft" };
  // The artist's own sent mail comes in later, and only in threads already relevant.
  if (labels.has("SENT")) return { outcome: "skipped", rule: "sent" };
  const workWords = hasWorkWords(m.subject, { promotions: labels.has("CATEGORY_PROMOTIONS") });
  if (isBulk(m) && !workWords) return { outcome: "skipped", rule: "bulk" };
  // Marketing and notifications sent without list headers.
  if ((labels.has("CATEGORY_PROMOTIONS") || labels.has("CATEGORY_UPDATES")) && !workWords) return { outcome: "skipped", rule: "tab" };
  return { outcome: "pending", rule: null };
}

/**
 * Decide a batch oldest first, so a reply sees the decision on the email it
 * answers: an email decided as work makes the rest of its thread work too.
 */
export function decideAll(mail: MailMetadata[], ctx: RuleContext): { mail: MailMetadata; verdict: Verdict }[] {
  const workThreads = new Set(ctx.workThreads);
  return [...mail]
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
    .map((m) => {
      const verdict = decide(m, { ...ctx, workThreads });
      if (verdict.outcome === "work") workThreads.add(m.threadId);
      return { mail: m, verdict };
    });
}
