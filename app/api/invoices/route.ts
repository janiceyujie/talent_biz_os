import { z } from "zod";
import {
  listInvoices,
  saveInvoice,
  invoiceReviewCount,
} from "@/lib/invoices/service";
import {
  invoiceIdentity,
  invoiceJson,
  invoiceFailure,
  invoiceBody,
} from "@/lib/invoices/http";
export async function GET(req: Request) {
  const who = await invoiceIdentity();
  if (!who) return invoiceJson({ error: "forbidden" }, 401);
  const url = new URL(req.url),
    project = url.searchParams.get("project") || "";
  if (project && !z.uuid().safeParse(project).success)
    return invoiceJson({ error: "invalid" }, 400);
  try {
    if (
      url.searchParams.get("ready") === "1" &&
      url.searchParams.get("count") === "1"
    )
      return invoiceJson(await invoiceReviewCount(who.talentId));
    return invoiceJson(
      await listInvoices(
        who.talentId,
        project,
        url.searchParams.get("cursor") || "",
        url.searchParams.get("ready") === "1",
      ),
    );
  } catch (e) {
    return invoiceFailure(e);
  }
}
export async function POST(req: Request) {
  const who = await invoiceIdentity();
  if (!who) return invoiceJson({ error: "forbidden" }, 401);
  try {
    return invoiceJson(
      await saveInvoice(who.talentId, who.personId, await invoiceBody(req)),
    );
  } catch (e) {
    return invoiceFailure(e);
  }
}
