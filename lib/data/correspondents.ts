import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { message, messageAnalysis, projectCorrespondent } from "@/lib/db/schema";
import { correspondentsOf } from "@/lib/mail/correspondents";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Record who a message just filed on a project is with (decision 0019), in the
 * transaction that files it: each one's latest name and time, and one more
 * message. Every way of filing a message calls this.
 */
export async function recordCorrespondents(tx: Tx, talentId: string, projectId: string, messageId: string) {
  const [m] = await tx
    .select({ kind: message.kind, direction: message.direction, sender: message.sender, recipients: message.recipients, receivedAt: message.receivedAt })
    .from(message)
    .where(and(eq(message.id, messageId), eq(message.talentId, talentId)));
  if (!m) return;
  // A pasted message has no header: the email its analysis found, if any.
  const [a] =
    m.sender || m.direction === "sent"
      ? []
      : await tx
          .select({ email: sql<string>`coalesce(${messageAnalysis.analysis} #>> '{counterparty,email}', '')`, name: sql<string>`coalesce(${messageAnalysis.analysis} #>> '{counterparty,name}', '')` })
          .from(messageAnalysis)
          .where(eq(messageAnalysis.messageId, messageId))
          .orderBy(desc(messageAnalysis.createdAt))
          .limit(1);
  const who = correspondentsOf(m, a?.email ?? "", a?.name ?? "");
  if (!who.length) return;
  await tx
    .insert(projectCorrespondent)
    .values(who.map((w) => ({ talentId, projectId, email: w.address, name: w.name.slice(0, 200), lastAt: m.receivedAt })))
    .onConflictDoUpdate({
      target: [projectCorrespondent.projectId, projectCorrespondent.email],
      set: {
        name: sql`coalesce(nullif(excluded.name, ''), ${projectCorrespondent.name})`,
        lastAt: sql`greatest(excluded.last_at, ${projectCorrespondent.lastAt})`,
        messageCount: sql`${projectCorrespondent.messageCount} + 1`,
      },
    });
}

/** The projects a sender corresponds on, by email: what matching reads instead of past messages. */
export async function correspondentsFor(talentId: string, email: string) {
  if (!email) return [];
  return db
    .select({ projectId: projectCorrespondent.projectId, email: projectCorrespondent.email, name: projectCorrespondent.name, lastAt: projectCorrespondent.lastAt })
    .from(projectCorrespondent)
    .where(and(eq(projectCorrespondent.talentId, talentId), eq(projectCorrespondent.email, email.trim().toLowerCase())));
}
