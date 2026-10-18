# Contract and interface review

Date: 2026-10-08
Scope: local review only, on `user/Timothy0324/luna-assistant-eval`. No commit, push, deployment, schema migration, or business-record edits. The local account language was temporarily changed to Traditional Chinese for verification and restored to English. No paid AI requests were made.

## Contract review

Reviewed all eight scenarios in English and Traditional Chinese against practical essentials: identified parties, scope, schedule, acceptance, fees and taxes, payment, rights, cancellation, disputes, written changes, notices, and signatures. Existing scenario-specific titles and protections were retained.

| Scenario | Specific coverage retained |
| --- | --- |
| Live performance | Set, schedule, venue responsibilities, recording permissions |
| Music licensing | Work, media, territory, term, permitted uses |
| Artist management | Services, commission basis, authority, term |
| Modeling | Shoot scope, image uses, term, sensitive uses |
| Brand collaboration | Deliverables, approval, advertising uses |
| Video production | Deliverables, revisions, acceptance, source material |
| Podcast sponsorship | Placement, publication, approval, reuse |
| General services | Scope, milestones, revisions, deliverables |

Clarified invoice disputes and overdue-payment notice before work pauses. Added concise notice/receipt, attachment precedence, signature-authority, and counterpart wording within existing articles. Commercial periods and fees remain editable placeholders. These are adaptable templates, not jurisdiction-specific legal advice or lawyer-approved documents.

References reviewed, not copied wholesale:

- [Common Paper Professional Services Agreement](https://commonpaper.com/standards/professional-services-agreement/) and its [open repository](https://github.com/CommonPaper/PSA).
- [Freelancers Union contract essentials](https://blog.freelancersunion.org/2013/09/11/8-contract-provisions-every-freelancer-should-know-2/).
- [Musicians' Union live engagement contracts](https://musiciansunion.org.uk/legal-money/contracts-and-agreements/standard-contracts/live-engagement-standard-contracts).

All 16 contract DOCX files were regenerated and rendered: each remains three pages. All 16 changed second pages were visually inspected; the other 32 pages were pixel-identical to the previously reviewed rendering. Normalized text matches the actual application preview for all 16 contracts. All 16 quote files retain their previous SHA-256 hashes. The download bundle contains 32 editable DOCX files.

## Interface changes

- Drafts: secondary template/Gmail help moved to contextual info hints; saved drafts collapsed with their count.
- Finance: revenue breakdown and quote calculator grouped into a closed disclosure. Inputs survive collapse/reopen; balances, overdue items, and ledger remain visible.
- Inbox, files, calendar, assistant: secondary explanations use compact hints. Errors, unsupported-action notices, financial information, and token usage remain visible.
- Document library: only one document preview opens at a time; preview content is keyboard-focusable and scrollable. Downloads and copying remain outside the preview disclosure.
- Shared hints: hover, focus, click/tap, outside dismissal, Escape, viewport clamping, upward placement, focus indicators, and larger coarse-pointer targets. Reference: [W3C tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/).

## Verification

Passed: TypeScript, targeted ESLint, i18n parity (1,463 message keys and 74 registry labels), document test covering 32 DOCX files, production build, and `git diff --check`.

Browser smoke review: Today, Inbox, Projects, Drafts, Finance, Assistant, Contacts, Files, Calendar, Partners, and Settings. Exercised disclosures, template language selection, Word download, finance input preservation, hint dismissal, notification close, and language change/restore. Chinese Drafts and Finance rendered correctly. A 320px responsive Drafts view was visually checked with the library closed/open and an info hint open; cards, download controls, and hint stayed within the viewport.

Limits: this is not exhaustive end-to-end validation of every business workflow or browser. Existing unimplemented actions remain visibly identified. The build passes with an existing warning at `lib/ai/model.ts:132` about dynamic recording-directory filesystem tracing potentially enlarging deployment output; that unrelated logic was not changed in this review. No production release was attempted.
