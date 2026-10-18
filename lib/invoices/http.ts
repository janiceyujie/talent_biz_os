import { getCurrentTalent, getSession } from "@/lib/auth";
import { InvoiceError } from "./service";
import { InvalidCursor } from "@/lib/data/page-cursor";
export async function invoiceIdentity() {
  const s = await getSession();
  if (!s) return null;
  const t = await getCurrentTalent(s.personId);
  return t ? { talentId: t.id, personId: s.personId } : null;
}
export const invoiceJson = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export function invoiceFailure(error: unknown) {
  if (error instanceof Error && error.name === "InvoicePdfUnsupportedText")
    return invoiceJson({ error: "unsupportedCharacters" }, 422);
  if (error instanceof InvoiceError)
    return invoiceJson({ error: error.message }, 409);
  if (error instanceof InvalidCursor)
    return invoiceJson({ error: "invalid" }, 400);
  console.error(
    "invoice operation failed",
    error instanceof Error ? error.name : "unknown",
  );
  return invoiceJson({ error: "unavailable" }, 503);
}
export async function invoiceBody(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    throw new InvoiceError("forbidden");
  const text = await req.text();
  if (text.length > 20000) throw new InvoiceError("invalid");
  try {
    return JSON.parse(text);
  } catch {
    throw new InvoiceError("invalid");
  }
}
