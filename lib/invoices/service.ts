import "server-only";
import { billingDocumentKind, defaultDocumentKind, isBillingCurrency } from "./document";
import { randomUUID } from "node:crypto";
import { appendReceipt, paymentBalance } from "@/lib/domain/payment-receipts";
import { and, count, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  invoice,
  invoiceCounter,
  membership,
  payment,
  project,
  talent,
} from "@/lib/db/schema";
import { isSigned } from "@/lib/domain/phases";
import { dateInZone } from "@/lib/domain/dates";
import { decodePageCursor, encodePageCursor } from "@/lib/data/page-cursor";
import { z } from "zod";
import {
  invoiceAmounts,
  invoiceInput,
  sameAmounts,
  validInvoiceReceiptDate,
} from "./domain";
import { invoiceGmailMode } from "./gmail-config";
import { invoiceMailbox, queueInvoiceDraft, requestInvoiceDraft, scheduleInvoiceDraftChecks } from "./gmail-service";
import { sameTaxBasis } from "./tax";
import type { InvoiceSnapshot } from "./types";
import type { InvoiceDetail, InvoiceSummary } from "./types";

export class InvoiceError extends Error {}
const fail = (key: string): never => {
  throw new InvoiceError(key);
};
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function invoiceOwner(tx: Tx, talentId: string, personId: string) {
  const [row] = await tx
    .select()
    .from(membership)
    .where(
      and(
        eq(membership.talentId, talentId),
        eq(membership.personId, personId),
        eq(membership.role, "owner"),
        eq(membership.status, "active"),
      ),
    )
    .for("share");
  if (!row) fail("forbidden");
}
export async function invoiceReceivable(
  tx: Tx,
  talentId: string,
  paymentId: string,
  checkProject = true,
) {
  const [p] = await tx
    .select()
    .from(payment)
    .where(and(eq(payment.id, paymentId), eq(payment.talentId, talentId)))
    .for("update");
  if (
    !p ||
    p.direction !== "in" ||
    !isBillingCurrency(p.currency) ||
    p.voidedAt ||
    paymentBalance(p).remaining <= 0
  )
    return fail("payment");
  if (checkProject && p.projectId) {
    const [pr] = await tx
      .select()
      .from(project)
      .where(and(eq(project.id, p.projectId), eq(project.talentId, talentId)));
    if (!pr || pr.archivedAt || !isSigned(pr.stage)) fail("payment");
  }
  return p;
}
async function day(tx: Tx, talentId: string) {
  const [t] = await tx.select().from(talent).where(eq(talent.id, talentId));
  return dateInZone(t.timeZone);
}

import { resolveCatalogueTax } from "../tax/service";

