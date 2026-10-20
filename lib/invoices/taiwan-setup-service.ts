import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { preference } from "@/lib/db/schema";
import { InvoiceError, invoiceOwner } from "./service";
import { defaultTaiwanSetup, taiwanReadiness, taiwanSetupInput, taiwanSetupKey } from "./taiwan-setup";

/** Stores setup facts only. This endpoint cannot accept credentials or issue an invoice. */
export async function taiwanSetup(talentId: string, personId: string, raw?: unknown) {
  const parsed = raw === undefined ? null : taiwanSetupInput.safeParse(raw);
  if (parsed && !parsed.success) throw new InvoiceError("invalid");
  return db.transaction(async tx => {
    await invoiceOwner(tx, talentId, personId);
    if (parsed?.success) await tx.insert(preference).values({ personId, talentId, key: taiwanSetupKey, value: parsed.data })
      .onConflictDoUpdate({ target: [preference.personId, preference.talentId, preference.key], set: { value: parsed.data, updatedAt: new Date() } });
    const [row] = await tx.select({ value: preference.value }).from(preference).where(and(eq(preference.personId, personId), eq(preference.talentId, talentId), eq(preference.key, taiwanSetupKey)));
    const stored = taiwanSetupInput.safeParse(row?.value);
    const setup = stored.success ? stored.data : defaultTaiwanSetup;
    return { setup, readiness: taiwanReadiness(setup) };
  });
}
