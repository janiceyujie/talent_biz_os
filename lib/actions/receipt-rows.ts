import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payment, paymentReceipt, project, auditLog, notificationState } from "@/lib/db/schema";
import type { Currency } from "@/lib/domain/money";
import { statusAfterReceipts } from "@/lib/domain/workflow";
import type { PaymentReceipt } from "@/lib/types";

// Writing receipts (decision 0021), shared by the payment actions, the intake, and bank notices.
// Not a server action itself: these take the caller's transaction.

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A payment and its receipts, locked for the rest of the transaction; this talent's only. */
export async function lockPayment(tx: Tx, talentId: string, paymentId: string) {
  const [link] = await tx.select({projectId:payment.projectId}).from(payment).where(and(eq(payment.id,paymentId),eq(payment.talentId,talentId)));
  if(!link)return null;
  if(link.projectId)await tx.select({id:project.id}).from(project).where(and(eq(project.id,link.projectId),eq(project.talentId,talentId))).for("update");
  const [row] = await tx
    .select()
    .from(payment)
    .where(and(eq(payment.id, paymentId), eq(payment.talentId, talentId)))
    .for("update");
  if (!row || row.projectId!==link.projectId) return null;
  const rows = await tx.select().from(paymentReceipt).where(eq(paymentReceipt.paymentId, row.id)).orderBy(asc(paymentReceipt.createdAt));
  const receipts: PaymentReceipt[] = rows.map((r) => ({
    id: r.id,
    date: r.receivedOn,
    cash: r.cash,
    withheld: r.withheld,
    note: r.note ?? "",
    replacesId: r.replacesId,
    withdrawn: r.withdrawn,
    recordedAt: r.createdAt.toISOString(),
    recordedBy: r.recordedBy??undefined,
  }));
  return { ...row, currency: row.currency as Currency, receipts };
}

export type LockedPayment = NonNullable<Awaited<ReturnType<typeof lockPayment>>>;

/** Adds one receipt row; the payment's status is the caller's to settle (settle below). */
export async function addReceipt(
  tx: Tx,
  p: LockedPayment,
  r: { id?: string; date: string; cash: number; withheld?: number; note?: string | null; replacesId?: string | null; withdrawn?: boolean; recordedBy: string | null },
) {
  const [row] = await tx
    .insert(paymentReceipt)
    .values({
      ...(r.id?{id:r.id}:{}),
      talentId: p.talentId,
      paymentId: p.id,
      receivedOn: r.date,
      cash: r.cash,
      withheld: r.withheld ?? 0,
      note: r.note || null,
      replacesId: r.replacesId ?? null,
      withdrawn: r.withdrawn ?? false,
      recordedBy: r.recordedBy,
    })
    .returning();
  p.receipts.push({ id: row.id, date: row.receivedOn, cash: row.cash, withheld: row.withheld, note: row.note ?? "", replacesId: row.replacesId, withdrawn: row.withdrawn, recordedAt: row.createdAt.toISOString(), recordedBy:row.recordedBy??undefined });
}

/** Keep uncovered balances open and reopen completed projects after a correction. */
export async function settle(tx: Tx, p: LockedPayment, rest: "coming" | "closed") {
  const status = statusAfterReceipts(p, "coming");
  void rest; // Retain the upstream action signature; shortfalls remain outstanding.
  if (status !== p.status) await tx.update(payment).set({ status }).where(eq(payment.id, p.id));
  const actor=p.receipts.at(-1)?.recordedBy;
  if(status==="expected" && p.projectId){
    const [reopened]=await tx.update(project).set({stage:"collecting_payment",archivedAt:null}).where(and(eq(project.id,p.projectId),eq(project.talentId,p.talentId),eq(project.stage,"closed"))).returning({id:project.id});
    if(reopened)await tx.insert(auditLog).values({talentId:p.talentId,actorPersonId:actor??null,action:"project.stage_changed",targetType:"project",targetId:p.projectId,details:{from:"closed",to:"collecting_payment",reason:"receipt_amended",paymentId:p.id,receiptId:p.receipts.at(-1)?.id}});
  }
  if(status==="expected" && actor && p.dueOn && p.receipts.at(-1)?.replacesId)await tx.delete(notificationState).where(and(eq(notificationState.personId,actor),eq(notificationState.notificationId,`payment:${p.id}:${p.dueOn}`)));
}
