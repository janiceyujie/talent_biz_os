import { z } from "zod";
import { invoiceTaxInput, paymentTaxBasisInput } from "./tax";
import { quote } from "../domain/money";
import type { InvoiceSnapshot, InvoiceStatus } from "./types";

const text = (max: number) => z.string().trim().min(1).max(max);
const header = (max: number) => text(max).refine((v) => !/[\r\n]/.test(v));
export const invoiceInput = z
  .object({
    id: z.uuid().optional(),
    revision: z.number().int().positive().optional(),
    documentLanguage: z.enum(["en", "zh-TW"]).default("en"),
    paymentId: z.uuid(),
    issueOn: z.iso.date(),
    dueOn: z.iso.date(),
    sellerName: header(150),
    sellerAddress: text(600),
    sellerEmail: z.email().max(254),
    buyerName: header(150),
    buyerAddress: text(600),
    recipient: z.email().max(254),
    description: text(1500),
    paymentInstructions: text(1200),
    taxNote: text(500),
    subject: header(200),
    body: text(4000),
    taxReview: invoiceTaxInput.optional(),
    paymentBasis: paymentTaxBasisInput.optional(),
    taxConfirmed: z.literal(true),
    autoGmailDraft: z.boolean().default(false),
  })
  .refine((v) => v.dueOn >= v.issueOn, { message: "dates" })
  .refine((v) => !v.taxReview || !!v.paymentBasis, { message: "paymentBasis" });
export type InvoiceInput = z.infer<typeof invoiceInput>;

/** This first release invoices one existing receivable; it never creates revenue. */
export function invoiceAmounts(p: {
  amount: number;
  taxRate: number;
  taxIncluded: boolean;
  currency: string;
}) {
  if (
    p.currency !== "USD" ||
    !Number.isFinite(p.amount) ||
    p.amount <= 0 ||
    p.amount > 9999999999.99
  )
    throw new Error("payment");
  const q = quote(p.amount, p.taxRate, p.taxIncluded, "USD");
  return {
    currency: "USD" as const,
    subtotal: q.net,
    tax: q.tax,
    total: q.total,
  };
}
export function sameAmounts(
  a: InvoiceSnapshot,
  b: ReturnType<typeof invoiceAmounts>,
) {
  return (
    a.currency === b.currency &&
    a.subtotal === b.subtotal &&
    a.tax === b.tax &&
    a.total === b.total
  );
}
export function invoiceState(
  status: InvoiceStatus,
  paid: boolean,
  dueOn: string,
  today: string,
) {
  if (status !== "sent") return status;
  return paid ? "paid" : dueOn < today ? "overdue" : "sent";
}

const errors = [
  "invalid",
  "forbidden",
  "notFound",
  "payment",
  "pastDue",
  "changed",
  "duplicate",
  "externalInvoice",
  "amountChanged",
  "notReady",
  "deliveryDisabled",
  "deliveryUnknown",
  "unsupportedCharacters",
  "unavailable", "gmailAuthorization", "gmailDisabled", "gmailUnavailable", "draftUnknown",
] as const;
export function invoiceErrorKey(
  error: string,
): `errors.${(typeof errors)[number]}` {
  return `errors.${errors.find((key) => key === error) || "unavailable"}`;
}

/** Receipt dates use the workspace calendar date, including at time-zone boundaries. */
export function validInvoiceReceiptDate(value: string, issueOn: string, today: string) {
  return z.iso.date().safeParse(value).success && value >= issueOn && value <= today;
}
