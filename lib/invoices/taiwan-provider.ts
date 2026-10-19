import type { InvoiceSnapshot } from "./types";

/** Future server-side adapter contract only. No provider is registered or callable. */
export interface TaiwanEinvoiceProvider {
  issue(request: {
    talentId: string;
    issuerConnectionId: string;
    billingDocumentId: string;
    revision: number;
    idempotencyKey: string;
    approvedBy: string;
    snapshot: InvoiceSnapshot;
  }): Promise<TaiwanIssueResult>;
  reconcile(request: { talentId: string; issuerConnectionId: string; idempotencyKey: string }): Promise<TaiwanIssueResult>;
}
export type TaiwanIssueResult =
  | { state: "pending" | "unknown"; providerRequestId: string }
  | { state: "issued"; providerRequestId: string; invoiceNumber: string; issuedAt: string; uploadState: "pending" | "accepted" | "rejected" }
  | { state: "rejected"; providerRequestId: string; code: string };
// Future issuance needs separate owner-scoped PostgreSQL connection, issuance and audit
// tables, encrypted credentials, and private document storage. Gmail status never sets
// issuance state. Provider-specific payloads, voids and allowances require a later rollout.
