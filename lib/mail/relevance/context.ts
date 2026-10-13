import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { contact, mailDecision, mailSenderRule } from "@/lib/db/schema";
import type { RuleContext } from "./rules";

/** What the rules know about this talent and mailbox: their sender rules, contacts, and threads already decided as work. */
export async function ruleContext(talentId: string, connectionId: string): Promise<RuleContext & { workThreads: Set<string> }> {
  const [senderRules, contacts, threads] = await Promise.all([
    db
      .select({
        kind: mailSenderRule.kind,
        value: mailSenderRule.value,
        verdict: mailSenderRule.verdict,
      })
      .from(mailSenderRule)
      .where(eq(mailSenderRule.talentId, talentId)),
    db
      .select({ email: contact.email })
      .from(contact)
      .where(and(eq(contact.talentId, talentId), isNotNull(contact.email))),
    db
      .selectDistinct({ thread: mailDecision.providerThreadId })
      .from(mailDecision)
      .where(and(eq(mailDecision.connectionId, connectionId), eq(mailDecision.outcome, "work"))),
  ]);
  return {
    senderRules,
    contacts: new Set(contacts.map((c) => c.email!.trim().toLowerCase()).filter(Boolean)),
    workThreads: new Set(threads.map((t) => t.thread)),
  };
}
