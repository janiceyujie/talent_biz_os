"use server";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { mailConnection, mailDecision, mailSenderRule, message } from "@/lib/db/schema";
import { queueFetch } from "@/lib/mail/jobs/fetch";
import { domainOf, parseAddress } from "@/lib/mail/metadata";
import { dropBroughtIn } from "@/lib/mail/not-work";
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
      .where(and(eq(mailDecision.id, decisionId), eq(mailDecision.talentId, talent.id), isNull(mailDecision.messageId)))
      .returning({ id: mailDecision.id, connectionId: mailDecision.connectionId });
    if (!d) return false;
    if (verdict === "always") await queueFetch(d.connectionId, d.id, tx);
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
export async function disconnectGmail(keep: "filed" | "none"): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (keep !== "filed" && keep !== "none") return fail("invalid");
  const found = await db.transaction(async (tx) => {
    const [c] = await tx
      .update(mailConnection)
      .set({ status: "disconnecting" })
      .where(and(eq(mailConnection.talentId, talent.id), ne(mailConnection.status, "disconnecting")))
      .returning({ id: mailConnection.id });
    if (c)
      await queue.enqueue("mail.disconnect", { connectionId: c.id, keep }, { tx, queueName: mailQueue(c.id), jobKey: `mail.disconnect:${c.id}` });
    return !!c;
  });
  if (!found) return fail("gmailNotConnected");
  refresh();
  return null;
}

/**
 * Not work, on an email brought in from Gmail: its body and files are deleted,
 * the decision stays. With `never`, its sender won't be brought in again.
 */
export async function markNotWork(messageId: string, never = false): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(messageId).success) return fail("invalid");
  const [m] = await db
    .select({ sender: message.sender })
    .from(message)
    .where(and(eq(message.id, messageId), eq(message.talentId, talent.id)));
  if (!(await dropBroughtIn(talent.id, messageId, "person"))) return fail("invalid");
  const address = parseAddress(m?.sender ?? "").address;
  if (never && address)
    await db
      .insert(mailSenderRule)
      .values({ talentId: talent.id, kind: "address", value: address, verdict: "never", createdBy: person.personId })
      .onConflictDoUpdate({ target: [mailSenderRule.talentId, mailSenderRule.kind, mailSenderRule.value], set: { verdict: "never" } });
  refresh();
  return null;
}

/** This was work, on an email in Filtered out: it's brought in and analyzed, and the decision records the correction. */
export async function markWasWork(decisionId: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(decisionId).success) return fail("invalid");
  const found = await db.transaction(async (tx) => {
    const [d] = await tx
      .update(mailDecision)
      .set({ outcome: "work", decidedBy: "person" })
      .where(
        and(eq(mailDecision.id, decisionId), eq(mailDecision.talentId, talent.id), inArray(mailDecision.outcome, ["skipped", "not_work", "pending"])),
      )
      .returning({ id: mailDecision.id, connectionId: mailDecision.connectionId });
    if (d) await queueFetch(d.connectionId, d.id, tx);
    return !!d;
  });
  if (!found) return fail("invalid");
  refresh();
  return null;
}

/** "It's work", on an email flagged Not sure: the flag goes; the decision records the answer. */
export async function markSureWork(messageId: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(messageId).success) return fail("invalid");
  const found = await db.transaction(async (tx) => {
    const [m] = await tx
      .update(message)
      .set({ relevance: "sure" })
      .where(and(eq(message.id, messageId), eq(message.talentId, talent.id), eq(message.channel, "gmail")))
      .returning({ id: message.id });
    if (m) await tx.update(mailDecision).set({ outcome: "work", decidedBy: "person" }).where(eq(mailDecision.messageId, m.id));
    return !!m;
  });
  if (!found) return fail("invalid");
  refresh();
  return null;
}
