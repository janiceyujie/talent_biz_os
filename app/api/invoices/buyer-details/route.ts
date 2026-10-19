import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { contact, organization } from "@/lib/db/schema";
import { buyerWritebackInput, type BuyerBillingRecord } from "@/lib/invoices/buyer-writeback";
import { invoiceIdentity, invoiceBody, invoiceFailure, invoiceJson } from "@/lib/invoices/http";
import { InvoiceError } from "@/lib/invoices/service";

/** A selected partner is updated explicitly; invoice snapshots and other partner fields are untouched. */
export async function POST(req: Request) {
  const who = await invoiceIdentity();
  if (!who) return invoiceJson({error: "forbidden"}, 401);
  try {
    const parsed = buyerWritebackInput.safeParse(await invoiceBody(req));
    if (!parsed.success) return invoiceJson({error: "invalid"}, 400);
    const input = parsed.data;
    const result = await db.transaction(async (tx) => {
      const table = input.kind === "organization" ? organization : contact;
      const emailColumn = input.kind === "organization" ? organization.billingEmail : contact.email;
      const scope = and(eq(table.id, input.id), eq(table.talentId, who.talentId), isNull(table.archivedAt));
      const [row] = await tx.select({name: table.name, address: table.billingAddress, email: emailColumn})
        .from(table).where(scope).for("update");
      if (!row) throw new InvoiceError("buyerUnavailable");
      const current: BuyerBillingRecord = {kind: input.kind, id: input.id, name: row.name, address: row.address || "", email: row.email || ""};
      if (input.op === "review") return current;
      // Compare only selected fields under the row lock; a concurrent edit is never silently overwritten.
      for (const field of ["address", "email"] as const) {
        if (input.patch[field] !== undefined && input.expected[field] !== current[field]) throw new InvoiceError("buyerChanged");
      }
      const fields = {billingAddress: input.patch.address, ...(input.patch.address !== undefined && {billingAddressParts: input.patch.addressParts ?? null}), updatedAt: new Date()};
      if (input.kind === "organization") {
        await tx.update(organization).set({...fields, billingEmail: input.patch.email}).where(scope);
      } else {
        await tx.update(contact).set({...fields, email: input.patch.email}).where(scope);
      }
      return {...current, ...input.patch};
    });
    return invoiceJson(result);
  } catch (error) { return invoiceFailure(error); }
}
