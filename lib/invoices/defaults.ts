import { z } from "zod";

// Stored per person and workspace in preference, outside general UI preferences.
export const invoiceDefaultsKey = "invoice.billing-defaults";
export const invoiceDefaultsInput = z.strictObject({
  sellerName: z.string().trim().min(1).max(150).refine((v) => !/[\r\n]/.test(v)),
  sellerAddress: z.string().trim().min(1).max(600),
  sellerEmail: z.email().max(254),
  paymentInstructions: z.string().trim().min(1).max(1200),
});
