"use server";

import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { mailConnection, mailDecision, mailSenderRule, message, payment, talent as talentTable, todo } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { supportedCurrencies } from "@/lib/domain/money";
import { queueFetch } from "@/lib/mail/jobs/fetch";
import { domainOf, parseAddress } from "@/lib/mail/metadata";
import { dropBroughtIn } from "@/lib/mail/not-work";
import { isPersonalDomain } from "@/lib/mail/relevance/rules";
import { queue } from "@/lib/queue";
import { mailQueue, syncJobKey } from "@/lib/queue/jobs";
import { checkProjectLink } from "./project-link";
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

/** Try again, on an email in Waiting that couldn't be brought in: it's queued once more. */
export async function retryFetch(decisionId: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(decisionId).success) return fail("invalid");
  const [d] = await db
    .select({ id: mailDecision.id, connectionId: mailDecision.connectionId })
    .from(mailDecision)
    .where(
      and(
        eq(mailDecision.id, decisionId),
        eq(mailDecision.talentId, talent.id),
        inArray(mailDecision.outcome, ["work", "unsure"]),
        isNull(mailDecision.messageId),
        isNotNull(mailDecision.fetchFailure),
      ),
    );
  if (!d) return fail("invalid");
  await queueFetch(d.connectionId, d.id);
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

class Refused {
  constructor(readonly key: "paymentNotFound") {}
}

const recordInput = z.union([z.strictObject({ paymentId: z.uuid() }), z.strictObject({ projectId: z.uuid() })]);

/**
 * Mark as received, on a payment notice (decision 0013): settles the expected
 * payment the person picked, or records a new one on a signed project, with
 * what arrived and when. The notice stays, filed, with its fields.
 */
export async function recordNoticePayment(messageId: string, target: { paymentId: string } | { projectId: string }): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const parsed = recordInput.safeParse(target);
  if (!z.uuid().safeParse(messageId).success || !parsed.success) return fail("invalid");
  const [m] = await db
    .select({ notice: message.notice, receivedAt: message.receivedAt, timeZone: talentTable.timeZone })
    .from(message)
    .innerJoin(talentTable, eq(talentTable.id, message.talentId))
    .where(and(eq(message.id, messageId), eq(message.talentId, talent.id), eq(message.kind, "payment_notice"), eq(message.status, "analyzed")));
  if (!m?.notice) return fail("invalid");
  const n = m.notice;
  if (!(supportedCurrencies as readonly string[]).includes(n.currency)) return fail("noticeCurrency");
  const today = dateInZone(m.timeZone);
  const settledOn = n.date && n.date <= today ? n.date : dateInZone(m.timeZone, 0, m.receivedAt);

  const target_ = parsed.data;
  if ("projectId" in target_) {
    const linkError = await checkProjectLink(talent.id, target_.projectId);
    if (linkError) return fail(linkError);
  }
  const t = await getTranslations("paymentNotice");
  const done = await db
    .transaction(async (tx) => {
      // The notice first: pressed twice, the second finds it filed already and changes nothing.
      const [claimed] = await tx
        .update(message)
        .set({ status: "confirmed", relevance: "sure" })
        .where(and(eq(message.id, messageId), eq(message.status, "analyzed")))
        .returning({ id: message.id });
      if (!claimed) return "invalid" as const;
      let p: { id: string; projectId: string | null } | undefined;
      if ("paymentId" in target_) {
        [p] = await tx
          .update(payment)
          .set({ status: "settled", settledAmount: n.amount, settledOn })
          .where(
            and(
              eq(payment.id, target_.paymentId),
              eq(payment.talentId, talent.id),
              eq(payment.direction, "in"),
              eq(payment.status, "expected"),
              eq(payment.currency, n.currency), // the settled amount is in the notice's currency
              isNull(payment.voidedAt),
            ),
          )
          .returning({ id: payment.id, projectId: payment.projectId });
        if (!p) throw new Refused("paymentNotFound"); // undoes the claim above
      } else {
        [p] = await tx
          .insert(payment)
          .values({
            talentId: talent.id,
            projectId: target_.projectId,
            direction: "in",
            label: n.payer ? t("newLabelFrom", { payer: n.payer }) : t("newLabel"),
            amount: n.amount,
            currency: n.currency,
            taxIncluded: true,
            recordedOn: today,
            status: "settled",
            settledAmount: n.amount,
            settledOn,
          })
          .returning({ id: payment.id, projectId: payment.projectId });
      }
      await tx
        .update(message)
        .set({ projectId: p.projectId, notice: { ...n, paymentId: p.id } })
        .where(eq(message.id, messageId));
      return null;
    })
    .catch((e) => {
      if (e instanceof Refused) return e.key;
      throw e;
    });
  if (done) return fail(done);
  refresh();
  return null;
}

/** Undo, on the person's own reply: the reply to-dos it marked done are open again. */
export async function reopenReplies(messageId: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(messageId).success) return fail("invalid");
  await db
    .update(todo)
    .set({ status: "open", completedAt: null, completedByMessageId: null })
    .where(and(eq(todo.talentId, talent.id), eq(todo.completedByMessageId, messageId), eq(todo.status, "done")));
  refresh();
  return null;
}