export async function saveInvoice(
  talentId: string,
  personId: string,
  raw: unknown,
) {
  const parsed = invoiceInput.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const input = parsed.data;
  return db.transaction(async (tx) => {
    await invoiceOwner(tx, talentId, personId);
    const p = await invoiceReceivable(tx, talentId, input.paymentId);
    const today = await day(tx, talentId);
    const documentKind = input.documentKind ?? defaultDocumentKind(p.currency);
    // This release keeps US tax review separate from Taiwan payment requests.
    if ((p.currency === "TWD" && documentKind !== "tw_payment_request") ||
      (input.taxReview && (documentKind !== "commercial_invoice" || p.currency !== "USD"))) fail("invalid");
    if (input.dueOn < today) fail("pastDue");
    if (input.paymentBasis && !sameTaxBasis(p, input.paymentBasis)) fail("amountChanged");
    const taxEvidence = input.taxReview?.catalogue ? await resolveCatalogueTax(input.taxReview.catalogue, tx) : undefined;
    if (input.taxReview?.catalogue) {
      const review = input.taxReview;
      if (review.catalogue!.state !== review.state || review.catalogue!.location !== review.location
        || taxEvidence?.status !== "ready" || taxEvidence.rate !== review.rate || taxEvidence.treatment !== review.treatment || taxEvidence.source !== review.source) fail("invalid");
    }
    const reviewedPayment = input.taxReview
      ? { ...p, taxRate: input.taxReview.rate, taxIncluded: input.taxReview.included }
      : p;
    const updatePaymentTax = async () => {
      if (!input.taxReview) return;
      await tx.update(payment).set({ taxRate: reviewedPayment.taxRate, taxIncluded: reviewedPayment.taxIncluded })
        .where(and(eq(payment.id, p.id), eq(payment.talentId, talentId)));
    };
    const snapshot: InvoiceSnapshot = {
      documentKind,
      documentLanguage: input.documentLanguage,
      sellerName: input.sellerName,
      sellerAddress: input.sellerAddress,
      sellerEmail: input.sellerEmail,
      buyerName: input.buyerName,
      buyerAddress: input.buyerAddress,
      recipient: input.recipient,
      description: input.description,
      paymentInstructions: input.paymentInstructions,
      taxNote: input.taxNote,
      subject: input.subject,
      body: input.body,
      ...(input.taxReview ? { taxReview: { ...input.taxReview, method: taxEvidence?.status === "ready" ? "catalogueReviewed" as const : "manual" as const, reviewedAt: new Date().toISOString(), ...(taxEvidence?.status === "ready" ? { evidence: taxEvidence } : {}) } } : {}),
      ...invoiceAmounts(reviewedPayment),
    };
    const mailbox = input.autoGmailDraft ? await invoiceMailbox(tx, talentId, personId) : null;
    if (input.autoGmailDraft && !mailbox) fail("gmailAuthorization");
    if (input.autoGmailDraft && invoiceGmailMode() === "disabled") fail("gmailDisabled");
    const values = {
      autoGmailDraft: input.autoGmailDraft,
      approvedBy: input.autoGmailDraft ? personId : null,
      gmailConnectionId: mailbox?.id ?? null,
      gmailAccountSubject: mailbox?.accountSubject ?? null,
      gmailAccountEmail: mailbox?.accountEmail ?? null,
      gmailError: null,
      issueOn: input.issueOn,
      dueOn: input.dueOn,
      snapshot,
      status:
        input.issueOn > today ? ("scheduled" as const) : ("draft" as const),
      projectId: p.projectId,
    };
    if (input.id) {
      const [existing] = await tx
        .select()
        .from(invoice)
        .where(and(eq(invoice.id, input.id), eq(invoice.talentId, talentId)))
        .for("update");
      if (!existing) return fail("notFound");
      if (
        !["draft", "scheduled"].includes(existing.status) ||
        existing.revision !== input.revision ||
        existing.paymentId !== p.id
      )
        fail("changed");
      await updatePaymentTax();
      const [saved] = await tx.update(invoice)
        .set({ ...values, revision: existing.revision + 1, storageKey: null, messageId: null })
        .where(and(eq(invoice.id, existing.id), eq(invoice.talentId, talentId))).returning();
      if (input.autoGmailDraft && saved.status === "draft") await queueInvoiceDraft(tx, saved, personId);
      return { id: existing.id };
    }
    const [duplicate] = await tx
      .select({ id: invoice.id })
      .from(invoice)
      .where(and(eq(invoice.paymentId, p.id), ne(invoice.status, "cancelled")));
    if (duplicate) fail("duplicate");
    if (p.invoiceRef) {
      const [cancelled] = await tx
        .select({ id: invoice.id })
        .from(invoice)
        .where(
          and(
            eq(invoice.paymentId, p.id),
            eq(invoice.talentId, talentId),
            eq(invoice.number, p.invoiceRef),
            eq(invoice.status, "cancelled"),
          ),
        );
      if (!cancelled) fail("externalInvoice");
    }
    await updatePaymentTax();
    const [seq] = await tx
      .insert(invoiceCounter)
      .values({ talentId, value: 1 })
      .onConflictDoUpdate({
        target: invoiceCounter.talentId,
        set: { value: sql`${invoiceCounter.value}+1` },
      })
      .returning();
    const [row] = await tx
      .insert(invoice)
      .values({
        ...values,
        talentId,
        paymentId: p.id,
        number: `${documentKind === "tw_payment_request" ? "PR" : "INV"}-${String(seq.value).padStart(6, "0")}`,
      })
      .returning();
    if (input.autoGmailDraft && row.status === "draft") await queueInvoiceDraft(tx, row, personId);
    return {id: row.id};
  });
}

