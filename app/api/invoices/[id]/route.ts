import { z } from "zod";
import {
  getInvoice,

  cancelInvoice,
  settleInvoice,

} from "@/lib/invoices/service";
import {
  invoiceIdentity,
  invoiceJson,
  invoiceFailure,
  invoiceBody,
} from "@/lib/invoices/http";
import { requestInvoiceDraft, requestInvoiceSync } from "@/lib/invoices/gmail-service";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Context) {
  const who = await invoiceIdentity();
  if (!who) return invoiceJson({ error: "forbidden" }, 401);
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success)
    return invoiceJson({ error: "notFound" }, 404);
  try {
    const row = await getInvoice(who.talentId, id);
    return row ? invoiceJson(row) : invoiceJson({ error: "notFound" }, 404);
  } catch (e) {
    return invoiceFailure(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  const who = await invoiceIdentity();
  if (!who) return invoiceJson({ error: "forbidden" }, 401);
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success)
    return invoiceJson({ error: "notFound" }, 404);
  try {
    const p = z
      .object({
        op: z.enum([
          "createDraft",
          "syncDraft",
          "cancel",
          "settle",

        ]),
        revision: z.number().int().positive(),
        confirmed: z.literal(true),
        settledOn: z.iso.date().optional(),
      })
      .safeParse(await invoiceBody(req));
    if (!p.success) return invoiceJson({ error: "invalid" }, 400);
    const { op, revision } = p.data;
    if (op === "createDraft") await requestInvoiceDraft(who.talentId, who.personId, id, revision);
    if (op === "syncDraft") await requestInvoiceSync(who.talentId, who.personId, id, revision);
    if (op === "cancel")
      await cancelInvoice(who.talentId, who.personId, id, revision);
    if (op === "settle")
      await settleInvoice(
        who.talentId,
        who.personId,
        id,
        revision,
        p.data.settledOn || "",
      );
    return invoiceJson({ ok: true });
  } catch (e) {
    return invoiceFailure(e);
  }
}
