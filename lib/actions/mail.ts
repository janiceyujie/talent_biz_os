"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { mailConnection, mailDecision, mailSenderRule } from "@/lib/db/schema";
import { domainOf } from "@/lib/mail/metadata";
import { isPersonalDomain } from "@/lib/mail/relevance/rules";
import { queue } from "@/lib/queue";
import { mailQueue, syncJobKey } from "@/lib/queue/jobs";
import { errorText, firstIssue } from "./validation";

// The connected mailbox (decision 0013): Sync now, disconnect, and sender
// rules. Connecting itself is a round trip through Google: app/api/mail/connect
// and callback.

/**
 * Sync now: the worker reads what's new (the first time, the history chosen
 * when connecting) and records what the rules decide. Pressing it again while
 * a sync waits replaces that one. After a failed sync, it tries again.
 */
export async function syncGmail(): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const found = await db.transaction(async (tx) => {
    const [c] = await tx
      .update(mailConnection)
      .set({ syncRequestedAt: new Date(), status: "connected", failure: null })
      .where(and(eq(mailConnection.talentId, talent.id), inArray(mailConnection.status, ["connected", "error"])))
      .returning({ id: mailConnection.id });
    if (c) await queue.enqueue("mail.sync", { connectionId: c.id }, { tx, queueName: mailQueue(c.id), jobKey: syncJobKey(c.id) });
    return !!c;
  });
  if (!found) return fail("gmailNotConnected");
  refresh();
  return null;
}

const senderRuleInput = z.strictObject({
  decisionId: z.uuid(),
  address: z.email("emailInvalid").transform((v) => v.trim().toLowerCase()),
  kind: z.enum(["address", "domain"]),
  verdict: z.enum(["always", "never"]),
});

/**
 * "Always bring in" or "Never" for an email's sender or its whole domain, from
 * Waiting or Filtered out. The email itself moves at once; later syncs apply
 * the rule to new mail.
 */
export async function addSenderRule(data: Record<string, unknown>): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  const parsed = senderRuleInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { decisionId, address, kind, verdict } = parsed.data;
  const value = kind === "domain" ? domainOf(address) : address;
  if (kind === "domain" && isPersonalDomain(value)) return fail("invalid");

  const found = await db.transaction(async (tx) => {
    const [d] = await tx
      .update(mailDecision)
      .set({ outcome: verdict === "always" ? "work" : "skipped", decidedBy: "person" })
      .where(and(eq(mailDecision.id, decisionId), eq(mailDecision.talentId, talent.id)))
      .returning({ id: mailDecision.id });
    if (!d) return false;
    await tx
      .insert(mailSenderRule)
      .values({ talentId: talent.id, kind, value, verdict, createdBy: person.personId })
      .onConflictDoUpdate({
        target: [mailSenderRule.talentId, mailSenderRule.kind, mailSenderRule.value],
        set: { verdict, createdBy: person.personId, createdAt: sql`now()` },
      });
    return true;
  });
  if (!found) return fail("invalid");
  refresh();
  return null;
}

/** Remove a sender rule (Settings → Gmail → Manage). Emails it already moved stay where they are. */
export async function removeSenderRule(id: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  await db.delete(mailSenderRule).where(and(eq(mailSenderRule.id, id), eq(mailSenderRule.talentId, talent.id)));
  refresh();
  return null;
}

/**
 * Disconnect Gmail: the row is marked at once, and the worker revokes the
 * token at Google and deletes it (the web service can't decrypt tokens).
 */
export async function disconnectGmail(): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const found = await db.transaction(async (tx) => {
    const [c] = await tx
      .update(mailConnection)
      .set({ status: "disconnecting" })
      .where(and(eq(mailConnection.talentId, talent.id), ne(mailConnection.status, "disconnecting")))
      .returning({ id: mailConnection.id });
    if (c)
      await queue.enqueue("mail.disconnect", { connectionId: c.id }, { tx, queueName: mailQueue(c.id), jobKey: `mail.disconnect:${c.id}` });
    return !!c;
  });
  if (!found) return fail("gmailNotConnected");
  refresh();
  return null;
}
