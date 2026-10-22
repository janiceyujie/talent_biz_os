import "server-only";
import { and, eq, inArray, lt } from "drizzle-orm";
import { ModelError } from "@/lib/ai/model";
import { canScore } from "@/lib/ai/usage";
import { db } from "@/lib/db";
import { mailConnection, mailDecision, message, talent } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { dropBroughtIn } from "../not-work";
import { NOTICE_TTL_DAYS } from "../payment-notice/fields";
import { readNotice } from "../payment-notice/read";
import type { MailProvider } from "../provider";
import { isBulk } from "../relevance/rules";
import { scoreMail } from "../relevance/score";

// Bringing in a bank or payment-app notice (decision 0013, the restricted
// path), called by mail.fetch (./fetch.ts) for an email of kind bank_notice
// (pathFor below):
//   1. the subject and Gmail's preview first; the body only when they don't
//      give the amount and payer;
//   2. masked in code before the model reads it (lib/mail/payment-notice);
//   3. attachments never fetched;
//   4. only the fields kept, in a message of kind payment_notice: never the body.
// Money out, or no amount found: nothing is kept but the decision.

type Decision = typeof mailDecision.$inferSelect;
type Connection = typeof mailConnection.$inferSelect;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which path an email takes. One a rule brought in (a contact, an "always"
 * sender, an e-sign service) or the person did (This was work) has no kind:
 * the model never saw it. A machine-sent one could be a bank notice, say from a
 * bank address saved as a contact, so the model gives it a kind before anything
 * else is read. A person's own email is never one. "wait" when no model is
 * configured: it stays in Waiting.
 */
export async function pathFor(d: Decision, c: Connection, mail: MailProvider): Promise<"notice" | "normal" | "wait"> {
  if (d.kind) return d.kind === "bank_notice" ? "notice" : "normal";
  const meta = await mail.getMetadata(d.providerMessageId, { snippet: true });
  if (!meta || !isBulk(meta)) return "normal"; // gone: the normal path records it when it finds nothing
  if (!(await canScore(c.talentId))) return "wait"; // the mailbox's daily cap
  let scored;
  try {
    scored = await scoreMail(meta, { task: "relevance", talentId: c.talentId });
  } catch (e) {
    // Ids and codes only: never the subject or preview.
    console.error("mail.fetch kind failed", d.id, e instanceof ModelError ? e.code : (e as Error)?.name);
    if (e instanceof ModelError && e.code === "not_configured") return "wait"; // retrying won't help
    throw e;
  }
  // As in the model step (./relevance.ts): a machine-sent payment email is treated as a notice.
  const kind = scored.kind === "payment" ? "bank_notice" : scored.kind;
  await db.update(mailDecision).set({ kind }).where(eq(mailDecision.id, d.id));
  return kind === "bank_notice" ? "notice" : "normal";
}

export async function bringNotice(d: Decision, c: Connection, mail: MailProvider, dedupKey: string) {
  const meta = await mail.getMetadata(d.providerMessageId, { snippet: true });
  if (!meta) {
    await db.update(mailDecision).set({ outcome: "skipped", decidedBy: "gone" }).where(eq(mailDecision.id, d.id));
    return;
  }
  if (!(await canScore(c.talentId))) return; // the mailbox's daily cap: stays in Waiting for a later check
  const [t] = await db.select({ timeZone: talent.timeZone }).from(talent).where(eq(talent.id, c.talentId));
  const receivedOn = dateInZone(t.timeZone, 0, meta.receivedAt);

  let fields;
  try {
    fields = await readNotice(`${meta.subject}\n${meta.snippet}`, receivedOn, c.talentId);
    if (!fields?.payer) {
      const full = await mail.getMessage(d.providerMessageId); // its attachments are listed, never fetched
      if (full) fields = (await readNotice(`${full.subject}\n${full.text}`, receivedOn, c.talentId)) ?? fields;
    }
  } catch (e) {
    // Ids and codes only: never the notice's text.
    console.error("mail.fetch notice failed", d.id, e instanceof ModelError ? e.code : (e as Error)?.name);
    if (e instanceof ModelError && e.code === "not_configured") return; // stays in Waiting; retrying won't help
    throw e;
  }

  if (!fields) {
    await db
      .update(mailDecision)
      .set({ outcome: "not_work", decidedBy: "analysis" })
      .where(eq(mailDecision.id, d.id));
    return;
  }

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(message)
      .values({
        talentId: c.talentId,
        submittedBy: c.connectedBy,
        channel: "gmail",
        kind: "payment_notice",
        notice: fields,
        externalRef: d.providerMessageId,
        connectionId: c.id,
        providerThreadId: d.providerThreadId,
        relevance: d.outcome === "unsure" ? "unsure" : "sure",
        // Who sent the notice (the bank), for the card and a "never" rule; not what it says.
        sender: meta.from.name ? `${meta.from.name} <${meta.from.address}>` : meta.from.address || null,
        receivedAt: meta.receivedAt,
        dedupKey,
        status: "analyzed", // nothing to analyze: the card waits for Mark as received or Drop
      })
      .onConflictDoNothing({ target: [message.talentId, message.dedupKey] })
      .returning({ id: message.id });
    const id =
      created?.id ??
      (await tx
        .select({ id: message.id })
        .from(message)
        .where(and(eq(message.talentId, c.talentId), eq(message.dedupKey, dedupKey)))
        .then((r) => r[0]?.id));
    if (id) await tx.update(mailDecision).set({ messageId: id }).where(eq(mailDecision.id, d.id));
  });
}

/** Notices left unhandled for 30 days, for one talent or all: their fields are deleted; the decision stays, with the Gmail link. */
export async function expireNotices(talentId?: string) {
  const old = await db
    .select({ id: message.id, talentId: message.talentId })
    .from(message)
    .where(
      and(
        talentId ? eq(message.talentId, talentId) : undefined,
        eq(message.kind, "payment_notice"),
        inArray(message.status, ["analyzed", "dismissed"]),
        lt(message.createdAt, new Date(Date.now() - NOTICE_TTL_DAYS * DAY_MS)),
      ),
    );
  for (const m of old) await dropBroughtIn(m.talentId, m.id, "expired");
}
