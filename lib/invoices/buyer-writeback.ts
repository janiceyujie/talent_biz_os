import { z } from "zod";
import { postalAddressInput, formatPostalAddress } from "./address";

const identity = { kind: z.enum(["organization", "contact"]), id: z.uuid() };
export const buyerBillingFields = z.strictObject({
  address: z.string().trim().min(1).max(600).optional(),
  addressParts: postalAddressInput.optional(),
  email: z.email().max(254).optional(),
}).refine(v=>!v.addressParts || formatPostalAddress(v.addressParts) === v.address).refine((v) => v.address !== undefined || v.email !== undefined);
export const buyerWritebackInput = z.discriminatedUnion("op", [
  z.strictObject({ ...identity, op: z.literal("review") }),
  z.strictObject({ ...identity, op: z.literal("save"), confirmed: z.literal(true),
    expected: z.strictObject({ address: z.string().max(600), email: z.string().max(254) }),
    patch: buyerBillingFields,
  }),
]);
export type BuyerBillingRecord = { kind: "organization" | "contact"; id: string; name: string; address: string; email: string };
