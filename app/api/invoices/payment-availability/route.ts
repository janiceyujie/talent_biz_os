import { z } from "zod";
import { availableInvoicePayments } from "@/lib/invoices/service";
import { invoiceIdentity, invoiceBody, invoiceJson, invoiceFailure } from "@/lib/invoices/http";

const input = z.object({ paymentIds: z.array(z.uuid()).max(200) }).strict();

export async function POST(req: Request) {
  const who = await invoiceIdentity();
  if (!who) return invoiceJson({ error: "forbidden" }, 401);
  try {
    const parsed = input.safeParse(await invoiceBody(req));
    if (!parsed.success) return invoiceJson({ error: "invalid" }, 400);
    return invoiceJson(await availableInvoicePayments(who.talentId, parsed.data.paymentIds));
  } catch (error) {
    return invoiceFailure(error);
  }
}
