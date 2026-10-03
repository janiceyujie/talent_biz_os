"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { payment, project, talent } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { quote, SplitError, splitPayments } from "@/lib/domain/money";
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
    taxRate: z.coerce.number().min(0).max(100, "taxRateRange").multipleOf(0.01),
    taxIncluded: z.boolean(),
    recordedDate: day,
    dueDate: optionalDay,
    status: z.enum(["expected", "settled"]),
    settledDate: optionalDay,
    settledAmount: optionalMoney,
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

/** Create or update a payment. Returns an error message, or null on success. */
export async function savePayment(data: Record<string, unknown>): Promise<string | null> {
  const { talent: current } = await requireTalent();
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
  const settled = input.status === "settled";
  if (settled && input.settledDate! > (await today(current.id))) return fail("settledDateFuture");

  const values = {
    projectId: input.projectId,
    label: input.label,
    direction: input.direction,
    installment: input.installment,
    amount: input.amount,
    taxRate: input.taxRate,
    taxIncluded: input.taxIncluded,
    recordedOn: input.recordedDate,
    dueOn: input.dueDate,
    status: input.status,
    // Back to expected clears what was recorded as settled.
    settledOn: settled ? input.settledDate : null,
    settledAmount: settled ? input.settledAmount : null,
    invoiceRef: input.invoiceRef,
    notes: input.notes,
  };

  if (!id) {
    await db.insert(payment).values({ ...values, talentId: current.id });
  } else {
    const rows = await db
      .update(payment)
      .set(values)
      .where(and(eq(payment.id, id), eq(payment.talentId, current.id)))
      .returning({ id: payment.id });
    if (!rows.length) return fail("paymentNotFound");
  }
  refresh();
  return null;
}

/** Void (作廢) or restore a payment entered by mistake; voided entries leave every total. */
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
