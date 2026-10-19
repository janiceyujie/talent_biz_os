"use server";
import { isBillingCurrency } from "@/lib/invoices/document";

import { randomUUID } from "node:crypto";
import { amendReceipt, appendReceipt, paymentBalance, receiptHistory, ReceiptError } from "@/lib/domain/payment-receipts";
import { and, eq, isNull, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, invoice, notificationState, payment, project, talent } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { quote, SplitError, splitPayments, supportedCurrencies } from "@/lib/domain/money";
import { isSigned } from "@/lib/domain/phases";
import { checkProjectLink } from "./project-link";
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
    taxRate: z.coerce.number().min(0).max(100, "taxRateRange").multipleOf(0.0001),
    taxIncluded: z.boolean(),
    recordedDate: day,
    dueDate: optionalDay,
    invoiceOn: optionalDay,
    status: z.enum(["expected", "settled"]),
    settledDate: optionalDay,
    settledAmount: optionalMoney,
    withheldAmount: optionalMoney,
    receiptId: z.uuid().optional(),
    receiptRevision: z.coerce.number().int().min(0).optional(),
    shortfallReason: z.enum(["", "unpaid", "withholding"]).optional(),
    invoiceRef: optionalText,
    notes: optionalText,
  })
  .refine((p) => p.status !== "settled" || p.settledDate, {
    message: "settledDateRequired",
  });

async function today(talentId: string) {
  const [row] = await db.select({ timeZone: talent.timeZone }).from(talent).where(eq(talent.id, talentId));
  return dateInZone(row.timeZone);
}

/** Create or update a payment. Returns the saved ID for an optional invoice continuation. */
export async function savePaymentWithId(data: Record<string, unknown>): Promise<{ id: string } | { error: string }> {
  const { person, talent: current } = await requireTalent();
  const fail = await errorText();
  const parsed = paymentInput.safeParse(data);
  if (!parsed.success) return { error: await fail(firstIssue(parsed.error)) };
  const { id, ...input } = parsed.data;

  let currentLink: string | null = null;
  if (id) {
    const [row] = await db
      .select({ projectId: payment.projectId })
      .from(payment)
      .where(and(eq(payment.id, id), eq(payment.talentId, current.id)));
    currentLink = row?.projectId ?? null;
  }
  const linkError = await checkProjectLink(current.id, input.projectId, currentLink, input.direction === "in" ? input.currency : undefined);
  if (linkError) return { error: await fail(linkError) };
  const settled = input.status === "settled";
  if (settled && input.settledDate! > (await today(current.id))) return { error: await fail("settledDateFuture") };

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
    ...(Object.hasOwn(data, "invoiceOn") ? {invoiceOn: input.direction === "in" && isBillingCurrency(input.currency) ? input.invoiceOn : null} : {}),
    status: input.status,
    // Back to expected clears what was recorded as settled.
    settledOn: settled ? input.settledDate : null,
    settledAmount: settled ? input.settledAmount : null,
    invoiceRef: input.invoiceRef,
    notes: input.notes,
  };

  const record = (previous: typeof payment.$inferSelect | null) => {
    const base = { ...values, status: previous?.status ?? "expected", settledAmount: previous?.settledAmount ?? null, settledOn: previous?.settledOn ?? null, receipts: previous?.receipts ?? [] };
    if (!settled) return previous ? { receipts: previous.receipts, status: previous.status, settledAmount: previous.settledAmount, settledOn: previous.settledOn } : {};
    if (input.shortfallReason === "withholding" && input.direction !== "in") throw new ReceiptError("receiptInvalid");
    return appendReceipt(base, { id: input.receiptId ?? randomUUID(), date: input.settledDate!,
      cash: input.settledAmount ?? paymentBalance(base).remaining, reason: input.shortfallReason, withheld: input.withheldAmount ?? undefined,
      revision: input.receiptRevision, recordedAt: new Date().toISOString(), recordedBy: person.personId });
  };
  let savedId = id;
  try {
  const result = await db.transaction(async tx => {
    // Serialize linked inserts, moves and edits with project currency corrections.
    const parentIds = [...new Set([currentLink, input.projectId].filter((v): v is string => !!v))].sort();
    for (const parentId of parentIds) {
      const [parent] = await tx.select().from(project).where(and(eq(project.id,parentId),eq(project.talentId,current.id))).for("update");
      if (!parent) return "projectNotFound" as const;
      if (parentId === input.projectId) {
        if (input.direction === "in" && input.currency !== parent.quoteCurrency) return "paymentCurrencyMismatch" as const;
        if (currentLink !== parentId && (parent.archivedAt || !isSigned(parent.stage))) return "projectNotSigned" as const;
      }
    }
    if (!id) {
      const [saved] = await tx.insert(payment).values({ ...values, ...record(null), talentId: current.id }).returning({ id: payment.id });
      savedId = saved.id;
      return null;
    }
    const [previous] = await tx.select().from(payment).where(and(eq(payment.id, id), eq(payment.talentId, current.id))).for("update");
    if (!previous || previous.voidedAt) return "paymentNotFound" as const;
    if (previous.projectId !== currentLink) return "receiptChanged" as const;
    if (receiptHistory(previous).length && (["amount", "currency", "taxRate", "taxIncluded", "direction"] as const).some(key => previous[key] !== values[key])) return "receiptLocked" as const;
    const [issued] = await tx.select({ status: invoice.status }).from(invoice).where(and(eq(invoice.paymentId, id), eq(invoice.talentId, current.id), ne(invoice.status, "cancelled")));
    if (issued && ["sending", "sent", "delivery_unknown", "draft_queued", "draft_creating", "gmail_draft", "draft_unknown", "draft_missing"].includes(issued.status)) {
      const protectedFields = ["projectId", "direction", "amount", "currency", "taxRate", "taxIncluded", "invoiceRef", "dueOn"] as const;
      if (protectedFields.some(key => previous[key] !== values[key]) || (issued.status === "sending" && previous.status !== values.status)) return "paymentInvoiceLocked" as const;
    }
    await tx.update(payment).set({ ...values, ...record(previous) }).where(and(eq(payment.id, id), eq(payment.talentId, current.id)));
    return null;
  });
  if (result) return { error: await fail(result) };
  } catch (error) {
    if (error instanceof ReceiptError) return { error: await fail(error.code) };
    throw error;
  }
  refresh();
  return { id: savedId! };
}

