"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { payment, paymentReceipt, person } from "@/lib/db/schema";

/** Resolve only actors referenced by this authorized payment; never return email addresses. */
export async function getPaymentReceiptActors(paymentId: string): Promise<Record<string, string> | null> {
  const { talent: current } = await requireTalent();
  if (!z.uuid().safeParse(paymentId).success) return null;
  const [row] = await db.select({id:payment.id}).from(payment)
    .where(and(eq(payment.id, paymentId), eq(payment.talentId, current.id)));
  if (!row) return null;
  const receipts=await db.select({recordedBy:paymentReceipt.recordedBy}).from(paymentReceipt).where(and(eq(paymentReceipt.paymentId,paymentId),eq(paymentReceipt.talentId,current.id)));
  const ids = [...new Set(receipts.flatMap(r => r.recordedBy && z.uuid().safeParse(r.recordedBy).success ? [r.recordedBy] : []))];
  if (!ids.length) return {};
  const actors = await db.select({id:person.id,name:person.displayName}).from(person).where(inArray(person.id, ids));
  return Object.fromEntries(actors.map(actor => [actor.id, actor.name]));
}
