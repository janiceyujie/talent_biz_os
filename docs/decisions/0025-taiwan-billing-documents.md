# Separate payment requests from Taiwan uniform invoices

Status: local implementation; official Taiwan issuance deferred.

## Product boundary

A commercial invoice and a Taiwan payment request are billing documents. Neither
is a Taiwan uniform invoice. Document language does not determine document kind,
tax jurisdiction, or the issuer's eligibility. TWD defaults to a Taiwan payment
request; USD supports either kind. This release does not add other currencies or
infer a Taiwan tax rate. The existing receivable supplies confirmed amounts.
The US tax-review controls apply only to the USD commercial-invoice workflow.

The shared list, reminders and actions use neutral billing terminology. The
editor, review, bilingual PDF and generated Taiwan email templates explicitly
identify payment requests. The PDF notice remains on every page, including a
frozen Gmail attachment. PR/INV references are internal document references.
Email delivery, cash settlement and official invoice issuance are distinct.
A sent or paid request never becomes an official tax invoice.

## Storage and compatibility

`invoice.snapshot.documentKind` stores the approved kind in the existing
owner-scoped PostgreSQL JSON snapshot. `snapshot.currency` stores USD or TWD;
list summaries carry both. Existing snapshots without a kind remain commercial
invoices; their language is never used to reclassify them. New Taiwan requests
use a PR reference. Editing an unexported draft keeps its original reference.
No new migration is required for these JSON fields. No applied migration or
existing customer document is rewritten. Already-exported PDFs remain immutable.
Private PDF storage, revision locks, owner checks, no-duplicate-receivable rules
and optional Gmail compose approval are reused. There is no formal issuance
endpoint, provider credential, provider network call or send action.

## Deferred provider boundary

`lib/invoices/taiwan-provider.ts` reserves a server-side issue/reconcile contract;
no adapter is registered. `taiwanEinvoiceCapability.available` remains false.
The current billing API accepts only the two billing kinds and rejects an
attempt to submit a formal Taiwan invoice kind.

Before enabling any provider, add reviewed migrations for these separate data:
- Owner-scoped issuer connections: actual seller tax identity, authorized
  merchant binding, encrypted credentials and eligibility/connection status.
- Official issuance records: billing document/revision, immutable approved
  tax payload, idempotency key, provider request ID, official invoice number,
  issuance time, transmission acknowledgement and separate issuance state.
- Append-only actor/time audit events, correction/void/allowance relationships
  and private artifact object keys. PDF bytes remain in private object storage.

A worker must lock the source revision, confirm actor permissions and reserve a
unique idempotency key before requesting issuance. Ambiguous provider responses
must reconcile rather than reissue. Only verified provider evidence can record
an official number or successful transmission. Gmail creation/sending and payment
receipt must not mutate issuance state. Formal invoices require distinct UI,
PDF/print handling, and provider-specific validation; never reuse the payment
request PDF as a formal invoice. Void/allowance flows and seller onboarding are
prerequisites to rollout, not exposed placeholders in this release.

Pricing, platform/submerchant contracts and per-issuer onboarding remain open.
No claim is made that multiple tax entities can share one seller identity or one
retail invoice-volume package.

## Local verification

See `docs/testing/taiwan-billing-documents-2026-10-18.md` for test results.
