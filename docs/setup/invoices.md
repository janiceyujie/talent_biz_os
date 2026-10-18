# Invoice preparation and Gmail drafts

This local implementation prepares USD service invoices from existing receivables and creates drafts in the owner's connected Gmail. The owner reviews and sends in Gmail. There is no invoice send endpoint, SMTP delivery, automatic sending, or model call. This does not implement Taiwan government e-invoices, determine sales-tax liability, charge payment methods, or issue credit notes.

## User flow

1. Create a USD receivable in Finance or use a payment on a signed project. Open Invoices and choose Prepare invoice.
2. Choose an explicitly linked company/contact or another saved partner. Apply its billing name, address and email. Missing fields clear previous values; replacing entered details requires confirmation. Existing invoice snapshots remain independent of partner changes.
3. Confirm issuer details, recipient, payment instructions, language, dates and tax treatment. Save/apply billing defaults explicitly; defaults exclude customer details, tax and email text. Optional partner writeback is separate (below).
4. Save a local draft or schedule its preparation. Optionally enable automatic Gmail draft creation on the issue date; this requires enabled integration and the owner's compose grant at save time. Saving this option is explicit approval for that invoice revision and account. Without opt-in, the worker only prepares the local draft.
5. Preview the PDF and email. Confirm the recipient/attachment and choose Create Gmail draft. The worker attaches the PDF and uses the connected Gmail account as From, with the issuer email as Reply-To.
6. Open Gmail drafts, review the email and PDF, then send yourself. Taloox never overwrites edits made in Gmail. Check Gmail status reconciles metadata; the background scheduler also checks bounded batches.
7. Confirm full receipt only after payment arrives. This updates the existing receivable, never creates a duplicate income row, and does not infer payment from sending.

The list uses 20-row cursor pagination. Scheduled items remain scheduled until the workspace-local issue date. Needs review includes ready, Gmail draft and unresolved states. Email details are collapsed; both languages and a narrow mobile dialog are supported.

The global login briefing can now prompt preparation on a saved payment reminder date, before billing details are filled in. See [Daily briefing and invoice reminders](reminders.md).

## Persistence and boundaries

- PostgreSQL stores owner-scoped invoice snapshots, revisions, dates, approval, connected account identity, provider IDs, sync state and the private PDF object key.
- After the workspace foundation migration 0030, migration `0031_invoice_settlement.sql` introduces invoices, partner billing fields, Gmail draft tracking and explicit automatic-draft consent. Back up before migration; do not rewrite applied migrations.
- PDF bytes use private object storage at `<talentId>/invoices/<invoiceId>/<revision>.pdf`. Draft preview does not write an object. Creation freezes the PDF; authenticated downloads enforce ownership. Retention must cover both rows and objects.
- Gmail is authoritative for the actual draft and user edits. Taloox retains the original billing/email snapshot, not a continuously synchronized copy of the edited body or attachment.
- Owner-only routes, same-origin mutation checks and revisions protect writes. Manager/portfolio visibility does not authorize invoice creation, download or mailbox actions.
- Only the worker decrypts Gmail refresh tokens. Web routes queue identifiers; existing encryption and owner locks remain in place. Reconsent invalidates cached access tokens through the encrypted token nonce.
- Ordinary Gmail ingestion stays read-only. Optional `gmail.compose` consent is separate and disclosed; Google bundles draft management and sending in this scope, while this implementation exposes only draft creation and metadata reads. See [decision 0024](../decisions/0024-gmail-invoice-drafts.md).

## State and duplicate handling

`draft` -> `draft_queued` -> `draft_creating` -> `gmail_draft` -> `sent` (only after a matching Gmail SENT message is observed).

Creation reserves the row and payment before work. Queue attempts are limited to one, and the POST is never automatically retried. Failures before POST return to a local draft; an ambiguous POST result becomes `draft_unknown`. Reconciliation tries to recover the existing draft by its Message-ID, bounded to five pages of draft references. A known draft that disappears becomes `draft_missing`, not sent. A unique matching SENT message is required before recording sent time; this is not proof of customer delivery or receipt.

The worker preserves the stable draft ID and refreshes Gmail-normalized Message-ID metadata. It never updates/deletes a Gmail draft. If identity cannot be established, the invoice remains unresolved; automatic recreation and manual force-sent overrides are deliberately absent. Switching Google accounts does not redirect existing approved invoices to a different mailbox.

