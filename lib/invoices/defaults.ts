import { z } from "zod";
import { postalAddressInput, formatPostalAddress } from "./address";

// Stored per person and workspace in preference, outside general UI preferences.
export const invoiceDefaultsKey = "invoice.billing-defaults";
export const invoiceDefaultsInput = z.strictObject({
  sellerName: z.string().trim().min(1).max(150).refine((v) => !/[\r\n]/.test(v)),
  sellerAddress: z.string().trim().min(1).max(600),
  sellerAddressParts: postalAddressInput.optional(),
  sellerEmail: z.email().max(254),
  paymentInstructions: z.string().trim().min(1).max(1200),
}).refine(v => !v.sellerAddressParts || formatPostalAddress(v.sellerAddressParts) === v.sellerAddress);
