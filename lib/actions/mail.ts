"use server";

import { and, eq, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { mailConnection } from "@/lib/db/schema";
import { queue } from "@/lib/queue";
import { mailQueue } from "@/lib/queue/jobs";
import { errorText } from "./validation";

// The connected mailbox in Settings (decision 0013). Connecting itself is a
// round trip through Google: app/api/mail/connect and callback.

/**
 * Disconnect Gmail: the row is marked at once, and the worker revokes the
 * token at Google and deletes it (the web service can't decrypt tokens).
 */
export async function disconnectGmail(): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const found = await db.transaction(async (tx) => {
    const [c] = await tx
      .update(mailConnection)
      .set({ status: "disconnecting" })
      .where(and(eq(mailConnection.talentId, talent.id), ne(mailConnection.status, "disconnecting")))
      .returning({ id: mailConnection.id });
    if (c)
      await queue.enqueue("mail.disconnect", { connectionId: c.id }, { tx, queueName: mailQueue(c.id), jobKey: `mail.disconnect:${c.id}` });
    return !!c;
  });
  if (!found) return fail("gmailNotConnected");
  refresh();
  return null;
}
