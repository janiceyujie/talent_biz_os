# Preview interactions and document library

Verified locally on 2026-10-07. No deployment, remote push, production data changes, or paid AI calls were performed for this change.

## Cause and correction

Preview mode previously intercepted click, change, submit, and drag events across the application. That also blocked safe actions such as editing reply text, applying templates, selecting records, and switching calendar views.

The global event interception has been removed. Preview restrictions now apply at mutation boundaries. Business record writes and external uploads remain blocked. Reply templates created in preview are kept in memory for the current session and disappear after a reload.

## Manual checks

- Drafts: create a preview reply template, select it, enter an invitation, apply the template, and clear the editor through the confirmation dialog.
- Document library on Drafts and Files: filter by role, select document language, switch between contracts and quotations, and download an editable Word file in an authenticated browser.
- Projects: select another record, open and cancel its editor, and verify that an archive attempt in preview returns an explanation without changing the record.
- Calendar: switch weeks, return to today, and select the month view. Preview dates use the fixture date.
- Finance: toggle the tax calculator input mode and download the ledger CSV.
- Notifications: open and close the dialog. Preview read/snooze mutations are disabled.
- Account: open the menu, navigate to Settings, and expand the language selector without changing the saved preference.

## Document coverage

Eight scenarios, each with a contract and quotation in English and Traditional Chinese: live performance, music licensing, management, model booking, branded content, video production, podcast sponsorship, and general creative services. All 32 DOCX files were rendered and visually inspected. These are editable starting templates, not lawyer-reviewed agreements.

Regenerate the files with `python3 scripts/build-document-templates.py` in an environment with python-docx. Text comes from the locale catalogs. When rendering with bundled LibreOffice on macOS, make system fonts available to Fontconfig so Chinese text renders correctly; the documents use Heiti TC for East Asian text.

## Automated checks

TypeScript, lint, translation parity, 98 unit tests, production build, and diff whitespace checks passed. Existing lint warnings remain for the upload image element and an unused import; the build also reports an existing dynamic filesystem tracing warning in the AI model loader.

## Existing limitations

- Database-backed draft saving is not implemented; the disabled control now has a visible explanation.
- General file uploads are not implemented; the Files page now explains the available alternatives.
- AI generation of multiple reply versions remains marked as in development.
- This is a targeted interaction regression check, not a claim that every workflow or browser has been exhaustively tested.

## Contract layout revision — 2026-10-08

The 16 contract downloads now follow a formal agreement layout: centered scenario-specific title, role-specific parties, nine numbered articles with native Word sublists, and a separate execution page. The supplied private agreement was used only as a layout reference; personal information, bank details, prices, and signatures were not copied. Quotation downloads remain byte-for-byte unchanged.

The contract names distinguish live performance, music licensing, artist management, model booking and image use, branded content collaboration, video production, podcast sponsorship, and creative services. Website previews and copyable text use the same localized content.

Validation: all 16 contracts rendered to three pages each and all 48 pages were visually inspected; preview text matches DOCX text for every contract; quotation hashes are unchanged. TypeScript, translation parity, the document-library test, and whitespace checks passed. No database changes, GitHub push, deployment, or paid AI calls were performed. Use `python3 scripts/build-document-templates.py --kind contract` to regenerate contracts only.
