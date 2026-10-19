/** Billing documents are independent of email delivery and official tax issuance. */
export const billingDocumentKinds = ["commercial_invoice", "tw_payment_request"] as const;
export type BillingDocumentKind = (typeof billingDocumentKinds)[number];
export type BillingCurrency = "USD" | "TWD";
export function isBillingCurrency(value: unknown): value is BillingCurrency {
  return value === "USD" || value === "TWD";
}
/** Legacy snapshots were USD commercial invoices, regardless of document language. */
export function billingDocumentKind(snapshot: { documentKind?: BillingDocumentKind }): BillingDocumentKind {
  return snapshot.documentKind ?? "commercial_invoice";
}
/** This is a document default, never a tax-jurisdiction or tax-liability decision. */
export function defaultDocumentKind(currency: string): BillingDocumentKind {
  return currency === "TWD" ? "tw_payment_request" : "commercial_invoice";
}
export const taiwanEinvoiceCapability = { available: false, reason: "notConnected" } as const;
