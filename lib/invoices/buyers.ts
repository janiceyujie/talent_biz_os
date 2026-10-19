import { matchingAddress, type PostalAddress } from "./address";
import type { Contact, Organization, ProjectSummary } from "@/lib/types";

export type BuyerDetails = { buyerName: string; buyerAddress: string; recipient: string };
export type InvoiceBuyer = BuyerDetails & { id: string; label: string; kind: "organization" | "contact"; recommended: boolean; buyerAddressParts?: PostalAddress };

/** Only explicit links identify a project client. Names never establish identity. */
export function invoiceBuyers(contacts: Contact[], organizations: Organization[], project?: Pick<ProjectSummary, "clientId" | "counterpartyId">): InvoiceBuyer[] {
  const orgs = organizations.filter((o) => !o.archived);
  return [
    ...orgs.map((o): InvoiceBuyer => ({
      id: `organization:${o.id}`, kind: "organization", label: o.name,
      buyerName: o.name, buyerAddress: o.billingAddress || "", recipient: o.billingEmail || "",
      buyerAddressParts: matchingAddress(o.billingAddress || "", o.billingAddressParts),
      recommended: project?.clientId === o.id,
    })),
    ...contacts.filter((c) => !c.archived).map((c): InvoiceBuyer => {
      const org = orgs.find((o) => o.id === c.organizationId);
      return { id: `contact:${c.id}`, kind: "contact", label: [c.name, org?.name || c.company].filter(Boolean).join(" · "),
        buyerName: org?.name || c.company || c.name,
        buyerAddress: c.billingAddress || org?.billingAddress || "",
        buyerAddressParts: c.billingAddress ? matchingAddress(c.billingAddress,c.billingAddressParts) : matchingAddress(org?.billingAddress || "",org?.billingAddressParts),
        recipient: c.email || org?.billingEmail || "",
        recommended: project?.counterpartyId === c.id,
      };
    }),
  ].sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.label.localeCompare(b.label));
}

/** Missing values deliberately clear old client details to prevent mixed recipients. */
export function buyerDetails(buyer: InvoiceBuyer): BuyerDetails {
  return { buyerName: buyer.buyerName, buyerAddress: buyer.buyerAddress, recipient: buyer.recipient };
}
export function buyerNeedsConfirmation(current: BuyerDetails, next: BuyerDetails): boolean {
  return (Object.keys(current) as (keyof BuyerDetails)[]).some((key) => current[key].trim() !== "" && current[key] !== next[key]);
}