/** Idempotent preparation, including dates missed while the worker was offline. Never sends mail. */
export async function prepareInvoices() {
  // A terminated request must not cause an automatic retry of an uncertain delivery.
  await db
    .update(invoice)
    .set({ status: "delivery_unknown" })
    .where(
      and(
        eq(invoice.status, "sending"),
        sql`${invoice.updatedAt} < now() - interval '5 minutes'`,
      ),
    );
  const due = await db
    .update(invoice)
    .set({ status: "draft" })
    .where(
      and(
        eq(invoice.status, "scheduled"),
        sql`${invoice.issueOn} <= (select (now() at time zone ${talent.timeZone})::date from ${talent} where ${talent.id}=${invoice.talentId})`,
      ),
    )
    .returning();
  const waiting = await db.select().from(invoice).where(and(eq(invoice.status,"draft"),eq(invoice.autoGmailDraft,true))).limit(20);
  for (const row of waiting) {
    if (!row.approvedBy) continue;
    try { await requestInvoiceDraft(row.talentId,row.approvedBy,row.id,row.revision); }
    catch(e) { await db.update(invoice).set({gmailError:e instanceof InvoiceError ? e.message : "gmailUnavailable"}).where(and(eq(invoice.id,row.id),eq(invoice.talentId,row.talentId),eq(invoice.status,"draft"))); }
  }
  await scheduleInvoiceDraftChecks();
  return due.map(row=>({id:row.id}));
}
const cursorSchema = z.object({
  talentId: z.uuid(),
  projectId: z.string(),
  readyOnly: z.boolean(),
  created: z.string(),
  id: z.uuid(),
});
export async function listInvoices(
  talentId: string,
  projectId = "",
  cursor = "",
  readyOnly = false,
) {
  const c = decodePageCursor(cursor, cursorSchema);
  if (
    c &&
    (c.talentId !== talentId ||
      c.projectId !== projectId ||
      c.readyOnly !== readyOnly)
  )
    fail("invalid");
  const filter = and(
    eq(invoice.talentId, talentId),
    projectId ? eq(invoice.projectId, projectId) : undefined,
    readyOnly
      ? inArray(invoice.status, ["draft", "delivery_unknown", "gmail_draft", "draft_unknown", "draft_missing"])
      : undefined,
  );
  const [total] = await db
    .select({ value: count() })
    .from(invoice)
    .where(filter);
  const rows = await db
    .select({
      row: invoice,
      payment: payment,
      stamp: sql<string>`${invoice.createdAt}::text`,
    })
    .from(invoice)
    .innerJoin(
      payment,
      and(eq(payment.id, invoice.paymentId), eq(payment.talentId, talentId)),
    )
    .where(
      and(
        filter,
        c
          ? or(
              lt(invoice.createdAt, sql`${c.created}::timestamptz`),
              and(
                eq(invoice.createdAt, sql`${c.created}::timestamptz`),
                lt(invoice.id, c.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(invoice.createdAt), desc(invoice.id))
    .limit(21);
  const shown = rows.slice(0, 20),
    last = shown.at(-1);
  return {
    items: shown.map((r) => summary(r.row, r.payment)),
    total: total.value,
    nextCursor:
      rows.length > 20 && last
        ? encodePageCursor({
            talentId,
            projectId,
            readyOnly,
            created: last.stamp,
            id: last.row.id,
          })
        : null,
  };
}
function summary(
  r: typeof invoice.$inferSelect,
  p: typeof payment.$inferSelect,
): InvoiceSummary {
  const received = p.voidedAt ? 0 : paymentBalance(p).cash;
  return {
    id: r.id,
    number: r.number,
    paymentId: r.paymentId,
    projectId: r.projectId,
    buyerName: r.snapshot.buyerName,
    currency: r.snapshot.currency,
    documentKind: billingDocumentKind(r.snapshot),
    total: r.snapshot.total,
    issueOn: r.issueOn,
    dueOn: r.dueOn,
    status: r.status,
    revision: r.revision,
    paid: !p.voidedAt && paymentBalance(p).remaining === 0,
    received,
    withheld: p.voidedAt ? 0 : paymentBalance(p).withheld,
    remaining: paymentBalance(p).remaining,
  };
}
export async function getInvoice(
  talentId: string,
  id: string,
): Promise<InvoiceDetail | null> {
  const [r] = await db
    .select({ row: invoice, payment: payment })
    .from(invoice)
    .innerJoin(
      payment,
      and(eq(payment.id, invoice.paymentId), eq(payment.talentId, talentId)),
    )
    .where(and(eq(invoice.id, id), eq(invoice.talentId, talentId)));
  if (!r) return null;
  const mailbox = await invoiceMailbox(db,talentId);
  const mode = invoiceGmailMode();
  return {
    ...summary(r.row, r.payment),
    snapshot: r.row.snapshot,
    deliveryMode: "disabled",
    from: r.row.gmailAccountEmail || mailbox?.accountEmail || "",
    autoGmailDraft: r.row.autoGmailDraft,
    gmail: {mode,ready:!!mailbox && mode!=="disabled" && (!r.row.gmailAccountSubject || r.row.gmailAccountSubject===mailbox.accountSubject),account:r.row.gmailAccountEmail || mailbox?.accountEmail || "",error:r.row.gmailError,checkedAt:r.row.gmailCheckedAt?.toISOString()??null},
    sentAt: r.row.sentAt?.toISOString() ?? null,
  };
}
export async function cancelInvoice(
  talentId: string,
  personId: string,
  id: string,
  revision: number,
) {
  return db.transaction(async (tx) => {
    await invoiceOwner(tx, talentId, personId);
    const rows = await tx
      .update(invoice)
      .set({ status: "cancelled", revision: sql`${invoice.revision}+1` })
      .where(
        and(
          eq(invoice.id, id),
          eq(invoice.talentId, talentId),
          eq(invoice.revision, revision),
          inArray(invoice.status, ["scheduled", "draft"]),
        ),
      )
      .returning();
    if (!rows.length) fail("changed");
  });
}

/** Confirm full receipt against the existing receivable, never insert a second revenue row. */
export async function settleInvoice(
  talentId: string,
  personId: string,
  id: string,
  revision: number,
  settledOn: string,
) {
  if (!z.iso.date().safeParse(settledOn).success) fail("invalid");
  return db.transaction(async (tx) => {
    await invoiceOwner(tx, talentId, personId);
    const [r] = await tx
      .select()
      .from(invoice)
      .where(and(eq(invoice.id, id), eq(invoice.talentId, talentId)));
    if (!r || r.status !== "sent" || r.revision !== revision)
      return fail("changed");
    const p = await invoiceReceivable(tx, talentId, r.paymentId, false);
    if (!sameAmounts(r.snapshot, invoiceAmounts(p))) fail("amountChanged");
    if (!validInvoiceReceiptDate(settledOn, r.issueOn, await day(tx, talentId)))
      fail("invalid");
    await tx
      .update(payment)
      .set(appendReceipt(p, { id: randomUUID(), date: settledOn, cash: paymentBalance(p).remaining, reason: "unpaid" }))
      .where(eq(payment.id, p.id));
  });
}

/** The Today reminder needs only a count, not invoice snapshots or PDF data. */
export async function invoiceReviewCount(talentId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(invoice)
    .where(
      and(
        eq(invoice.talentId, talentId),
        inArray(invoice.status, ["draft", "delivery_unknown", "gmail_draft", "draft_unknown", "draft_missing"]),
      ),
    );
  return row;
}

/** Limit availability checks to the caller's currently loaded payment choices. */
export async function availableInvoicePayments(talentId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select({ id: payment.id }).from(payment).where(and(
    eq(payment.talentId, talentId), inArray(payment.id, ids),
    sql`not exists (select 1 from invoice i where i.talent_id = ${talentId} and i.payment_id = ${payment.id} and i.status <> 'cancelled')`,
    sql`(${payment.invoiceRef} is null or ${payment.invoiceRef} = '' or exists (select 1 from invoice i where i.talent_id = ${talentId} and i.payment_id = ${payment.id} and i.number = ${payment.invoiceRef} and i.status = 'cancelled'))`,
  ));
  return rows.map((r) => r.id);
}
