import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailConnection } from "@/lib/db/schema";
import { queue } from "@/lib/queue";
import { mailQueue, syncJobKey } from "@/lib/queue/jobs";
import { acknowledge, pullNotices } from "../pubsub";

// How new mail is noticed without Sync now (decision 0013):
//   - mail.reconcile, on the worker's schedule: a sync for every connected
//     mailbox. Every 15 minutes with push, as a safety net for missed notices;
//     every 2 minutes without it, as the only way mail arrives.
//   - push: Gmail's notices, pulled from Pub/Sub (../pubsub.ts), start a sync
//     for the mailbox they name.
// A sync already waiting is replaced, not doubled (syncJobKey).

const queueSync = (connectionIds: string[]) =>
  Promise.all(connectionIds.map((id) => queue.enqueue("mail.sync", { connectionId: id }, { queueName: mailQueue(id), jobKey: syncJobKey(id) })));

/** mail.reconcile: a sync for every mailbox that's connected. */
export async function reconcile() {
  const connected = await db.select({ id: mailConnection.id }).from(mailConnection).where(eq(mailConnection.status, "connected"));
  await queueSync(connected.map((c) => c.id));
}

/** One pull from Pub/Sub: a sync for each connected mailbox a notice names, then the notices are acknowledged. */
export async function handleNotices() {
  const { ackIds, notices } = await pullNotices();
  const addresses = [...new Set(notices.map((n) => n.emailAddress))];
  if (addresses.length) {
    const named = await db
      .select({ id: mailConnection.id })
      .from(mailConnection)
      .where(and(eq(mailConnection.status, "connected"), inArray(sql`lower(${mailConnection.accountEmail})`, addresses)));
    await queueSync(named.map((c) => c.id));
  }
  await acknowledge(ackIds); // after the syncs are queued: a crash before this only means a notice comes again
  return ackIds.length;
}
