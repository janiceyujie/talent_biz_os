import { z } from "zod";
import { invoiceIdentity, invoiceJson, invoiceFailure, invoiceBody } from "@/lib/invoices/http";
import { usStates } from "@/lib/invoices/tax";
import { taxContextInput } from "@/lib/tax/domain";
import { findTaxReferences, findTaxLocalities, resolveCatalogueTax, taxCoverage } from "@/lib/tax/service";
const searchInput = z.object({ state: z.enum(usStates), q: z.string().max(100).default(""), saleOn: z.iso.date(), offset: z.coerce.number().int().min(0).max(10000).default(0) });
export async function GET(req: Request) {
  if (!await invoiceIdentity()) return invoiceJson({ error: "forbidden" }, 401);
  const input = searchInput.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!input.success) return invoiceJson({ error: "invalid" }, 400);
  try {
    const { state, q, saleOn, offset } = input.data;
    const [coverage, localities, references] = await Promise.all([taxCoverage(state), findTaxLocalities(state, q, saleOn, offset), findTaxReferences(state, q, saleOn, offset)]);
    return invoiceJson({ coverage, ...localities, references });
  } catch (e) { return invoiceFailure(e); }
}
export async function POST(req: Request) {
  if (!await invoiceIdentity()) return invoiceJson({ error: "forbidden" }, 401);
  try {
    const parsed = taxContextInput.safeParse(await invoiceBody(req));
    if (!parsed.success || !(usStates as readonly string[]).includes(parsed.data.state) || !(usStates as readonly string[]).includes(parsed.data.sellerState)) return invoiceJson({ error: "invalid" }, 400);
    return invoiceJson(await resolveCatalogueTax(parsed.data));
  } catch (e) { return invoiceFailure(e); }
}
