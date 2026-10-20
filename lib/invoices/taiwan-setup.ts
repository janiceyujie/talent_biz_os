import { z } from "zod";

export const taiwanSetupKey = "invoice.taiwan-setup";
export const taiwanSetupInput = z.strictObject({
  registered: z.boolean(),
  businessName: z.string().trim().max(150),
  taxId: z.string().trim().regex(/^(?:[0-9]{8})?$/),
  route: z.enum(["undecided", "provider", "turnkey"]),
  providerName: z.string().trim().max(100),
  numberTracksReady: z.boolean(),
}).refine(value => !value.registered || (!!value.businessName && value.taxId.length === 8));
export type TaiwanSetup = z.infer<typeof taiwanSetupInput>;
export const defaultTaiwanSetup: TaiwanSetup = { registered: false, businessName: "", taxId: "", route: "undecided", providerName: "", numberTracksReady: false };
/** Self-declared readiness never grants issuance or allocates invoice numbers. */
export function taiwanReadiness(setup: TaiwanSetup) {
  const pending: ("business" | "route" | "tracks" | "connection")[] = [];
  if (!setup.registered || !setup.businessName || !/^[0-9]{8}$/.test(setup.taxId)) pending.push("business");
  if (setup.route === "undecided" || (setup.route === "provider" && !setup.providerName)) pending.push("route");
  if (!setup.numberTracksReady) pending.push("tracks");
  pending.push("connection");
  return { available: false as const, pending };
}
