import { taiwanSetup } from "@/lib/invoices/taiwan-setup-service";
import { invoiceIdentity, invoiceJson, invoiceBody, invoiceFailure } from "@/lib/invoices/http";
export async function GET() {
  const who = await invoiceIdentity();
  if (!who) return invoiceJson({ error: "forbidden" }, 401);
  try { return invoiceJson(await taiwanSetup(who.talentId, who.personId)); }
  catch (error) { return invoiceFailure(error); }
}
export async function POST(req: Request) {
  const who = await invoiceIdentity();
  if (!who) return invoiceJson({ error: "forbidden" }, 401);
  try { return invoiceJson(await taiwanSetup(who.talentId, who.personId, await invoiceBody(req))); }
  catch (error) { return invoiceFailure(error); }
}