/** Preserve the existing error-or-null contract for other payment callers. */
export async function savePayment(data: Record<string, unknown>): Promise<string | null> {
  const result = await savePaymentWithId(data);
  return "error" in result ? result.error : null;
}

/** Void or restore a payment entered by mistake; voided entries leave every total. */
export async function voidPayment(id: string, voided: boolean): Promise<string | null> {
  const { talent: current } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const result = await db.transaction(async tx => {
    const [previous] = await tx.select().from(payment).where(and(eq(payment.id, id), eq(payment.talentId, current.id))).for("update");
    if (!previous) return "paymentNotFound" as const;
    const [issued] = await tx.select({ status: invoice.status }).from(invoice).where(and(eq(invoice.paymentId, id), eq(invoice.talentId, current.id), ne(invoice.status, "cancelled")));
    if (issued && ["sending", "sent", "delivery_unknown", "draft_queued", "draft_creating", "gmail_draft", "draft_unknown", "draft_missing"].includes(issued.status)) return "paymentInvoiceLocked" as const;
    await tx.update(payment).set({ voidedAt: voided ? new Date() : null }).where(and(eq(payment.id, id), eq(payment.talentId, current.id)));
    return null;
  });
  if (result) return fail(result);
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
    if (!isSigned(p.stage)) return fail("projectNotSigned");
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
      split = splitPayments(quote(p.quotedAmount, p.taxRate, p.taxIncluded).total, percent);
    } catch (e) {
      if (e instanceof SplitError) return fail(e.code);
      throw e;
    }
    const common = {
      talentId: current.id,
      projectId,
      direction: "in" as const,
      currency: p.quoteCurrency,
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

const receiptAmendmentInput = z.object({
  paymentId: z.uuid(), targetId: z.union([z.uuid(), z.literal("legacy")]), requestId: z.uuid(),
  revision: z.number().int().nonnegative(), operation: z.enum(["correct", "withdraw"]),
  date: day, cash: money, withheld: money, note: z.string().trim().min(1).max(500),
});

/** Correct a receipt while preserving the original and its account-scoped audit trail. */
export async function amendPaymentReceipt(data: Record<string, unknown>): Promise<string | null> {
  const { person, talent: current } = await requireTalent();
  const fail = await errorText();
  const parsed = receiptAmendmentInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  if (input.operation === "correct" && input.date > await today(current.id)) return fail("settledDateFuture");
  try {
    const error = await db.transaction(async tx => {
      const [link] = await tx.select({ projectId: payment.projectId }).from(payment)
        .where(and(eq(payment.id, input.paymentId), eq(payment.talentId, current.id)));
      if (!link) return "paymentNotFound" as const;
      // Match project closure's lock order: project first, then payment. Closing and
      // correcting concurrently must never leave a completed project with new debt.
      const [linked] = link.projectId ? await tx.select({ stage: project.stage, archivedAt: project.archivedAt }).from(project)
        .where(and(eq(project.id, link.projectId), eq(project.talentId, current.id))).for("update") : [];
      const [p] = await tx.select().from(payment).where(and(eq(payment.id, input.paymentId), eq(payment.talentId, current.id))).for("update");
      if (!p || p.voidedAt || p.status === "cancelled") return "paymentNotFound" as const;
      if (p.projectId !== link.projectId || (link.projectId && !linked)) return "receiptChanged" as const;
      if (p.direction === "out" && input.withheld !== 0) return "withholdingInvalid" as const;
      const values = amendReceipt(p, { id: input.requestId, targetId: input.targetId, revision: input.revision,
        operation: input.operation, date: input.date, cash: input.cash, withheld: input.withheld,
        note: input.note, recordedAt: new Date().toISOString(), recordedBy: person.personId });
      await tx.update(payment).set(values).where(and(eq(payment.id, p.id), eq(payment.talentId, current.id)));
      const remaining = paymentBalance({ ...p, ...values }).remaining;
      if (linked?.stage === "closed" && p.projectId && remaining > 0) {
        await tx.update(project).set({ stage: "collecting_payment", archivedAt: null })
          .where(and(eq(project.id, p.projectId), eq(project.talentId, current.id)));
        await tx.insert(auditLog).values({ talentId: current.id, actorPersonId: person.personId,
          action: "project.stage_changed", targetType: "project", targetId: p.projectId,
          details: { from: "closed", to: "collecting_payment", reason: "receipt_amended", paymentId: p.id,
            receiptId: input.requestId, operation: input.operation, remaining, currency: p.currency, unarchived: !!linked.archivedAt } });
      }
      // A newly restored debt must not be hidden by the current user's old read/snooze state.
      if (p.dueOn && remaining > paymentBalance(p).remaining) {
        await tx.delete(notificationState).where(and(eq(notificationState.personId, person.personId), eq(notificationState.notificationId, `payment:${p.id}:${p.dueOn}`)));
      }
      return null;
    });
    if (error) return fail(error);
  } catch (error) {
    if (error instanceof ReceiptError) return fail(error.code);
    throw error;
  }
  refresh();
  return null;
}
