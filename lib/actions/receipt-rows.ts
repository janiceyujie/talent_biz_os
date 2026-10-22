import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payment, paymentReceipt } from "@/lib/db/schema";
import type { Currency } from "@/lib/domain/money";
import { statusAfterReceipts } from "@/lib/domain/workflow";
import type { PaymentReceipt } from "@/lib/types";

// Writing receipts (decision 0021), shared by the payment actions, the intake, and bank notices.
// Not a server action itself: these take the caller's transaction.

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A payment and its receipts, locked for the rest of the transaction; this talent's only. */
export async function lockPayment(tx: Tx, talentId: string, paymentId: string) {
  const [row] = await tx
    .select()
    .from(payment)
    .where(and(eq(payment.id, paymentId), eq(payment.talentId, talentId)))
    .for("update");
  if (!row) return null;
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
  }));
  return { ...row, currency: row.currency as Currency, receipts };
}

export type LockedPayment = NonNullable<Awaited<ReturnType<typeof lockPayment>>>;

/** Adds one receipt row; the payment's status is the caller's to settle (settle below). */
export async function addReceipt(
  tx: Tx,
  p: LockedPayment,
  r: { date: string; cash: number; withheld?: number; note?: string | null; replacesId?: string | null; withdrawn?: boolean; recordedBy: string | null },
) {
  const [row] = await tx
    .insert(paymentReceipt)
    .values({
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
  p.receipts.push({ id: row.id, date: row.receivedOn, cash: row.cash, withheld: row.withheld, note: row.note ?? "", replacesId: row.replacesId, withdrawn: row.withdrawn, recordedAt: row.createdAt.toISOString() });
}

/** Sets the status its receipts now give: settled once covered, or when the rest won't come. */
export async function settle(tx: Tx, p: LockedPayment, rest: "coming" | "closed") {
  const status = statusAfterReceipts(p, rest);
  if (status !== p.status) await tx.update(payment).set({ status }).where(eq(payment.id, p.id));
}
