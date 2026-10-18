import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailConnection, mailDecision, membership, message, person } from "@/lib/db/schema";
import { queue, type Queue } from "@/lib/queue";
import { analyzeJobKey } from "@/lib/queue/jobs";
import { toLocale } from "@/lib/i18n/config";
import { accessToken } from "../access";
import { mailPipelineEnabled } from "../config";
import { gmailProvider } from "../gmail";
import { MailProviderError, type MailContentProvider } from "../content";
import { restrictedImport } from "../import-policy";
import { gmailDedupKey } from "./fetch";
const ownerWhere = (talentId:string, personId:string) => and(eq(membership.talentId,talentId),eq(membership.personId,personId),eq(membership.role,"owner"),eq(membership.status,"active"));

/** IDs-only queued work; secrets and Gmail reads remain in the worker. Import never applies a business change. */
export async function processMailReview(decisionId:string,mode:"preview"|"import",injected?:MailContentProvider,jobs:Queue=queue) {
  if (!mailPipelineEnabled()) return;
  const [d] = await db.select().from(mailDecision).where(eq(mailDecision.id,decisionId));
  if (!d || !d.requestedBy || d.messageId || d.outcome === "skipped" || (mode === "import" && d.importStatus !== "queued")) return;
  const [c] = await db.select().from(mailConnection).where(and(eq(mailConnection.id,d.connectionId),eq(mailConnection.talentId,d.talentId),eq(mailConnection.status,"connected")));
  if (!c || !c.connectedBy || !(await db.select({id:membership.id}).from(membership).where(ownerWhere(c.talentId,d.requestedBy))).length || !(await db.select({id:membership.id}).from(membership).where(ownerWhere(c.talentId,c.connectedBy))).length) return;
  try {
    let provider = injected;
    if (!provider) {
      provider = gmailProvider(await accessToken(c));
    }
    let meta = await provider.metadata(d.providerMessageId);
    if (!meta || meta.id !== d.providerMessageId || meta.threadId !== d.providerThreadId) throw new MailProviderError("invalid_response");
    let text: string | null = null;
    if (mode === "import" && !restrictedImport(meta,d.kind)) {
      const content = await provider.content(meta.id);
      if (!content || content.metadata.id !== meta.id || content.metadata.threadId !== meta.threadId || !content.text.trim() || content.text.length > 50_000 || Buffer.byteLength(content.text)>100_000) throw new MailProviderError("invalid_response");
      meta = content.metadata;
      if (!restrictedImport(meta,d.kind)) text = content.text;
    }
    await db.transaction(async tx => {
      const [live] = await tx.select().from(mailConnection).where(and(eq(mailConnection.id,c.id),eq(mailConnection.talentId,c.talentId))).for("update");
      if (!live || live.status !== "connected" || live.connectedBy !== c.connectedBy) return;
      if (!(await tx.select({id:membership.id}).from(membership).where(ownerWhere(c.talentId,d.requestedBy!)).for("share")).length || !(await tx.select({id:membership.id}).from(membership).where(ownerWhere(c.talentId,c.connectedBy!)).for("share")).length) return;
      const [current] = await tx.select().from(mailDecision).where(and(eq(mailDecision.id,d.id),eq(mailDecision.talentId,c.talentId),eq(mailDecision.connectionId,c.id))).for("update");
      if (!current || current.messageId || current.updatedAt.getTime() !== d.updatedAt.getTime() || current.outcome === "skipped") return;
      if (!text) {
        await tx.update(mailDecision).set({importStatus:mode === "import" ? "error" : "idle",importFailure:mode === "import" ? "review_required" : null}).where(eq(mailDecision.id,d.id));
        return;
      }
      // Share identity with the canonical fetch job so old queued imports cannot duplicate mail.
      const key = gmailDedupKey(c.id, d.providerMessageId);
      const [created] = await tx.insert(message).values({talentId:c.talentId,submittedBy:d.requestedBy!,channel:"gmail",externalRef:d.providerMessageId,connectionId:c.id,providerThreadId:d.providerThreadId,sender:meta.from.address,subject:meta.subject,relevance:d.outcome === "unsure" ? "unsure" : "sure",
        receivedAt:new Date(meta.receivedAt),bodyText:text,dedupKey:key,status:"pending"})
        .onConflictDoNothing({target:[message.talentId,message.dedupKey]}).returning({id:message.id});
      const existing = created ?? (await tx.select({id:message.id}).from(message).where(and(eq(message.talentId,c.talentId),eq(message.dedupKey,key))))[0];
      const [requester] = await tx.select({locale:person.locale}).from(person).where(eq(person.id,d.requestedBy!));
      if (created) await jobs.enqueue("message.analyze",{messageId:created.id,locale:toLocale(requester?.locale)},{tx,jobKey:analyzeJobKey(created.id)});
      await tx.update(mailDecision).set({messageId:existing.id,importStatus:"imported",importFailure:null}).where(eq(mailDecision.id,d.id));
    });
  } catch (error) {
    // Provider messages may contain personal content. Persist only a bounded code.
    const code = error instanceof MailProviderError ? error.code : "import_failed";
    await db.update(mailDecision).set({importStatus:"error",importFailure:code}).where(and(eq(mailDecision.id,d.id),eq(mailDecision.talentId,c.talentId),eq(mailDecision.updatedAt,d.updatedAt)));
    throw new Error(`mail_review:${code}`);
  }
}
