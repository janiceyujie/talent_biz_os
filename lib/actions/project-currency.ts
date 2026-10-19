"use server";

import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, invoice, payment, person as personTable, project } from "@/lib/db/schema";
import { supportedCurrencies } from "@/lib/domain/money";
import { currencyCorrectionPreservesAmounts } from "@/lib/domain/currency-correction";
import { paymentBalance, receiptHistory } from "@/lib/domain/payment-receipts";
import { errorText } from "./validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const inputSchema = z.object({projectId: z.uuid(), currency: z.enum(supportedCurrencies)});
const saveSchema = inputSchema.extend({token: z.string().length(64), requestId: z.uuid(), reason: z.string().trim().min(1).max(500), confirmed: z.literal(true)});

async function snapshot(tx: Tx, talentId: string, projectId: string) {
  const [p] = await tx.select().from(project).where(and(eq(project.id, projectId), eq(project.talentId, talentId))).for("update");
  if (!p) return null;
  // All payment writers take the parent lock before inserting or moving a linked row.
  const rows = await tx.select().from(payment).where(and(eq(payment.projectId, projectId), eq(payment.talentId, talentId))).orderBy(asc(payment.id)).for("update");
  const income = rows.filter(row => row.direction === "in");
  const docs = income.length ? await tx.select().from(invoice).where(and(eq(invoice.talentId, talentId), inArray(invoice.paymentId, income.map(row => row.id)))).orderBy(asc(invoice.id)).for("update") : [];
  const token = createHash("sha256").update(JSON.stringify({p, rows, docs})).digest("hex");
  return {p, rows, income, docs, token};
}
function plan(s: NonNullable<Awaited<ReturnType<typeof snapshot>>>, currency: string) {
  const activeDocuments = s.docs.filter(d => d.status !== "cancelled");
  const external = s.income.filter(p => p.invoiceRef && !s.docs.some(d => d.paymentId === p.id && d.number === p.invoiceRef && d.status === "cancelled"));
  const precision = !currencyCorrectionPreservesAmounts({amount: s.p.quotedAmount ?? 0, taxRate: s.p.taxRate, taxIncluded: s.p.taxIncluded, currency:s.p.quoteCurrency, status:"expected", settledAmount:null}, currency) || s.income.some(p => !currencyCorrectionPreservesAmounts(p, currency));
  return {token: s.token, from: s.p.quoteCurrency, to: currency, title: s.p.title, quotedAmount: s.p.quotedAmount,
    costs: s.rows.filter(p => p.direction === "out").length,
    payments: s.income.map(p => ({id:p.id, label:p.label, amount:p.amount, currency:p.currency, ...paymentBalance(p), receipts:receiptHistory(p).length, voided:!!p.voidedAt})),
    documents:activeDocuments.map(d => ({id:d.id, number:d.number})), external:external.map(p => ({id:p.id, label:p.label, number:p.invoiceRef})),
    blocked: activeDocuments.length || external.length ? "documents" as const : precision ? "precision" as const : s.income.some(p => p.currency !== s.p.quoteCurrency) ? "mixed" as const : null};
}

export async function previewProjectCurrency(raw: unknown) {
  const {talent} = await requireTalent(); const fail = await errorText();
  const input = inputSchema.safeParse(raw);
  if (!input.success) return {error: fail("invalid")};
  return db.transaction(async tx => {
    const s = await snapshot(tx, talent.id, input.data.projectId);
    if (!s) return {error:fail("projectNotFound")};
    const history = await tx.select({id:auditLog.id, at:auditLog.createdAt, actor:personTable.displayName, details:auditLog.details}).from(auditLog)
      .leftJoin(personTable, eq(personTable.id, auditLog.actorPersonId))
      .where(and(eq(auditLog.talentId,talent.id),eq(auditLog.targetId,s.p.id),eq(auditLog.action,"project.currency_corrected")))
      .orderBy(desc(auditLog.createdAt)).limit(10);
    return {...plan(s,input.data.currency), history:history.map(h=>({id:h.id, at:h.at.toISOString(), actor:h.actor, from:String(h.details?.from ?? ""), to:String(h.details?.to ?? ""), reason:String(h.details?.reason ?? "")}))};
  });
}

export async function correctProjectCurrency(raw: unknown): Promise<string | null> {
  const {person, talent} = await requireTalent(); const fail = await errorText();
  const input = saveSchema.safeParse(raw); if (!input.success) return fail("invalid");
  const v = input.data;
  const result = await db.transaction(async tx => {
    const s = await snapshot(tx,talent.id,v.projectId); if (!s) return fail("projectNotFound");
    const [retry] = await tx.select().from(auditLog).where(and(eq(auditLog.id,v.requestId),eq(auditLog.talentId,talent.id)));
    if (retry) return retry.targetId === v.projectId && retry.action === "project.currency_corrected" && retry.details?.to === v.currency && retry.details?.reason === v.reason && retry.actorPersonId === person.personId && s.p.quoteCurrency === v.currency ? null : fail("currencyCorrectionChanged");
    if (s.token !== v.token || s.p.quoteCurrency === v.currency) return fail("currencyCorrectionChanged");
    const review = plan(s,v.currency);
    if (review.blocked) return fail("currencyCorrectionBlocked");
    await tx.update(project).set({quoteCurrency:v.currency}).where(and(eq(project.id,s.p.id),eq(project.talentId,talent.id)));
    for (const p of s.income) await tx.update(payment).set({currency:v.currency}).where(and(eq(payment.id,p.id),eq(payment.talentId,talent.id)));
    // Receipt arrays and cancelled invoice snapshots remain intact. The audit keeps their original currency context.
    await tx.insert(auditLog).values({id:v.requestId,talentId:talent.id,actorPersonId:person.personId,action:"project.currency_corrected",targetType:"project",targetId:s.p.id,
      details:{from:s.p.quoteCurrency,to:v.currency,reason:v.reason,quotedAmount:s.p.quotedAmount,payments:s.income.map(p=>({id:p.id,label:p.label,currency:p.currency,amount:p.amount,taxRate:p.taxRate,taxIncluded:p.taxIncluded,settledAmount:p.settledAmount,receipts:receiptHistory(p),balance:paymentBalance(p)})),unchangedCosts:review.costs}});
    return null;
  });
  if (!result) refresh(); return result;
}
