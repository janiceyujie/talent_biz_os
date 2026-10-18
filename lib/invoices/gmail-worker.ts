import "server-only";
import nodemailer from "nodemailer";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoice, mailConnection, payment } from "@/lib/db/schema";
import { accessToken, dropAccessToken, MailAccessLost, markReconnectNeeded } from "@/lib/mail/access";
import { lockMailboxOwner } from "@/lib/mail/owner";
import { grantsDrafts, grantsGmail } from "@/lib/mail/scope";
import { invoiceGmailMode } from "./gmail-config";
import { DraftApiError, invoiceDraftApi, isMatchingSent } from "./gmail-draft-api";
import { getInvoice, invoiceOwner, invoiceReceivable } from "./service";
import { invoiceAmounts, sameAmounts } from "./domain";
import { renderInvoicePdf } from "./pdf";
import { writeBytes } from "@/lib/storage";
import type { JobPayload } from "@/lib/queue/jobs";

/** Runs only in the worker, where decrypt permission belongs. */
export async function processInvoiceGmail(job:JobPayload<"invoice.gmail">) {
  const filter = and(eq(invoice.id,job.invoiceId),eq(invoice.talentId,job.talentId),eq(invoice.revision,job.revision));
  const [row] = await db.select().from(invoice).where(filter);
  if(!row || !row.approvedBy) return;
  const creating = job.mode === "create";
  if(creating && row.status!=="draft_queued") return;
  if(!creating && !["gmail_draft","draft_unknown","draft_missing"].includes(row.status))return;
  const mode = invoiceGmailMode();
  if(mode==="disabled") {
    await db.update(invoice).set({...(creating?{status:"draft" as const}:{}),gmailError:"gmailDisabled",gmailCheckedAt:new Date()}).where(filter);return;
  }
  const [c] = await db.select().from(mailConnection).where(and(
    eq(mailConnection.talentId,job.talentId), eq(mailConnection.provider,"gmail"),
    eq(mailConnection.accountSubject,row.gmailAccountSubject || ""),
  ));
  if(!c || c.accountSubject!==row.gmailAccountSubject || c.connectedBy!==row.approvedBy || !["connected","error"].includes(c.status) || !grantsDrafts(c.scopes) || !grantsGmail(c.scopes)) {
    await db.update(invoice).set({...(creating?{status:"draft" as const}:{}),gmailError:"gmailAuthorization",gmailCheckedAt:new Date()}).where(filter);return;
  }
  let posted=false;
  try {
    // Lock ownership and the receivable before reserving work. No token is exposed to the web service.
    const reserved = await db.transaction(async tx=>{
      await invoiceOwner(tx,job.talentId,row.approvedBy!);
      const current = await lockMailboxOwner(tx,c.id);
      if(!current || current.accountSubject!==row.gmailAccountSubject || current.connectedBy!==row.approvedBy || !grantsDrafts(current.scopes)) throw new Error("gmailAuthorization");
      if(creating) {
        const p=await invoiceReceivable(tx,job.talentId,row.paymentId);
        if(!sameAmounts(row.snapshot,invoiceAmounts(p)))throw new Error("amountChanged");
        const changed=await tx.update(invoice).set({status:"draft_creating",gmailError:null})
          .where(and(filter,eq(invoice.status,"draft_queued"))).returning({id:invoice.id});
        return !!changed.length;
      }
      return true;
    });
    if(!reserved)return;
    const api=invoiceDraftApi(await accessToken(c));
    if(creating) {
      const detail=await getInvoice(job.talentId,row.id);
      if(!detail)throw new Error("notFound");
      const pdf=await renderInvoicePdf(detail,false);
      const key=`${job.talentId}/invoices/${row.id}/${row.revision}.pdf`;
      const messageId=`<invoice-${row.id}-${row.revision}@taloox.local>`;
      await writeBytes(key,pdf,"application/pdf");
      const mime=await nodemailer.createTransport({streamTransport:true,buffer:true,newline:"windows"}).sendMail({
        from:{name:row.snapshot.sellerName,address:c.accountEmail},to:row.snapshot.recipient,
        replyTo:row.snapshot.sellerEmail,subject:row.snapshot.subject,text:row.snapshot.body,messageId,
        attachments:[{filename:`${row.number}.pdf`,content:Buffer.from(pdf),contentType:"application/pdf"}],
        disableFileAccess:true,disableUrlAccess:true,
      });
      await db.transaction(async tx=>{
        await invoiceOwner(tx,job.talentId,row.approvedBy!);
        const current = await lockMailboxOwner(tx,c.id);
        if(!current || current.accountSubject!==row.gmailAccountSubject || current.connectedBy!==row.approvedBy || !grantsDrafts(current.scopes))throw new Error("gmailAuthorization");
        await tx.update(invoice).set({storageKey:key,messageId}).where(filter);
        await tx.update(payment).set({invoiceRef:row.number,dueOn:row.dueOn}).where(and(eq(payment.id,row.paymentId),eq(payment.talentId,job.talentId)));
      });
      if (!Buffer.isBuffer(mime.message)) throw new Error("invalidMime");
      posted=true;
      const draft=await api.create(Buffer.from(mime.message).toString("base64url"));
      if(!draft.id || !draft.message?.id)throw new DraftApiError(0);
      // Gmail may normalize Message-ID. Capture it from the stable draft for later sent matching.
      let trackedMessageId=messageId;
      try {
        const metadata=await api.get(draft.id);
        const actual=metadata.message?.payload?.headers?.find(h=>h.name.toLowerCase()==="message-id")?.value;
        if(actual && /^<[^<>\s]{1,250}>$/.test(actual))trackedMessageId=actual;
      } catch { /* Creation succeeded; later reconciliation can refresh its metadata. */ }
      await db.update(invoice).set({status:"gmail_draft",messageId:trackedMessageId,gmailDraftId:draft.id,gmailMessageId:draft.message.id,gmailCheckedAt:new Date(),gmailError:null})
        .where(and(filter,eq(invoice.status,"draft_creating")));
      return;
    }
    if(row.gmailDraftId) {
      try {
        const draft=await api.get(row.gmailDraftId);
        // Keep the stable draft id and never overwrite the user's edits.
        if(draft.id!==row.gmailDraftId || !draft.message?.id)throw new DraftApiError(0);
        const actual=draft.message.payload?.headers?.find(h=>h.name.toLowerCase()==="message-id")?.value;
        await db.update(invoice).set({status:"gmail_draft",gmailConnectionId:c.id,
          ...(actual && /^<[^<>\s]{1,250}>$/.test(actual) ? {messageId:actual} : {}),
          gmailMessageId:draft.message.id,gmailError:null,gmailCheckedAt:new Date()}).where(filter);
        return;
      } catch(e) {if(!(e instanceof DraftApiError) || e.status!==404)throw e;}
    }
    const found=row.messageId ? await api.find(row.messageId) : {messages:[]};
    const candidates=[];
    for(const ref of found.messages??[]) candidates.push(await api.message(ref.id));
    const sent=candidates.filter(m=>isMatchingSent(m,row.messageId!));
    if(sent.length===1 && !candidates.some(m=>m.labelIds?.includes("DRAFT"))) {
      const stamp=Number(sent[0].internalDate);
      if(!Number.isFinite(stamp)||stamp<=0||stamp>Date.now()+60000)throw new DraftApiError(0);
      await db.update(invoice).set({status:"sent",sentAt:new Date(stamp),gmailMessageId:sent[0].id,gmailError:null,gmailCheckedAt:new Date()}).where(filter);
      return;
    }
    // Recover an ambiguous POST by finding its existing draft, never by POSTing again.
    const matching=candidates.filter(m=>m.labelIds?.includes("DRAFT") && m.payload?.headers?.some(h=>h.name.toLowerCase()==="message-id"&&h.value===row.messageId));
    if(matching.length===1 && sent.length===0) {
      let pageToken:string|undefined;
      for(let page=0;page<5;page++) {
        const list=await api.drafts(pageToken);
        const draft=list.drafts?.find(d=>d.message?.id===matching[0].id);
        if(draft) {
          await db.update(invoice).set({status:"gmail_draft",gmailDraftId:draft.id,gmailMessageId:matching[0].id,gmailError:null,gmailCheckedAt:new Date()}).where(filter);return;
        }
        pageToken=list.nextPageToken;if(!pageToken)break;
      }
    }
    await db.update(invoice).set({status:row.gmailDraftId?"draft_missing":"draft_unknown",gmailError:"draftUnknown",gmailCheckedAt:new Date()}).where(filter);
  } catch(e) {
    if(e instanceof MailAccessLost)await markReconnectNeeded(c.id);
    if(e instanceof DraftApiError && e.status===401)dropAccessToken(c.id);
    const auth=e instanceof Error && e.message==="gmailAuthorization" || e instanceof MailAccessLost || e instanceof DraftApiError && [401,403].includes(e.status);
    // Only failures before attempting a POST are safe to retry from the app.
    await db.update(invoice).set({
      ...(creating?{status:posted?"draft_unknown" as const:"draft" as const}:{}),
      gmailError:auth?"gmailAuthorization":posted?"draftUnknown":"gmailUnavailable",gmailCheckedAt:new Date(),
    }).where(and(filter,inArray(invoice.status,creating?["draft_queued","draft_creating"]:["gmail_draft","draft_unknown","draft_missing"])));
  }
}
