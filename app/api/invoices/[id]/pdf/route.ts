import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { readBytes } from "@/lib/storage";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
import {
  invoiceIdentity,
  invoiceJson,
  invoiceFailure,
} from "@/lib/invoices/http";
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const who = await invoiceIdentity();
  if (!who) return invoiceJson({ error: "forbidden" }, 401);
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success)
    return invoiceJson({ error: "notFound" }, 404);
  try {
    // Read snapshot, revision and attachment key together; an edit cannot mix versions.
    const [row] = await db
      .select()
      .from(invoice)
      .where(and(eq(invoice.id, id), eq(invoice.talentId, who.talentId)));
    if (!row) return invoiceJson({ error: "notFound" }, 404);
    const frozen = ["sent", "sending", "delivery_unknown", "draft_creating", "gmail_draft", "draft_unknown", "draft_missing"].includes(row.status);
    if (frozen && !row.storageKey)
      return invoiceJson({ error: "changed" }, 409);
    const bytes =
      frozen && row.storageKey
        ? await readBytes(row.storageKey)
        : await renderInvoicePdf(row, true);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${row.number}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return invoiceFailure(e);
  }
}
