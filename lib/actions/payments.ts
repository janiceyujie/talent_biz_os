"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { payment, project, talent } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { quote, splitPayments } from "@/lib/domain/money";
import { firstIssue, optionalId, optionalText } from "./validation";

const money = z.coerce.number().min(0, "金額不能是負數。").max(9_999_999_999.99).multipleOf(0.01, "金額最多兩位小數。");
const day = z.iso.date("日期格式不正確。");
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
    label: z.string().trim().min(1, "請填寫紀錄名稱。").max(200),
    direction: z.enum(["in", "out"]),
    installment: z.enum(["regular", "deposit", "balance"]),
    amount: money,
    taxRate: z.coerce.number().min(0).max(100, "稅率需介於 0–100%。").multipleOf(0.01),
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
    message: "已收／已付的紀錄需要實際收付日期。",
  });

async function today(talentId: string) {
  const [row] = await db.select({ timeZone: talent.timeZone }).from(talent).where(eq(talent.id, talentId));
  return dateInZone(row.timeZone);
}

async function ownsProject(talentId: string, projectId: string) {
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.talentId, talentId)));
  return Boolean(row);
}

/** Create or update a payment. Returns an error message, or null on success. */
export async function savePayment(data: Record<string, unknown>): Promise<string | null> {
  const { talent: current } = await requireTalent();
  const parsed = paymentInput.safeParse(data);
  if (!parsed.success) return firstIssue(parsed.error);
  const { id, ...input } = parsed.data;

  if (input.projectId && !(await ownsProject(current.id, input.projectId))) return "找不到這個合作案。";
  const settled = input.status === "settled";
  if (settled && input.settledDate! > (await today(current.id))) return "實際收付日期不能晚於今天。";

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
    if (!rows.length) return "找不到這筆紀錄。";
  }
  refresh();
  return null;
}

export async function archivePayment(id: string, archived: boolean): Promise<string | null> {
  const { talent: current } = await requireTalent();
  if (!z.uuid().safeParse(id).success) return "資料格式不正確。";
  const rows = await db
    .update(payment)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(payment.id, id), eq(payment.talentId, current.id)))
    .returning({ id: payment.id });
  if (!rows.length) return "找不到這筆紀錄。";
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
  .refine((p) => p.balanceDue >= p.depositDue, { message: "尾款期限不能早於訂金期限。" });

/**
 * Split a project's tax-inclusive quote into deposit and balance, both
 * expected, in one transaction. Refused if the project already has income
 * rows, so a deposit can't be counted twice.
 */
export async function createPaymentPlan(data: Record<string, unknown>): Promise<string | null> {
  const { talent: current } = await requireTalent();
  const parsed = planInput.safeParse(data);
  if (!parsed.success) return firstIssue(parsed.error);
  const { projectId, percent, depositDue, balanceDue } = parsed.data;
  const recordedOn = await today(current.id);

  const failure = await db.transaction(async (tx) => {
    const [p] = await tx
      .select()
      .from(project)
      .where(and(eq(project.id, projectId), eq(project.talentId, current.id)))
      .for("update");
    if (!p) return "找不到這個合作案。";
    const existing = await tx
      .select({ id: payment.id })
      .from(payment)
      .where(
        and(
          eq(payment.projectId, projectId),
          eq(payment.direction, "in"),
          ne(payment.status, "cancelled"),
          isNull(payment.archivedAt),
        ),
      )
      .limit(1);
    if (existing.length) return "這個合作案已有請款，請編輯既有款項，避免重複計入。";

    let split: ReturnType<typeof splitPayments>;
    try {
      split = splitPayments(quote(p.quotedAmount ?? 0, p.taxRate, p.taxIncluded).total, percent);
    } catch (e) {
      return (e as Error).message;
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
      { ...common, installment: "deposit", label: `${p.title} 訂金`.slice(0, 200), amount: split.deposit, dueOn: depositDue },
      { ...common, installment: "balance", label: `${p.title} 尾款`.slice(0, 200), amount: split.balance, dueOn: balanceDue },
    ]);
    return null;
  });
  if (!failure) refresh();
  return failure;
}
