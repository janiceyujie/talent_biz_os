import "server-only";
import {mailboxOwnerActive,lockMailboxOwner} from "../owner";
import { and, eq, isNull, ne } from "drizzle-orm";
import { ModelError } from "@/lib/ai/model";
import { db } from "@/lib/db";
import { mailConnection, mailDecision } from "@/lib/db/schema";
import { queue } from "@/lib/queue";
import { relevanceJobKey, relevanceQueue } from "@/lib/queue/jobs";
import { accessToken, MailAccessLost, markReconnectNeeded } from "../access";
import { gmailProvider } from "../gmail";
import { RULES_VERSION } from "../relevance/rules";
import { scoreMail } from "../relevance/score";
import { outcomeFor } from "../relevance/thresholds";
import { queueFetch } from "./fetch";

// mail.relevance (docs/design/gmail-ingestion.md, Jobs): the model step for one
// email the rules left pending. Reads its sender, subject, labels, and Gmail's
// short preview (never the body), asks the relevance model, and records the
// score and kind. One job per email, so an email can't sway another's score
// (decision 0007) and a failure retries only that email. Work and Not sure
// are then brought in (./fetch.ts). Safe to run twice.

/** Queue the model step for every email of this mailbox still pending. */
export async function queueScoring(connectionId: string) {
  const pending = await db
    .select({ id: mailDecision.id })
    .from(mailDecision)
    .where(and(eq(mailDecision.connectionId, connectionId), eq(mailDecision.outcome, "pending"), isNull(mailDecision.decidedBy)));
  for (const d of pending)
    await queue.enqueue("mail.relevance", { decisionId: d.id }, { queueName: relevanceQueue(connectionId), jobKey: relevanceJobKey(d.id) });
}

export async function scoreDecision(decisionId: string) {
  const [row] = await db
    .select({ d: mailDecision, c: mailConnection })
    .from(mailDecision)
    .innerJoin(mailConnection, eq(mailConnection.id, mailDecision.connectionId))
    .where(eq(mailDecision.id, decisionId));
  if (!row || row.d.outcome !== "pending" || row.d.decidedBy) return; // decided since, or gone
  const { d, c } = row;
  if(!await mailboxOwnerActive(c.id))return;
  if (c.status !== "connected" && c.status !== "error") return;

  let mail;
  try {
    mail = await gmailProvider(await accessToken(c)).getMetadata(d.providerMessageId, { snippet: true });
  } catch (e) {
    if (e instanceof MailAccessLost) return markReconnectNeeded(c.id);
    throw e;
  }
  if (!mail) {
    await db
      .update(mailDecision)
      .set({ outcome: "skipped", decidedBy: "gone" })
      .where(and(eq(mailDecision.id, d.id), eq(mailDecision.outcome, "pending")));
    return;
  }

  if (!await mailboxOwnerActive(c.id)) return;
  let scored;
  try {
    scored = await scoreMail(mail, { task: "relevance", talentId: c.talentId }, true);
  } catch (e) {
    // Ids and codes only: never the subject or preview.
    console.error("mail.relevance failed", d.id, e instanceof ModelError ? e.code : (e as Error)?.name);
    if (e instanceof ModelError && e.code === "not_configured") return; // stays pending; retrying won't help
    throw e;
  }

  // An email that tries to steer the check is never decided as work without a person: at most "Not sure".
  const scoredOutcome = outcomeFor(scored.score);
  const outcome = scored.steered && scoredOutcome === "work" ? "unsure" : scoredOutcome;
  await db.transaction(async (tx) => {
    if(!await lockMailboxOwner(tx,c.id))return;
    const [updated] = await tx
      .update(mailDecision)
      .set({
        outcome,
        decidedBy: "model",
        score: Math.round(scored.score * 1000) / 1000,
        kind: scored.kind,
        classifierVersion: `${RULES_VERSION}+${scored.promptVersion}+${scored.modelVersion}`,
      })
      .where(and(eq(mailDecision.id, d.id), eq(mailDecision.outcome, "pending")))
      .returning({ id: mailDecision.id });
    if (!updated) return;
    if (outcome !== "skipped") await queueFetch(c.id, d.id, tx);
    // Thread memory: the rest of a work thread is work, without asking the model again.
    if (outcome === "work") {
      const joined = await tx
        .update(mailDecision)
        .set({ outcome: "work", decidedBy: "thread", classifierVersion: RULES_VERSION })
        .where(
          and(
            eq(mailDecision.connectionId, c.id),
            eq(mailDecision.providerThreadId, d.providerThreadId),
            eq(mailDecision.outcome, "pending"),
            ne(mailDecision.id, d.id),
          ),
        )
        .returning({ id: mailDecision.id });
      for (const j of joined) await queueFetch(c.id, j.id, tx);
    }
  });
}
