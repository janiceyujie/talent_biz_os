# Invoice reminders, document lifecycle and Taiwan setup — local verification

## Delivered locally

- A newly due invoice can reopen Daily Briefing after the welcome dialog has already been viewed. Prompt tokens are scoped to the workspace/artist selection. Active snoozes remain hidden; expiry produces a new token. Prompts defer while another modal, popover or text editor is active.
- Re-entering preparation for an existing receivable opens its active document instead of showing a generic duplicate error. Tenant filtering applies to the lookup.
- PDF preview reads the document snapshot, status and storage key together. Editable previews are generated on demand without storing extra objects. Frozen Gmail attachments remain immutable; a missing frozen attachment returns a recoverable error instead of generating different bytes. Existing draft edits retain their document ID/number and increment the revision. No user document was deleted.
- Taiwan readiness settings are stored in PostgreSQL `preference`, keyed by person/workspace and `invoice.taiwan-setup`. Only the active owner can read/write this endpoint. No new schema migration or dependency is required.
- Readiness supports an undecided route, an unspecified service provider, or a future direct Turnkey connection. Registration and number-track checkboxes are declarations, not verified eligibility. There is no issuance call, credential field, official number allocation, transmission adapter or live provider enabled in this release.
- Ticket admissions are distinct from performer fees and merchandise. Admission taxes always need review. A narrow California ordinary merchandise rule was added for in-person retail handover of shirts, CDs or posters, with no shipping, exemptions, marketplace collection, bundled admission/services, or special goods. It requires an existing current combined locality rate and the user's exact-jurisdiction confirmation.

## Tax release and boundaries

`node --conditions=react-server --import tsx scripts/import-reviewed-merch-rule.mts`

The importer is local-development-only and idempotent. The review window is 2026-10-19 through 2026-11-18; this is a review window, not the law's effective dates. Re-running the importer does not extend it. Existing rate rows and their effective dates are unchanged. The previous rule data was backed up at `/private/tmp/taloox-tax-rule-before-20261019.sql`.

Official reference: https://cdtfa.ca.gov/industry/gig-economy/ — ordinary tangible-property sales and exceptions. All other unreviewed services/jurisdictions remain manual-review cases. This is not complete county/city coverage for the United States and does not provide address geocoding or an automatic tax-refresh service.

## Taiwan path

Official sources checked on 2026-10-19:

- https://www.gov.tw/News_Content_2_508287 — Turnkey transmission application.
- https://www.einvoice.nat.gov.tw/static/ptl/ein_upload/download/9.pdf — pre-launch transmission testing requirements.
- https://www.etax.nat.gov.tw/etwmain/tax-info/innotative-tax-e-reference/startup/invoice/VOpWrNx — business qualification, invoice tracks and platform setup.

Provider selection is still open. ECPay is not mandatory. Production integration needs the chosen provider/Turnkey authorization, number-track management, issuance/reconciliation, void/allowance handling, secure credentials, and acceptance testing. A generated TWD PDF remains a payment request, never a Taiwan uniform invoice.

## Verification

- 386 unit tests passed.
- 160 invoice/Gmail acceptance checks passed on `taloox_refresh_20261019`, using a loopback fake Gmail API and synthetic identities. Zero send requests and zero Gmail update/delete requests.
- 65 reminder persistence/ownership checks passed with disposable local fixtures.
- Browser checked at 390 × 844 and 1024 × 900: automatic daily briefing, two-hour snooze removes the item, prepare opens the existing invoice, a newly changed due invoice reopens after the welcome, and Turnkey readiness saves while official issuance remains disabled. Settings checkbox alignment corrected during visual review.
- i18n parity, ESLint, TypeScript and production build passed. Build output was isolated from the user's dev server.
- No real emails, official invoices, paid APIs, deployment or GitHub push. Synthetic fixtures were removed. Screenshot: `/private/tmp/taloox-taiwan-invoice-setup-20261019.png`.

## Remaining operational work

- Choose a Taiwan transmission route; implement and validate the real adapter against the merchant's authorized environment. Current work is setup readiness, not a completed official e-invoice integration.
- Closed-browser web push and future iPhone notifications are not connected; current reminders need the web app running.
- Expand reviewed US service rules and verified locality coverage separately. Unknown data never means zero tax.
