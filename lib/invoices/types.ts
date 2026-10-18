import type { BillingCurrency, BillingDocumentKind } from "./document";
import type { InvoiceTaxReview } from "./tax";

export type InvoiceSnapshot = {
  documentKind?: BillingDocumentKind;
  taxReview?: InvoiceTaxReview;
  documentLanguage: "en" | "zh-TW";
  sellerName: string;
  sellerAddress: string;
  sellerEmail: string;
  buyerName: string;
  buyerAddress: string;
  recipient: string;
  description: string;
  paymentInstructions: string;
  taxNote: string;
  subject: string;
  body: string;
  currency: BillingCurrency;
  subtotal: number;
  tax: number;
  total: number;
};
export type InvoiceStatus =
  "scheduled" | "draft" | "sending" | "sent" | "delivery_unknown" | "cancelled" | "draft_queued" | "draft_creating" | "gmail_draft" | "draft_unknown" | "draft_missing";
export type InvoiceSummary = {
  currency?: BillingCurrency;
  documentKind?: BillingDocumentKind;
  id: string;
  number: string;
  paymentId: string;
  projectId: string | null;
  buyerName: string;
  total: number;
  issueOn: string;
  dueOn: string;
  status: InvoiceStatus;
  revision: number;
  paid: boolean;
  received: number;
  withheld?: number;
  remaining?: number;
};
export type InvoiceDetail = InvoiceSummary & {
  snapshot: InvoiceSnapshot;
  deliveryMode: "local" | "smtp" | "disabled";
  from: string;
  sentAt: string | null;
  autoGmailDraft?: boolean;
  gmail?: { mode: "local" | "live" | "disabled"; ready: boolean; account: string;
    error: string | null; checkedAt: string | null; };
};

export type InvoiceDefaults = Pick<
  InvoiceSnapshot,
  | "sellerName"
  | "sellerAddress"
  | "sellerEmail"
  | "paymentInstructions"
>;
