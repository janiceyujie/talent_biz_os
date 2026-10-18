# Payment receipts and withholding

Local implementation: migration `0031_invoice_settlement.sql` adds an append-only `payment.receipts` JSONB ledger. Each entry has a stable request ID, receipt date, actual cash and confirmed withholding. The existing payment owns the invoice, currency, gross amount and due date; it is not split or duplicated when cash arrives in installments.

- Outstanding = max(0, gross amount - cumulative cash - confirmed withholding), calculated in currency minor units.
- A short receipt requires an explicit choice: unpaid or confirmed tax withholding. Withholding requires an explicit per-receipt amount; it can cover only part of the shortfall, leaving the rest unpaid. No rate or withholding amount is inferred. An unexplained legacy shortfall remains outstanding until resolved.
- An unpaid remainder keeps the payment expected, with the same due date and reminder identity. A zero remainder marks the payment settled. Withholding never counts as received cash.
- The entry editor adds a new receipt; editing its label, due date or notes does not replace payment history. Amount, currency, tax and direction are locked once receipts exist. Voiding an erroneous payment retains the audit history and excludes the entire entry from totals.
- Saves lock the account-scoped payment row. Stable request IDs prevent duplicate receipts; a receipt-count revision rejects stale editors. UI-supplied ledger arrays are ignored.
- Reports use each receipt's own date. Overview, reminders, calendar, cash scenarios, manager views and assistant data use the same outstanding-balance calculation. CSV exports separate cumulative cash, withholding and outstanding amounts.
- Project closure refuses unpaid receivables or payables. Email intake records an unexplained difference as unpaid and never assumes withholding. Invoice receipt actions add only the remaining amount, preserving the original invoice total and earlier cash dates.

## Local checks

Run `npm test`, `npm run i18n:check`, and `node --conditions=react-server --import tsx scripts/check-payment-receipts.mts`. The acceptance script requires the local development database, creates disposable accounts, exercises authenticated actions and invoice receipt endpoints, and removes its records in `finally`. It does not send email. `--keep-ui` retains synthetic fixtures for browser QA; delete those specific fixture accounts after inspection.

## Receipt corrections and withdrawals

Receipt amendments append a new JSONB entry referencing `replaces`; they never delete or overwrite the original. Each records the reason, server timestamp and authenticated person. Only the latest non-withdrawn version counts toward cash, withholding, reporting dates and settlement. Existing JSONB records require no migration. The editor offers a confirmation preview and keeps superseded records visible.

The action locks the account-scoped payment row, verifies the full history revision, rejects changes to superseded entries and makes identical request retries idempotent. Reopening debt clears the current person's old read/snooze state for that payment. Reminder timing still follows the payment due date. Correcting a receipt does not change invoice documents, send messages, move money or automatically close projects. If an amendment leaves a positive balance on a completed project, the same transaction returns it to `collecting_payment`, removes its archive flag and writes a `project.stage_changed` audit entry identifying the receipt. Other project stages remain unchanged. The transaction locks the project before the payment, matching project closure, so concurrent closure cannot leave newly restored debt marked complete. Paying the remainder does not automatically close the project; the user confirms completion.
