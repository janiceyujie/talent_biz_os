import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { preference } from "@/lib/db/schema";
import { invoiceDefaultsInput, invoiceDefaultsKey } from "@/lib/invoices/defaults";
import { invoiceIdentity, invoiceJson, invoiceFailure, invoiceBody } from "@/lib/invoices/http";

/** Only explicitly saved owner billing defaults; never infer from an invoice. */
export async function GET() {
  const who = await invoiceIdentity();
  if (!who) return invoiceJson({ error: "forbidden" }, 401);
  try {
    const [row] = await db.select({ value: preference.value }).from(preference)
      .where(and(eq(preference.personId, who.personId), eq(preference.talentId, who.talentId), eq(preference.key, invoiceDefaultsKey))).limit(1);
    const parsed = invoiceDefaultsInput.safeParse(row?.value);
    return invoiceJson(parsed.success ? parsed.data : null);
  } catch (error) { return invoiceFailure(error); }
}

export async function POST(req: Request) {
  const who = await invoiceIdentity();
  if (!who) return invoiceJson({ error: "forbidden" }, 401);
  try {
    const parsed = invoiceDefaultsInput.safeParse(await invoiceBody(req));
    if (!parsed.success) return invoiceJson({ error: "invalid" }, 400);
    await db.insert(preference).values({ ...who, key: invoiceDefaultsKey, value: parsed.data })
      .onConflictDoUpdate({ target: [preference.personId, preference.talentId, preference.key], set: { value: parsed.data, updatedAt: new Date() } });
    return invoiceJson(parsed.data);
  } catch (error) { return invoiceFailure(error); }
}
