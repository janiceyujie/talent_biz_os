import "server-only";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { auditLog, talent as talentTable, todo } from "@/lib/db/schema";

// Not a server action: called inside the transactions of the actions that
// confirm a message (linking it, or creating a project from it).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * What confirming a message files alongside it: a reply to-do on the sender's
 * reply-by date (allowed at any stage — docs/decisions/0004), and an audit entry.
 * Shared by linking and by creating a project from a message.
 */
export async function confirmFollowUps(
  tx: Tx,
  {
    talentId,
    personId,
    messageId,
    projectId,
    projectTitle,
    replyBy,
  }: { talentId: string; personId: string; messageId: string; projectId: string; projectTitle: string; replyBy: string | null },
) {
  // replyBy is the date the person confirmed (prefilled from the analysis, editable), never the model's guess unseen.
  if (replyBy) {
    // The to-do's title is stored data, written in the confirming person's language.
    const t = await getTranslations("inbox");
    const [{ timeZone }] = await tx.select({ timeZone: talentTable.timeZone }).from(talentTable).where(eq(talentTable.id, talentId));
    await tx.insert(todo).values({
      talentId,
      projectId,
      messageId,
      type: "reply",
      title: t("replyTodo", { title: projectTitle }).slice(0, 200),
      dueDate: replyBy,
      timeZone,
    });
  }
  await tx.insert(auditLog).values({
    talentId,
    actorPersonId: personId,
    action: "message.confirmed",
    targetType: "message",
    targetId: messageId,
    details: { projectId },
  });
}
