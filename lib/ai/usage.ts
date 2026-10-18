import "server-only";
import { and, count, eq, gt, inArray, isNull, notInArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiCall } from "@/lib/db/schema";

// Usage limits on AI calls (docs/decisions/0008), counted from ai_call. Only
// real model calls count — replayed recordings cost nothing — and the
// relevance check and payment-notice read on a connected mailbox don't (short,
// cheap, and not the person's action), nor do calls stopped before reaching a model (a file it
// can't read, nothing configured, a missing recording). Limits come from
// the environment until plans and billing exist. A mailbox's own calls have
// their own daily cap (canScore).

const DAY_MS = 24 * 60 * 60 * 1000;
// Failures raised before anything was sent: they cost nothing.
const neverSent = ["unsupported_file", "not_configured", "replay_missing"];
// Run by the mailbox on its own, not by the person.
const mailboxTasks = ["relevance", "payment_notice"];
const counted = () => and(eq(aiCall.replayed, false), or(isNull(aiCall.failureCode), notInArray(aiCall.failureCode, neverSent)));
export const dailyLimit = () => Number(process.env.AI_DAILY_ANALYSES || 50);
const perMessageLimit = () => Number(process.env.AI_MAX_ANALYSES_PER_MESSAGE || 4);

/** Model calls this talent made in the last 24 hours, and the limit. */
export async function dailyUsage(talentId: string) {
  const [row] = await db
    .select({ used: count() })
    .from(aiCall)
    .where(
      and(eq(aiCall.talentId, talentId), counted(), notInArray(aiCall.task, mailboxTasks), gt(aiCall.createdAt, new Date(Date.now() - DAY_MS))),
    );
  const limit = dailyLimit();
  return { used: row.used, limit, remaining: Math.max(0, limit - row.used) };
}

/** Whether a message can be analyzed once more: under both the daily and the per-message limit. */
export async function canAnalyze(talentId: string, messageId: string) {
  const [{ remaining }, [forMessage]] = await Promise.all([
    dailyUsage(talentId),
    db
      .select({ used: count() })
      .from(aiCall)
      .where(and(eq(aiCall.messageId, messageId), counted())),
  ]);
  if (remaining <= 0) return { ok: false as const, reason: "daily" as const };
  if (forMessage.used >= perMessageLimit()) return { ok: false as const, reason: "message" as const };
  return { ok: true as const };
}

/** Email scorings and payment-notice reads a mailbox may run a day (AI_DAILY_RELEVANCE, default 500). */
export const dailyMailboxLimit = () => Number(process.env.AI_DAILY_RELEVANCE || 500);

/**
 * Whether this talent's mailbox may make one more model call today: the
 * relevance check and payment notices don't count toward the analysis limit,
 * so a flood of mail is capped here instead. Over it, emails wait as "Not
 * decided yet" until a later check.
 */
export async function canScore(talentId: string) {
  const [row] = await db
    .select({ used: count() })
    .from(aiCall)
    .where(and(eq(aiCall.talentId, talentId), counted(), inArray(aiCall.task, mailboxTasks), gt(aiCall.createdAt, new Date(Date.now() - DAY_MS))));
  return row.used < dailyMailboxLimit();
}
