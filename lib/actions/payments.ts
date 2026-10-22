"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { payment, paymentReceipt, project, talent } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { quote, SplitError, splitPayments, supportedCurrencies } from "@/lib/domain/money";
import { isOpenStage } from "@/lib/domain/phases";
import { activeReceipts, paymentTotal } from "@/lib/domain/workflow";
import { checkProjectLink } from "./project-link";
import { addReceipt, lockPayment, settle, type LockedPayment, type Tx } from "./receipt-rows";
import { errorText, firstIssue, optionalId, optionalText } from "./validation";

const money = z.coerce.number().min(0, "amountNegative").max(9_999_999_999.99).multipleOf(0.01, "amountDecimals");
const day = z.iso.date("dateInvalid");
const optionalDay = z
  .union([day, z.literal("")])
  .optional()
  .transform((v) => v || null);
// "" must be tried first: z.coerce.number() would turn "" into 0.
const optionalMoney = z
  .union([z.literal(""), money])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const paymentInput = z
  .object({
    id: optionalId,
    projectId: optionalId,
    label: z.string().trim().min(1, "entryNameRequired").max(200),
    direction: z.enum(["in", "out"]),
    installment: z.enum(["regular", "deposit", "balance"]),
    amount: money,
    currency: z.enum(supportedCurrencies),
    taxRate: z.coerce.number().min(0).max(100, "taxRateRange").multipleOf(0.01),
    taxIncluded: z.boolean(),
    recordedDate: day,
    dueDate: optionalDay,
    // A new entry may be recorded as already received or paid: one receipt, and it's closed.
    // An existing one's money moves through its receipts (recordReceipt), not this form.
    status: z.enum(["expected", "settled"]).default("expected"),
    settledDate: optionalDay,
    settledAmount: optionalMoney,
    invoiceRef: optionalText,
    notes: optionalText,
  })
  .refine((p) => p.status !== "settled" || p.settledDate, {
    message: "settledDateRequired",
  })
  .refine((p) => p.currency !== "JPY" || (Number.isInteger(p.amount) && (p.settledAmount === null || Number.isInteger(p.settledAmount))), {
    message: "amountWholeYen",
  });

async function today(talentId: string) {
  const [row] = await db.select({ timeZone: talent.timeZone }).from(talent).where(eq(talent.id, talentId));
  return dateInZone(row.timeZone);
}

/** Create or update a payment. Returns an error message, or null on success. */
export async function savePayment(data: Record<string, unknown>): Promise<string | null> {
  const { person, talent: current } = await requireTalent();
  const fail = await errorText();
  const parsed = paymentInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { id, ...input } = parsed.data;

  let currentLink: string | null = null;
  if (id) {
    const [row] = await db
      .select({ projectId: payment.projectId })
      .from(payment)
      .where(and(eq(payment.id, id), eq(payment.talentId, current.id)));
    currentLink = row?.projectId ?? null;
  }
  const linkError = await checkProjectLink(current.id, input.projectId, currentLink);
  if (linkError) return fail(linkError);
  const settled = !id && input.status === "settled";
  if (settled && input.settledDate! > (await today(current.id))) return fail("settledDateFuture");

  const values = {
    projectId: input.projectId,
    label: input.label,
    direction: input.direction,
    installment: input.installment,
    amount: input.amount,
    currency: input.currency,
    taxRate: input.taxRate,
    taxIncluded: input.taxIncluded,
    recordedOn: input.recordedDate,
    dueOn: input.dueDate,
    invoiceRef: input.invoiceRef,
    notes: input.notes,
  };

  const failure = await db.transaction(async (tx) => {
    if (!id) {
      const [created] = await tx
        .insert(payment)
        .values({ ...values, talentId: current.id })
        .returning({ id: payment.id });
      if (!settled) return null;
      const p = (await lockPayment(tx, current.id, created.id))!;
      await addReceipt(tx, p, { date: input.settledDate!, cash: input.settledAmount ?? paymentTotal(p), recordedBy: person.personId });
      await settle(tx, p, "closed"); // as before: less than the total is closed short
      return null;
    }
    const p = await lockPayment(tx, current.id, id);
    if (!p) return fail("paymentNotFound");
    const next = { ...p, ...values, currency: input.currency };
    if (input.currency === "JPY" && activeReceipts(p).some((r) => !Number.isInteger(r.cash) || !Number.isInteger(r.withheld)))
      return fail("amountWholeYen");
    await tx
      .update(payment)
      .set(values)
      .where(and(eq(payment.id, id), eq(payment.talentId, current.id)));
    // A new total with money already in: settled if it's now covered, open again if not.
    const retotalled = paymentTotal(p) !== paymentTotal(next) || p.currency !== next.currency;
    if (p.status !== "cancelled" && p.receipts.length && retotalled) await settle(tx, next, "coming");
    return null;
  });
  if (!failure) refresh();
  return failure;
}

