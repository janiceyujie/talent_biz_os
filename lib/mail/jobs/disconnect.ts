import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailConnection } from "@/lib/db/schema";
import { open } from "@/lib/keys";
import { OAuthError, revokeToken } from "../oauth";
import { fromColumns, tokenAad } from "../token";

/**
 * mail.disconnect (decision 0013): withdraw our access at Google, then delete
 * the connection. Runs in the worker, the only place that can decrypt the
 * token. If Google can't be reached by the last attempt, the row goes anyway:
 * the token is then unusable to us, and the artist can remove access in their
 * Google account.
 */
export async function disconnectMailbox(connectionId: string, { lastAttempt }: { lastAttempt: boolean }) {
  const [c] = await db.select().from(mailConnection).where(eq(mailConnection.id, connectionId));
  if (!c) return; // already gone: this job ran before
  try {
    await revokeToken(await open(fromColumns(c), tokenAad(c.talentId, c.accountSubject)));
  } catch (e) {
    if (!lastAttempt) throw e;
    // Ids and codes only: never the token.
    console.error("mail.disconnect: couldn't revoke at Google, deleting anyway", connectionId, e instanceof OAuthError ? e.code : (e as Error)?.name);
  }
  await db.delete(mailConnection).where(eq(mailConnection.id, connectionId));
}
