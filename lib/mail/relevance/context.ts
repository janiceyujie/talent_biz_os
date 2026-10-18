import "server-only";
import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { contact, mailDecision, mailSenderRule } from "@/lib/db/schema";
import type { RuleContext } from "./rules";

/**
 * What the rules know about this talent and mailbox: their sender rules,
 * contacts, and threads already decided as work. A bank notice's thread isn't
 * one: a bank's notices often share a thread, and each must take the restricted path.
 */
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
      .where(
        and(
          eq(mailDecision.connectionId, connectionId),
          eq(mailDecision.outcome, "work"),
          or(isNull(mailDecision.kind), ne(mailDecision.kind, "bank_notice")),
        ),
      ),
  ]);
  return {
    senderRules,
    contacts: new Set(contacts.map((c) => c.email!.trim().toLowerCase()).filter(Boolean)),
    workThreads: new Set(threads.map((t) => t.thread)),
  };
}
