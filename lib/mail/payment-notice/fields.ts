// What a bank or payment-app notice keeps (decision 0013, the restricted
// path): these fields and the Gmail link, never the body. Pure, no
// server-only imports: the schema and the Intake screen read it too.

export type NoticeFields = {
  amount: number;
  currency: string; // ISO 4217, e.g. TWD
  date: string | null; // YYYY-MM-DD, as the notice states it
  payer: string | null; // as the notice shows it, often partly masked
  last4: string | null; // the account's last four digits
  paymentId?: string; // the payment it was recorded on, once Mark as received is pressed
};

/** Unhandled notices are deleted after this long. */
export const NOTICE_TTL_DAYS = 30;
