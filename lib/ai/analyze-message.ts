import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { message, messageAnalysis, talent } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { toLocale, type Locale } from "@/lib/i18n/config";
import { extractMessage } from "./extract";
import { ModelError } from "./model";

/** Analyze one message and store a new analysis version. Marks the message analyzed, or error with the reason. */
export async function analyzeMessage(messageId: string, outputLocale: Locale) {
  const [row] = await db
    .select({ talentId: message.talentId, body: message.bodyText, receivedAt: message.receivedAt, timeZone: talent.timeZone })
    .from(message)
    .innerJoin(talent, eq(talent.id, message.talentId))
    .where(eq(message.id, messageId));
  if (!row) return;
  try {
    const { analysis, modelVersion, promptVersion } = await extractMessage({
      body: row.body ?? "",
      today: dateInZone(row.timeZone, 0, row.receivedAt),
      timeZone: row.timeZone,
      outputLocale: toLocale(outputLocale),
    });
    await db.transaction(async (tx) => {
      await tx.insert(messageAnalysis).values({
        messageId,
        talentId: row.talentId,
        intent: analysis.intent,
        analysis,
        confidence: analysis.confidence,
        modelVersion,
        promptVersion,
      });
      await tx
        .update(message)
        .set({ status: "analyzed", failure: null })
        .where(and(eq(message.id, messageId), eq(message.status, "pending")));
    });
  } catch (e) {
    const failure = e instanceof ModelError ? e.message : "Unexpected error while analyzing";
    if (!(e instanceof ModelError)) console.error("analyzeMessage", e);
    await db
      .update(message)
      .set({ status: "error", failure: failure.slice(0, 500) })
      .where(and(eq(message.id, messageId), eq(message.status, "pending")));
  }
}
