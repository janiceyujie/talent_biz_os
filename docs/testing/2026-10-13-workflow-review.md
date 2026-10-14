# Local workflow review — 2026-10-13

Scope: formal `talent_biz_os`, branch `user/timothy0324/local-integration`. Local changes only; no commit, push, merge, production deployment, real-mail sync or paid model call. Existing uncommitted work was preserved.

## Changes in this review

- Sidebar: distinct icons for Manager workspace and Artists & partners; Calendar moved next to Today.
- Intake: one compact intake toolbar, Gmail link to connected-service settings, usage details inside the help hint, exhausted allowances still visible. Empty mailboxes no longer render an unused reader card.
- Settings: external creator analytics launchers collapse as one group. They remain explicitly external dashboards, not claimed API integrations. AI copy now says project/payment/deadline changes require confirmation; it no longer incorrectly implies source records are never stored before confirmation.
- Local preview: wait for the workspace-specific preference before mounting business UI. A saved real-workspace preference no longer first renders sample records; provider state resets on identity/workspace changes.
- Grants: optionally choose a submission date/time while saving an opportunity. The application, shared to-do, and task link commit together. Repeated saves do not create another application/task or overwrite an existing plan.
- Application panel: next submission and active tasks remain visible; progress/project/notes and official reference details collapse. Changing a new task's kind keeps manually entered dates/times and custom titles.
- Calendar: optional notes collapse, and grant tasks offer a route back to the source application. The existing grid editor already exposes this route; the list view now does too.
- Projects: linked grant applications appear within existing related records, creating a direct return path without another main section.
- Phone grants: task titles use available width with their editable date below, instead of competing with a fixed date column.
- Gmail: additive PostgreSQL tables, metadata adapter, atomic sync checkpoints, queue/reconciliation handlers, conservative relevance and an injectable embedding adapter. See decision 0021 for exact limits. Disabled by default.

## Recommended grant journey

Discover an official opportunity → confirm eligibility → start preparing and optionally set the intended submission date → manage tasks on the application or the same Calendar/Today records → record the outcome → link actual execution to an existing signed project when appropriate → track evidence, reports and real payments using the existing modules.

Saving an opportunity does not create a signed deal, recognize income or submit anything to an authority. Applications can remain independently tracked. The current sources and schema cover grants, not government procurement tenders. Google Calendar delivery is a separate connected-calendar capability; saving a grant has been verified in Taloox Calendar, not in an external Google account.

## Verification

- Lint and TypeScript checks passed.
- Locale parity: 2,279 keys plus 74 registry labels.
- Full unit suite: 206 passing tests, including 15 new mail-pipeline tests.
- Production compile passed using `.next-test` so the running dev server's cache was not overwritten. The final confirmation compile also passed after the last fixes.
- Seven isolated local PostgreSQL assertions passed: per-tenant mail rules for the same provider ID, deduplication, manual decision preservation, failed-sync cursor retention, revocation during fetch, disconnected connection no-op, and atomic grant/to-do linkage.
- All 12 main navigation pages loaded at desktop and 390px phone width without document-level horizontal overflow. Calendar and Projects were checked after asynchronous loading completed. This is navigation/layout coverage, not proof of every possible action and data combination.
- Browser grant flow: typed `2026-10-21` and `1530`, saved once, observed the resulting event in Calendar, edited it there to `1645`, returned to the grant, and observed `16:45`. Linked a disposable signed project and followed the reciprocal project/application links.
- English settings expanded the creator analytics group; all three official dashboard links were visible. English Intake retained enabled paste/upload actions in the real test workspace and removed the unused reader.
- Changed disclosures, empty states, and grant layouts received a bounded visual review followed by a confirmation pass. The temporary test accounts, project, application and mail decisions are separate from the user's trial data and were removed after verification. The existing seeded trial records were preserved.

## Feature checkpoint and next sequence

| Area | Local implementation | Remaining before launch |
|---|---|---|
| Calendar, finance, projects, drafting | Existing core pages; shared PostgreSQL records and role-aware UI | Real-user scenario acceptance and operational monitoring |
| Grants | Official-source cache, personal application/task tracking, local scheduled refresh design, project linking | Always-on deployed worker, freshness alerts, source-failure recovery and deployment configuration |
| Manager portfolios | Existing owner-held artist accounts, invitations, entitlement-gated selection across Today/Calendar/Finance/Projects, read-only artist views | Billing-backed entitlements and multi-account acceptance/security testing before enabling publicly |
| Contract and quote library | Existing bilingual Word catalog; metadata in PostgreSQL and files in object storage | Production bucket policies, review of template applicability and licensing, retention/versioning operations |
| Assistant | Existing bounded local answers, AI routing, dock and per-user local history | Durable production chat storage, retention/export/deletion policy, server-side plan quotas and cost controls |
| Gmail | OAuth foundation plus the new disabled metadata/relevance sync phase | Owner review/recovery UI, bounded body and attachment import, payment redaction/expiry, actual model adapter/evaluation, Pub/Sub/watch, monitoring and external authorization requirements |
| Spotify/Apple analytics | Official dashboard launchers | Provider-approved analytics access; do not promise self-serve connection until access exists |
| Public plans and iPhone app | Product decisions and local capability experiments | Production billing/webhooks, entitlements, app distribution and mobile acceptance remain separate work |

Next: finish the Gmail ingestion vertical slice using labeled synthetic mail, then an explicitly authorized pilot mailbox: decision → bounded fetch/cleanup → existing Intake → person confirms → project/task/payment proposal. Measure missed work mail, unnecessary imports, and per-mail cost before choosing thresholds. Keep semantic scoring separate from durable ingestion so changing models does not change business records.

In parallel with launch preparation, promote the grant worker from local-only to an always-on deployment with freshness monitoring, and move assistant history from local files to scoped durable storage. Do not remove local safety gates merely to make a demo appear connected. These unfinished integrations are explicit remaining work, not completed features hidden behind buttons.
