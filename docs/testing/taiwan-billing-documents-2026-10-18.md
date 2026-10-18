# Taiwan billing document verification — 2026-10-18

Scope: local development only. No Git commit/push, deployment, paid API, ECPay
connection, real Gmail mutation or real email sending.

## Implemented

- USD commercial invoices and USD/TWD Taiwan payment requests have an explicit
  document kind saved in the existing PostgreSQL JSON snapshot. Legacy snapshots
  remain readable. No migration, table rewrite or new dependency was needed.
- Shared preparation, review, reminder and Gmail consent labels use billing
  terminology. Editor, list and preview show the document kind. Internal PR/INV
  references are explained as distinct from government invoice numbers.
- English and Traditional Chinese PDFs show the non-uniform-invoice notice on
  every page, including frozen Gmail attachments. Taiwan email templates identify
  payment requests. Custom email edits are preserved when kind/language changes.
- TWD receivables use their saved tax and totals, not an inferred rate. US tax
  review is unavailable for Taiwan payment requests and rejected server-side.
- Finance/project preparation actions and invoice-date reminders accept TWD.
- A future server-side Taiwan provider contract is reserved but unregistered.
  There is no formal issuance endpoint or successful-issuance state in this flow.

## Checks passed

- 327 unit tests, zero failures.
- 140 isolated fake-Gmail integration assertions, including PostgreSQL document
  kind/currency persistence, TWD inclusive totals, official-kind rejection,
  owner boundaries, draft creation, immutable attachment/download equality,
  duplicate suppression, simulated sent state, original-receivable settlement,
  and all-page reminder checks before preparation and after settlement.
- Integration traffic: 5 draft creations against a loopback fake Gmail API,
  zero send calls, zero draft update/delete calls, zero SMTP email.
- TypeScript without incremental output, targeted ESLint and locale parity
  (2,992 message keys and 74 registry labels).
- Production build passed using a separate .next-tw-billing-build directory.
  Temporary Next-generated tsconfig include paths were removed afterward.
- Browser review: saved Taiwan request, persistent non-tax-invoice notice,
  expanded info hint, list currency/kind, changing a USD draft to a Taiwan request,
  switching document language and saving while preserving customized email.
  Mobile preview at 390px has no horizontal overflow (350px client/scroll width),
  and the document header stacks cleanly. No browser error logs observed.
- Both language PDFs rendered to images and visually checked for notice,
  title, currency, totals and footer. These are synthetic fixtures, not valid
  customer requests or formal invoices.
- Both runs' disposable owners, invoices, jobs and private PDF objects were
  removed. A database readback confirmed zero matching test identities remained.

## Boundaries

Real Gmail consent/delivery and Taiwan provider issuance are not validated or
enabled. Existing exported PDFs remain unchanged to preserve document history.
Before formal e-invoice rollout, complete provider contracts, actual-seller
onboarding, separate issuance/audit migrations, idempotency/reconciliation,
formal document rules, and void/allowance handling. See decision 0025.
