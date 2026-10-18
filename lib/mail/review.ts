import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailConnection, mailDecision, membership } from "@/lib/db/schema";
import { queue, type Queue } from "@/lib/queue";
import { mailQueue } from "@/lib/queue/jobs";
import { mailPipelineEnabled } from "./config";

export type ReviewChoice = "skip" | "restore" | "import";
/** Owner authorization is repeated under a lock; a queued import can be cancelled before it commits. */
export async function reviewMail(talentId: string, personId: string, id: string, choice: ReviewChoice, jobs: Queue = queue) {
  if (!mailPipelineEnabled()) return "disabled" as const;
  return db.transaction(async tx => {
    const [c] = await tx.select().from(mailConnection).where(and(eq(mailConnection.talentId,talentId),eq(mailConnection.status,"connected"))).for("update");
    if (!c) return "unavailable" as const;
    const owner = await tx.select({id:membership.id}).from(membership).where(and(eq(membership.talentId,talentId),eq(membership.personId,personId),eq(membership.role,"owner"),eq(membership.status,"active"))).for("share");
    if (!owner.length) return "unavailable" as const;
    const [d] = await tx.select().from(mailDecision).where(and(eq(mailDecision.id,id),eq(mailDecision.talentId,talentId),eq(mailDecision.connectionId,c.id))).for("update");
    if (!d || d.messageId) return "unavailable" as const;
    if (choice === "import" && (d.kind === "payment" || d.outcome === "skipped" || d.outcome === "pending")) return "review_required" as const;
    if (choice === "import" && d.importStatus === "queued") return null;
    await tx.update(mailDecision).set({outcome:choice === "skip" ? "skipped" : choice === "restore" ? "unsure" : d.outcome,
      decidedBy:"person",
      requestedBy:personId,
      importStatus:choice === "import" ? "queued" : "idle",importFailure:null}).where(eq(mailDecision.id,id));
    if (choice === "import") await jobs.enqueue("mail.review",{decisionId:id,mode:"import"},{tx,queueName:mailQueue(c.id),jobKey:`mail.review:${id}`});
    return null;
  });
}