Exporting locks the payment's amount, tax, currency, project, invoice reference and due date. Receipt/notes follow existing Finance rules. Local unexported drafts can be cancelled without cancelling the receivable. Legacy `sending` / `delivery_unknown` records are retained for historical compatibility, with no old send/retry API.

## Configuration and authorization

1. Verify the intended local database, back it up, and run `npm run db:migrate`.
2. Run the existing app, private object store and worker. The existing five-minute invoice scheduler prepares due items and reconciles at most 20 stale draft records per pass.
3. Default: leave `INVOICE_GMAIL_DRAFTS_ENABLED` unset/off. Local verification uses only a loopback fake Gmail/token server and a loopback database. The normal `.env.local` is not modified by the test.
4. Before an authorized real-account pilot, add `https://www.googleapis.com/auth/gmail.compose` to the existing Google OAuth app's data-access scopes. Keep the existing Gmail API and `/api/mail/callback` redirect configuration. The account owner reconnects the same Gmail account, explicitly selecting invoice-draft permission. Declining it leaves ingestion available but invoice draft creation unavailable.
5. Production draft writes require `INVOICE_GMAIL_DRAFTS_ENABLED=1`; development writes to real Gmail additionally require `INVOICE_GMAIL_LIVE_LOCAL=1`. Custom Gmail/token endpoint overrides are rejected for live use. Enabling real-account writes is a separate rollout step, not part of local QA.
6. Restart the worker when enabling configuration. No Gmail password or secret needs to be pasted into a conversation. Google consent/review requirements must be completed before a public release.

SMTP settings still serve unrelated authentication/system mail. A Taloox invoice sender domain is not needed for this Gmail draft flow. Real Gmail consent, draft attachment rendering, manual sending and delivery remain unverified until an authorized account pilot.

## Project-to-invoice continuation

For a new positive USD receivable in a project, **Save and prepare invoice** saves the receivable once and opens the invoice editor inside the same project. The existing Save action remains available. The invoice editor selects the saved payment and carries forward its amount, due date and project buyer details; missing billing details can be completed before PDF review. New project payments and generated deposit/balance plans inherit the project currency.

Saving the invoice consumes the continuation request, including across data refreshes. Draft creation and status refresh keep the review dialog open with the updated result. Closing returns to the project payments tab. Creating a Gmail draft does not mark a payment as received or the invoice as sent. Gmail delivery still requires the user to review and send in Gmail.

## Optional partner writeback

After explicitly selecting a company or contact in the invoice editor, Save back to partner opens a fresh database review. The user selects address and/or email and confirms the displayed destination and before/after values. Empty fields never erase partner data; names, company relationships, and invoice snapshots are excluded. Contact writeback changes that contact only, even when the original invoice details fell back to company billing data. This is a separate explicit save; cancelling the invoice later does not undo a confirmed partner update.

The owner-scoped buyer-details endpoint rejects archived, missing, foreign and manager-delegated targets. Selected fields are compared against the reviewed values inside a row-locked transaction; stale edits require a new review. No schema migration or new dependency is needed.

## Validation

```sh
npm test
npm run lint
npm run i18n:check
npx tsc --noEmit
npx tsx --conditions=react-server scripts/check-invoice-gmail-drafts.mts
npx tsx --conditions=react-server scripts/check-invoices.mts
npm run build
```

The Gmail script starts an isolated local app on port 3002 and a fake Gmail/token server on 54500. It exercises scope/owner/CSRF restrictions, confirmation, concurrency, PDF MIME/storage equality, normalized metadata, expired grants, Finance locks, user-edited/missing/sent drafts, ambiguous-response recovery, opted-in scheduling, pagination and zero send calls. It deletes its synthetic identities, rows, jobs and objects. The legacy invoice suite covers partner import/writeback, defaults, PDF rendering and receipts using explicitly synthetic sent-history rows, with no delivery.

The PDF generator remains unchanged: embedded OFL Noto Sans TC subsets, English/Traditional Chinese labels and private downloads. See `assets/fonts/README.md`. Browser QA covers both UI languages, disabled confirmation, creation feedback and 390px layout. Real mailbox writes, mail sending, Git push and deployment are excluded.

