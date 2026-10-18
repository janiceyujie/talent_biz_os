# Local contract storage and upstream integration verification

## Scope

Integrated upstream `main` at `92a4c2d3bb3ba1a51064db98cd7ec2d030235c08` (30 commits after the previous local base). Resolved overlaps while keeping the new project pagination, detail tabs, contacts and organization features alongside the local preview, assistant and document library.

The project remains TypeScript/Next.js with Drizzle and PostgreSQL. The user's reference to Hibernate was clarified as a verbal mistake; no Java ORM or parallel persistence stack was added.

Sample projects now use an isolated local list and detail source. Organization collections are cleared in sample mode so real business data cannot appear beside synthetic records. New project, contact and organization mutations use the same preview action guards.

## Local database and Storage

- Backed up local PostgreSQL before applying upstream migrations 0021–0024 and generated additive migration 0025.
- First catalog import: 72 published documents. Second import: zero changes, with the same 72 rows at version 1.
- Checked all 72 database titles/content sections/body hashes and Storage objects against their source assets. All bytes matched; each language/kind query returned 18 templates.
- Anonymous catalog and download requests returned HTTP 401. A missing template ID returned no row.
- In the signed-in Chrome session, expanded the library, switched between Chinese contracts and English quotations, and downloaded a Chinese contract. Its SHA-256 matched the source asset.
- Opened the merged project list in sample mode: five projects, correct phase counts, full detail and notes. Attempting to complete a sample to-do kept it unchecked and displayed the read-only notice.

## Automated checks

- ESLint passed.
- Next route type generation and TypeScript passed.
- 117 tests passed, including sample list integration, collection isolation, local-only import boundaries and all editable document assets.
- Translation checks passed: 1,851 message keys and 74 registry labels.
- Production build passed. It still reports the existing dynamic filesystem tracing warning in the model recording-directory helper; this is not a deployment verification.

No production database or Storage operation, SaaS deployment, email send, or new paid model evaluation was performed. The local backup and evaluation records stay outside Git. GitHub CI for this repository currently runs on pull requests and pushes to main, so a personal-branch push alone does not trigger that workflow.
