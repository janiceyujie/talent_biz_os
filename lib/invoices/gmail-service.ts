import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoice, mailConnection, talent } from "@/lib/db/schema";
import { grantsDrafts, grantsGmail } from "@/lib/mail/scope";
import { queue } from "@/lib/queue";
import { dateInZone } from "@/lib/domain/dates";
import { invoiceAmounts, sameAmounts } from "./domain";
import { InvoiceError, invoiceOwner, invoiceReceivable } from "./service";
import { invoiceGmailMode } from "./gmail-config";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function invoiceMailbox(tx: Pick<Tx, "select">, talentId: string, personId?: string) {
  const [c] = await tx.select().from(mailConnection).where(and(
    eq(mailConnection.talentId, talentId), eq(mailConnection.provider, "gmail"),
    inArray(mailConnection.status, ["connected", "error"]),
    personId ? eq(mailConnection.connectedBy, personId) : undefined,
  ));
  return c && grantsDrafts(c.scopes) && grantsGmail(c.scopes) ? c : null;
}

export async function draftJob(tx: Tx, row: typeof invoice.$inferSelect, mode: "create" | "sync") {
  await queue.enqueue("invoice.gmail", { talentId: row.talentId, invoiceId: row.id, revision: row.revision, mode }, {
    tx, queueName: `invoice:${row.id}`, jobKey: `invoice.gmail:${row.id}:${row.revision}:${mode}`,
  });
}

export async function queueInvoiceDraft(tx: Tx, row: typeof invoice.$inferSelect, personId: string) {
  if (invoiceGmailMode() === "disabled") throw new InvoiceError("gmailDisabled");
  const c = await invoiceMailbox(tx, row.talentId, personId);
  if (!c || (row.gmailAccountSubject && row.gmailAccountSubject !== c.accountSubject)) throw new InvoiceError("gmailAuthorization");
  await tx.update(invoice).set({ status: "draft_queued", approvedBy: personId,
    gmailConnectionId: c.id, gmailAccountSubject: c.accountSubject, gmailAccountEmail: c.accountEmail, gmailError: null,
  }).where(and(eq(invoice.id, row.id), eq(invoice.talentId, row.talentId)));
  await draftJob(tx, row, "create");
}

export async function requestInvoiceDraft(talentId: string, personId: string, id: string, revision: number) {
  await db.transaction(async tx => {
    await invoiceOwner(tx, talentId, personId);
    const [row] = await tx.select().from(invoice).where(and(eq(invoice.id, id), eq(invoice.talentId, talentId)));
    if (!row) throw new InvoiceError("notFound");
    const p = await invoiceReceivable(tx, talentId, row.paymentId);
    const [locked] = await tx.select().from(invoice).where(and(eq(invoice.id, id), eq(invoice.talentId, talentId))).for("update");
    if (locked.revision !== revision || locked.status !== "draft") throw new InvoiceError("changed");
    const [t] = await tx.select().from(talent).where(eq(talent.id, talentId));
    if (locked.issueOn > dateInZone(t.timeZone)) throw new InvoiceError("notReady");
    if (!sameAmounts(locked.snapshot, invoiceAmounts(p))) throw new InvoiceError("amountChanged");
    await queueInvoiceDraft(tx, locked, personId);
  });
}

export async function requestInvoiceSync(talentId: string, personId: string, id: string, revision: number) {
  await db.transaction(async tx => {
    await invoiceOwner(tx, talentId, personId);
    const [row] = await tx.select().from(invoice).where(and(eq(invoice.id, id), eq(invoice.talentId, talentId))).for("update");
    if (!row || row.revision !== revision || !["gmail_draft", "draft_unknown", "draft_missing"].includes(row.status)) throw new InvoiceError("changed");
    if (invoiceGmailMode() === "disabled") throw new InvoiceError("gmailDisabled");
    await draftJob(tx, row, "sync");
  });
}

/** Bounded periodic reconciliation never recreates or overwrites a Gmail draft. */
export async function scheduleInvoiceDraftChecks() {
  await db.update(invoice).set({status:"draft_unknown", gmailError:"draftUnknown"}).where(and(
    eq(invoice.status,"draft_creating"), sql`${invoice.updatedAt} < now() - interval '5 minutes'`,
  ));
  if (invoiceGmailMode() === "disabled") return;
  const rows = await db.select().from(invoice).where(and(
    inArray(invoice.status,["gmail_draft","draft_unknown","draft_missing"]),
    sql`(${invoice.gmailCheckedAt} is null or ${invoice.gmailCheckedAt} < now() - interval '5 minutes')`,
  )).orderBy(sql`${invoice.gmailCheckedAt} asc nulls first`).limit(20);
  for (const row of rows) await db.transaction(async tx => {
    await draftJob(tx,row,"sync");
    await tx.update(invoice).set({gmailCheckedAt:new Date()}).where(and(eq(invoice.id,row.id),eq(invoice.talentId,row.talentId)));
  });
}