const receiptInput = z
  .object({
    date: day,
    cash: money,
    withheld: money.default(0),
    note: z.string().trim().max(500).optional().transform((v) => v || null),
    // With something still left: keep it open, or close it short.
    rest: z.enum(["coming", "closed"]).default("coming"),
  })
  .refine((r) => r.cash + r.withheld > 0, { message: "receiptEmpty" });

/** Checks a receipt against its payment: a live one, a day not ahead, whole yen. */
async function receiptProblem(p: LockedPayment, r: { date: string; cash: number; withheld: number }) {
  if (p.voidedAt || p.status === "cancelled") return "paymentNotOpen" as const;
  if (r.date > (await today(p.talentId))) return "settledDateFuture" as const;
  if (p.currency === "JPY" && (!Number.isInteger(r.cash) || !Number.isInteger(r.withheld))) return "amountWholeYen" as const;
  return null;
}

/**
 * Record money that arrived or was paid against a payment (decision 0021): any part of it, with
 * what was withheld. It's settled once covered; otherwise `rest` says whether more is coming.
 */
export async function recordReceipt(data: Record<string, unknown>): Promise<string | null> {
  const { person, talent: current } = await requireTalent();
  const fail = await errorText();
  const parsed = receiptInput.and(z.object({ paymentId: z.uuid() })).safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const r = parsed.data;
  const failure = await db.transaction(async (tx) => {
    const p = await lockPayment(tx, current.id, r.paymentId);
    if (!p) return fail("paymentNotFound");
    const problem = await receiptProblem(p, r);
    if (problem) return fail(problem);
    await addReceipt(tx, p, { ...r, recordedBy: person.personId });
    await settle(tx, p, r.rest);
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/** The payment a receipt belongs to, locked, with that receipt, if it still counts. */
async function lockActive(tx: Tx, talentId: string, receiptId: string) {
  const [row] = await tx
    .select({ paymentId: paymentReceipt.paymentId })
    .from(paymentReceipt)
    .where(and(eq(paymentReceipt.id, receiptId), eq(paymentReceipt.talentId, talentId)));
  if (!row) return null;
  const p = await lockPayment(tx, talentId, row.paymentId);
  return p && activeReceipts(p).some((x) => x.id === receiptId) ? p : null;
}

/** Correct a receipt: a new one replaces it, and the old one stays, struck through. */
export async function correctReceipt(data: Record<string, unknown>): Promise<string | null> {
  const { person, talent: current } = await requireTalent();
  const fail = await errorText();
  const parsed = receiptInput.and(z.object({ receiptId: z.uuid() })).safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const r = parsed.data;
  const failure = await db.transaction(async (tx) => {
    const p = await lockActive(tx, current.id, r.receiptId);
    if (!p) return fail("receiptChanged");
    const problem = await receiptProblem(p, r);
    if (problem) return fail(problem);
    await addReceipt(tx, p, { ...r, replacesId: r.receiptId, recordedBy: person.personId });
    await settle(tx, p, r.rest);
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/** Withdraw a receipt that never arrived; the payment is open again while anything's left. */
export async function withdrawReceipt(receiptId: string): Promise<string | null> {
  const { person, talent: current } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(receiptId).success) return fail("invalid");
  const failure = await db.transaction(async (tx) => {
    const p = await lockActive(tx, current.id, receiptId);
    if (!p) return fail("receiptChanged");
    const old = p.receipts.find((x) => x.id === receiptId)!;
    await addReceipt(tx, p, { date: old.date, cash: 0, replacesId: receiptId, withdrawn: true, recordedBy: person.personId });
    if (p.status !== "cancelled") await settle(tx, p, "coming");
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/** Void or restore a payment entered by mistake; voided entries leave every total. */
export async function voidPayment(id: string, voided: boolean): Promise<string | null> {
  const { talent: current } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const rows = await db
    .update(payment)
    .set({ voidedAt: voided ? new Date() : null })
    .where(and(eq(payment.id, id), eq(payment.talentId, current.id)))
    .returning({ id: payment.id });
  if (!rows.length) return fail("paymentNotFound");
  refresh();
  return null;
}

const planInput = z
  .object({
    projectId: z.uuid(),
    percent: z.coerce.number().gt(0).lt(100),
    depositDue: day,
    balanceDue: day,
  })
  .refine((p) => p.balanceDue >= p.depositDue, { message: "balanceBeforeDeposit" });

/**
 * Split a project's tax-inclusive quote into deposit and balance, both
 * expected, in one transaction. Refused if the project already has income
 * rows, so a deposit can't be counted twice.
 */
export async function createPaymentPlan(data: Record<string, unknown>): Promise<string | null> {
  const { talent: current } = await requireTalent();
  const fail = await errorText();
  // The new rows' names are stored data, written in the creator's language.
  const tLabel = await getTranslations("labels.installment");
  const parsed = planInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { projectId, percent, depositDue, balanceDue } = parsed.data;
  const recordedOn = await today(current.id);

  const failure = await db.transaction(async (tx) => {
    const [p] = await tx
      .select()
      .from(project)
      .where(and(eq(project.id, projectId), eq(project.talentId, current.id)))
      .for("update");
    if (!p) return fail("projectNotFound");
    if (p.archivedAt) return fail("projectArchived");
    if (!isOpenStage(p.stage)) return fail("projectEnded");
    if (p.quotedAmount === null) return fail("quoteNotSet");
    const existing = await tx
      .select({ id: payment.id })
      .from(payment)
      .where(
        and(
          eq(payment.projectId, projectId),
          eq(payment.direction, "in"),
          ne(payment.status, "cancelled"),
          isNull(payment.voidedAt),
        ),
      )
      .limit(1);
    if (existing.length) return fail("incomeExists");

    let split: ReturnType<typeof splitPayments>;
    try {
      split = splitPayments(quote(p.quotedAmount, p.taxRate, p.taxIncluded, p.quoteCurrency).total, percent, p.quoteCurrency);
    } catch (e) {
      if (e instanceof SplitError) return fail(e.code);
      throw e;
    }
    const common = {
      talentId: current.id,
      projectId,
      direction: "in" as const,
      currency: p.quoteCurrency, // the plan bills the quote, in its currency
      taxRate: p.taxRate,
      taxIncluded: true, // the split parts are tax-inclusive amounts
      recordedOn,
    };
    await tx.insert(payment).values([
      { ...common, installment: "deposit", label: `${p.title} ${tLabel("deposit")}`.slice(0, 200), amount: split.deposit, dueOn: depositDue },
      { ...common, installment: "balance", label: `${p.title} ${tLabel("balance")}`.slice(0, 200), amount: split.balance, dueOn: balanceDue },
    ]);
    return null;
  });
  if (!failure) refresh();
  return failure;
}
