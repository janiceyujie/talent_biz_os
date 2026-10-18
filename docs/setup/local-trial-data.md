# Local two-month trial data

The October–November 2026 trial dataset is stored in the local PostgreSQL workspace. File bytes are in the local Supabase S3-compatible Storage bucket; the database stores file metadata and storage keys. It is editable business data, separate from browser-only preview fixtures.

## Contents

- 17 projects covering offers, negotiation, signed work, execution, collection, closure, rejection and cancellation.
- 8 organizations, 10 contacts and project relationships.
- 39 payment records in TWD, USD, HKD, EUR, GBP and JPY, with deposits, balances, costs, settled amounts and pending amounts. Each currency remains separate.
- 37 calendar events spanning 2026-10-01 through 2026-11-30, plus 30 tasks including preparation, invoice/receipt collection and grant deadlines.
- 19 synthetic incoming messages, 17 prebuilt analyses and 20 Chinese/English reply templates or past replies. Synthetic analyses are explicitly labeled `synthetic-fixture:no-api-call`; importing does not call AI or read/send Gmail.
- 14 contract versions, including an unaccepted proposed revision that does not change agreed project terms.
- 8 stored files: editable Word contract/quote templates, a budget CSV and production notes. Word attachments are templates, not signed legal documents.
- One new preparation application and four deadlines attached to an existing official grant announcement. The existing application was preserved. Official source listings and eligibility rules were not fabricated or changed.

All invented business names and record labels carry a sample marker. Contacts use `example.invalid` email addresses. These records do not establish actual payments, commitments, grant submissions or awards.

## Import

Run only from this repository with the local development environment loaded:

```sh
npm run db:seed-trial -- --talent <local-workspace-uuid> --month 2026-10
```

The importer refuses remote databases, remote storage and non-development environments. It requires one active workspace owner. Stable IDs are scoped to workspace and month; repeated imports insert nothing for existing IDs and preserve subsequent user edits. Files are verified by reading the bytes back from storage. Database inserts use one transaction and an advisory lock.

Workspace-specific manifests are saved under ignored `.local-trial/`. An audit record stores the imported IDs, allowing future cleanup to target only this batch. Do not blanket-delete a workspace to reset trial data.

`LOCAL_TRIAL_WORKSPACE_ID` in ignored `.env.local` selects the local workspace whose persisted data should be shown instead of the old read-only browser preview. It does not change authentication, connected services or the database schema.

## Validation

Original workspace rows were compared before and after importing and were unchanged. A second import added zero duplicates. Storage read-back matched all eight files. An isolated review account with the same dataset verified page rendering, Word downloading and local assistant summaries. The assistant reports balances per currency with zero AI tokens for deterministic lookups.

The 177-test suite, TypeScript, ESLint, production build, translation parity (2,092 keys) and diff checks passed. Authenticated file access returned 200 for the review account's own Word file, 404 for another workspace's file, and 401 without authentication. The temporary review account, its storage objects and its local chat history were removed after validation.

Changes and data remain local. No commit, GitHub push, production deployment or database migration was performed.
