import { z } from "zod";
import { taxContextInput, type TaxResolution } from "../tax/domain";

/** Jurisdictions only, never a rate table. Rates depend on location and taxability. */
export const usStates = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA",
  "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX",
  "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;
export const taxTreatments = ["taxable", "nonTaxable", "exempt", "notRequired"] as const;
export const taxRateInput = z.number().min(0).max(100).multipleOf(0.0001);
export const invoiceTaxInput = z.object({
  country: z.literal("US"),
  state: z.enum(usStates),
  location: z.string().trim().min(1).max(600),
  treatment: z.enum(taxTreatments),
  rate: taxRateInput,
  included: z.boolean(),
  source: z.string().trim().min(1).max(500),
  catalogue: taxContextInput.optional(),
}).strict().refine(v => v.treatment === "taxable" || v.rate === 0, { path: ["rate"], message: "zeroTax" });
export type InvoiceTaxInput = z.infer<typeof invoiceTaxInput>;
export type InvoiceTaxReview = InvoiceTaxInput & { method: "manual" | "catalogueReviewed"; reviewedAt: string; evidence?: Extract<TaxResolution, { status: "ready" }> };
export const paymentTaxBasisInput = z.object({
  amount: z.number().positive().max(9999999999.99).multipleOf(0.01),
  taxRate: taxRateInput,
  taxIncluded: z.boolean(),
}).strict();
export type PaymentTaxBasis = z.infer<typeof paymentTaxBasisInput>;
export function sameTaxBasis(a: PaymentTaxBasis, b: PaymentTaxBasis) {
  return a.amount === b.amount && a.taxRate === b.taxRate && a.taxIncluded === b.taxIncluded;
}
export function taxGuidanceUrl(state: string) {
  if (state === "NY") return "https://www.tax.ny.gov/pubs_and_bulls/tg_bulletins/st/sales_tax_rates_additional_sales_taxes_and_fees.htm";
  if (state === "CA") return "https://www.cdtfa.ca.gov/taxes-and-fees/know-your-rate.htm";
  return "https://www.usa.gov/state-taxes";
}
