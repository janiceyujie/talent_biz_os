# Curated contract and quotation storage

The library in Drafts and Files now reads its content from PostgreSQL through Drizzle. It contains 18 scenarios, each with an English and Traditional Chinese contract and quotation (72 documents).

## Storage boundary

- `document_template` stores the scenario, role, language, kind, title, introduction, structured sections, preview text, version, content hash, publication state, and the Word object's key and size.
- Editable Word files are immutable objects in the existing private Storage bucket. Object keys include a content hash; database rows store keys, never signed URLs or file bytes.
- This is a shared, curated catalog with no customer-specific names, signatures, project details, or payment information. Actual customer files and contract versions remain in the existing talent-scoped `file` and `contract` tables. Downloading a template does not create a signed agreement or a customer contract record.
- The new table has RLS enabled with no browser policies. The server requires a signed-in person with an active workspace, and only returns published templates. Its download route resolves a database ID; clients cannot supply a Storage key.
- The source Word assets are versioned under `assets/document-templates`, outside `public`. The browser uses authenticated API downloads rather than public static file paths.

## Local setup

Use the existing local PostgreSQL and S3-compatible Storage configuration in `.env.local`.

1. Back up the local database.
2. Run `npm run db:migrate` to apply pending migrations, including `0025_document_template.sql`.
3. Run `npm run db:seed-templates`.
4. Open Drafts or Files and expand the template library.

The importer refuses a non-loopback database or Storage endpoint. It uploads the source objects before publishing catalog changes in a single database transaction. An advisory lock serializes concurrent imports. Identical imports preserve IDs and versions. Changed content produces a new version while retaining the previous row and object; only one revision per scenario/kind/language is published. Re-importing an older exact revision republishes that revision without rewriting it.

To revise a template, update both locale catalogs, regenerate the relevant Word assets with `python3 scripts/build-document-templates.py`, review the rendered documents, then repeat the local import. The Python generation step requires the existing document-generation environment; no Python dependency is added to the application runtime.

GitHub contains code, the migration and source templates. A Git push does not copy local database rows or Storage objects. No remote migration or catalog publication is part of this local setup. A future production import needs a separately authorized release workflow; do not remove the local-only guard to make it run remotely.

## API

- `GET /api/document-templates?locale=en&kind=contract`: published library content, with locale `en` or `zh-TW` and kind `contract` or `quote`.
- `GET /api/document-templates/:id/download`: an authenticated attachment response containing the stored DOCX.

The collapsed library makes no catalog request. Requests are cancelled when the language, document kind or expanded state changes. Loading, empty, failure and retry states are translated. Neither API calls a model.
