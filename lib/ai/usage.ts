import "server-only";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiCall } from "@/lib/db/schema";

// Usage limits on AI calls (docs/decisions/0008), counted from ai_call. Only
// real model calls count — replayed recordings cost nothing. Limits come from
// the environment until plans and billing exist.

const DAY_MS = 24 * 60 * 60 * 1000;
export const dailyLimit = () => Number(process.env.AI_DAILY_ANALYSES || 50);
const perMessageLimit = () => Number(process.env.AI_MAX_ANALYSES_PER_MESSAGE || 4);

/** Model calls this talent made in the last 24 hours, and the limit. */
export async function dailyUsage(talentId: string) {
  const [row] = await db
    .select({ used: count() })
    .from(aiCall)
    .where(and(eq(aiCall.talentId, talentId), eq(aiCall.replayed, false), gt(aiCall.createdAt, new Date(Date.now() - DAY_MS))));
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
      .where(and(eq(aiCall.messageId, messageId), eq(aiCall.replayed, false))),
  ]);
  if (remaining <= 0) return { ok: false as const, reason: "daily" as const };
  if (forMessage.used >= perMessageLimit()) return { ok: false as const, reason: "message" as const };
  return { ok: true as const };
}