Sources: [Gmail draft creation](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create), [Gmail draft metadata](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/get), [OAuth scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

Final local validation: 252 unit tests, 73 fake-Gmail integration assertions, 125 invoice regression assertions, TypeScript, targeted lint, locale parity and an isolated production build passed. The build retains the existing dynamic AI-recordings-path tracing warning in `lib/ai/model.ts`. No real-account delivery was tested.

Project-continuation validation (2026-10-17): 84 isolated fake-Gmail assertions passed, including the saved-payment ID, workspace ownership, amount validation and USD deposit/balance currency. Browser QA completed project receivable creation, in-place invoice editing, PDF review, fake Gmail draft creation and close/reopen behavior. PDF content was rendered and visually checked. Send calls: zero. TypeScript, targeted lint and locale parity passed. These checks used synthetic accounts and do not establish real Gmail delivery.

## Verified US sales-tax calculation (local, 2026-10-17)

The editor offers **Use the receivable's tax** or **United States sales tax** in a collapsible section. The US workflow records one state/DC jurisdiction, the service/delivery address used for tax, a treatment (collect, non-taxable, exempt, or not required), a manually verified combined rate, whether the recorded amount includes tax, and an internal source/reason. State selection never determines taxability or supplies a rate. Changing state clears the previous decision; changing invoice inputs clears confirmation. Invoice documents show the approved rate beside the tax amount, while internal sources remain outside the PDF.

This is a single-receivable, single-treatment workflow. It does not handle mixed taxable/exempt line items, independently rounded jurisdiction components, registration, remittance, income tax, multi-jurisdiction sourcing, or automatic liability determination. Future-dated invoices use the approved snapshot; there is no automatic rate refresh on the scheduled date. Review dates and applicable rates before approving automatic draft creation.

The optional `taxReview` JSON snapshot stores the country, state, location, treatment, rate, included flag, source, server verification timestamp, and `method: manual`. It is scoped to the invoice owner. Saving locks the payment, compares the reviewed amount/rate/inclusion basis, checks the draft revision and locks, then updates the original receivable and invoice snapshot in one transaction. It neither creates another income row nor changes the project quote or other installments. Exported or queued Gmail drafts cannot be edited through this flow. Legacy invoice snapshots remain readable.

Migration `0031_invoice_settlement.sql` widens existing project/payment tax rates to numeric(7,4), preserving existing values. Integer arithmetic now retains four percentage decimal places and rounds the resulting currency amount to minor units. Project, payment, intake and Finance calculator inputs use the same precision. A local PostgreSQL backup was taken before applying the generated migration.

A future provider integration should calculate tax from a complete seller registration/collection profile, relevant seller/customer delivery addresses, transaction date, product/service tax code and exemption data. Do not substitute a state-rate lookup for an actual transaction-tax calculation. No external tax API, account, credential, paid service or AI call is used in this release.

Primary references reviewed 2026-10-17:
- [New York combined rates and delivery jurisdiction](https://www.tax.ny.gov/pubs_and_bulls/tg_bulletins/st/sales_tax_rates_additional_sales_taxes_and_fees.htm)
- [California state/local/district rate lookup](https://www.cdtfa.ca.gov/taxes-and-fees/know-your-rate.htm)
- [USAGov state tax agencies](https://www.usa.gov/state-taxes)
- [TaxJar rates versus transaction calculations](https://support.taxjar.com/article/810-taxjar-api-which-endpoint-should-i-use-for-calculations)

Validation: 260 unit tests and 104 isolated fake-Gmail checks passed, including four-decimal storage, cent rounding, exemptions, stale payment/revision conflicts, rollback on duplicate invoices, owner restrictions, immutable exported drafts, PDF generation and zero send calls. Browser checks in English and Traditional Chinese verify rate changes invalidate confirmation, state/receivable changes clear the prior decision, and inclusive/exclusive totals update before saving. The saved snapshot and payment were read back from PostgreSQL. Desktop and 390px layouts, mobile hint bounds and the rendered PDF were visually checked; no browser console errors were observed. Synthetic identities were removed after QA.

## Public tax reference catalogue

The local catalogue and its deliberately limited coverage are documented in
[tax-catalogue.md](tax-catalogue.md). Manual tax review remains available.
Catalogue-backed invoices preserve server-verified rule and rate evidence; this
is not nationwide automatic tax support.
