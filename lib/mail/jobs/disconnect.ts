import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { file, mailConnection, message } from "@/lib/db/schema";
import { open } from "@/lib/keys";
import { removeObjects } from "@/lib/storage";
import { accessToken } from "../access";
import { gmailProvider } from "../gmail";
import { OAuthError, revokeToken } from "../oauth";
import { fromColumns, tokenAad } from "../token";

/**
 * mail.disconnect (decision 0013): stop push notices, withdraw our access at Google, remove what
 * the mailbox brought in (all of it, or all but what's filed under a project,
 * as the artist chose), then delete the connection and its decisions. Runs in
 * the worker, the only place that can decrypt the token. If Google can't be
 * reached by the last attempt, the rest goes ahead anyway: the token is then
 * unusable to us, and the artist can remove access in their Google account.
 */
export async function disconnectMailbox(connectionId: string, { lastAttempt, keep }: { lastAttempt: boolean; keep: "filed" | "none" }) {
  const [c] = await db.select().from(mailConnection).where(eq(mailConnection.id, connectionId));
  if (!c) return; // already gone: this job ran before
  // Push notices stop first, while the token still works; revoking ends them within days anyway.
  if (c.watchExpiresAt && c.watchExpiresAt > new Date())
    await gmailProvider(await accessToken(c))
      .stopWatch()
      .catch((e) => console.error("mail.disconnect: couldn't stop the watch", connectionId, (e as Error)?.name));
  try {
    await revokeToken(await open(fromColumns(c), tokenAad(c.talentId, c.accountSubject)));
  } catch (e) {
    if (!lastAttempt) throw e;
    // Ids and codes only: never the token.
    console.error("mail.disconnect: couldn't revoke at Google, deleting anyway", connectionId, e instanceof OAuthError ? e.code : (e as Error)?.name);
  }
  await removeBroughtIn(connectionId, keep);
  await db.delete(mailConnection).where(eq(mailConnection.id, connectionId));
}

/** Delete the messages this mailbox brought in, with their files in storage; "filed" keeps those filed under a project. */
async function removeBroughtIn(connectionId: string, keep: "filed" | "none") {
  const doomed = await db
    .select({ id: message.id })
    .from(message)
    .where(and(eq(message.connectionId, connectionId), keep === "filed" ? isNull(message.projectId) : undefined));
  for (let i = 0; i < doomed.length; i += 500) {
    const ids = doomed.slice(i, i + 500).map((m) => m.id);
    const keys = await db.select({ key: file.storageKey }).from(file).where(inArray(file.messageId, ids));
    await removeObjects(keys.map((k) => k.key)); // the bytes first: a retry still finds the rows
    await db.delete(message).where(inArray(message.id, ids)); // files and analyses go with them
  }
}
