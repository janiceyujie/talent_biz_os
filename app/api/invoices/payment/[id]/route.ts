import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { getInvoice } from "@/lib/invoices/service";
import { invoiceIdentity, invoiceJson, invoiceFailure } from "@/lib/invoices/http";

/** Re-enter the one active document instead of attempting a duplicate invoice. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await invoiceIdentity();
  if (!who) return invoiceJson({ error: "forbidden" }, 401);
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return invoiceJson({ error: "invalid" }, 400);
  try {
    const [row] = await db.select({ id: invoice.id }).from(invoice).where(and(
      eq(invoice.talentId, who.talentId), eq(invoice.paymentId, id), ne(invoice.status, "cancelled"),
    )).limit(1);
    return invoiceJson(row ? await getInvoice(who.talentId, row.id) : null);
  } catch (error) { return invoiceFailure(error); }
}
