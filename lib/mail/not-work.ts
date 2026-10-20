import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { file, mailDecision, message } from "@/lib/db/schema";
import { removeObjects } from "@/lib/storage";

/**
 * An email brought in that isn't work, said by the person (Not work, or Drop
 * on a payment notice) or by the analysis (decision 0013), or a payment notice
 * left unhandled too long: its body, files, and fields are deleted at once; the
 * decision stays, with the Gmail link, as `not_work`. The same for an email sent
 * in with the Gmail add-on, which has no decision. Returns false when it isn't
 * this talent's email.
 */
export async function dropBroughtIn(talentId: string, messageId: string, decidedBy: "person" | "analysis" | "expired") {
  const [m] = await db
    .select({ id: message.id })
    .from(message)
    .where(and(eq(message.id, messageId), eq(message.talentId, talentId), inArray(message.channel, ["gmail", "gmail_addon"])));
  if (!m) return false;
  const keys = await db.select({ key: file.storageKey }).from(file).where(eq(file.messageId, m.id));
  await removeObjects(keys.map((k) => k.key)); // the bytes first: if this fails, the rows are still there to retry
  await db.transaction(async (tx) => {
    await tx.update(mailDecision).set({ outcome: "not_work", decidedBy, messageId: null }).where(eq(mailDecision.messageId, m.id));
    await tx.delete(message).where(eq(message.id, m.id)); // files and analyses go with it
  });
  return true;
}
