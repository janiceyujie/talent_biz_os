# UI branch split — 2026-10-20

Sensitive areas: none in the extracted UI delta. No database, authorization, AI request, mail, worker or dependency change.

## Current review order

All names use `user/timothy0324/`. These branches are cumulative; review each against the preceding branch, not all against main.

| Order | Branch | Review base | Scope |
| --- | --- | --- | --- |
| 1 | workspace-foundation | main | Existing shared workspace and Janice integration |
| 2 | invoice-settlement | workspace-foundation | Invoice, receipts, withholding, corrections and settlement |
| 3 | daily-reminder-experience | invoice-settlement | Reminders, manager capacity, profile setup and functional layout |
| 4 | opportunity-discovery | daily-reminder-experience | Eligibility, competitions/exhibitions and refresh policy |
| 5 | ui-visual-polish | opportunity-discovery | Frosted materials, visual states and decorative assistant mascot/motion |

Use **ui-visual-polish** for the full product including the existing visual treatment. Earlier branches still have usable standard styling; this is a review split, not a redesign. After each squash merge, update the next review base and verify the diff according to the repository workflow.

## Extraction boundary

- Move the decorative frosted backgrounds, borders, shadows, blur, modal surfaces and their reduced-transparency/high-contrast fallbacks from the third branch to the fifth.
- Move the assistant mascot SVG, decorative placement and pending-state animation, including reduced-motion support. The underlying conversation provider, request lifecycle, history, retry, error handling and text loading indicators are unchanged.
- Keep keyboard focus, menu hit targets, mobile import visibility, wrapping and Intake navigation layout in the third branch. Removing those would break existing functionality when reviewing that branch alone.
- Keep manager picker scrolling, capacity labels, reminder dialogs, profile forms and opportunity-specific layout with their respective features. Existing foundational UI is not being redistributed.
- Keep all migrations and persisted data unchanged. This is a forward-only split of already-published source; no history rewrite or force push. The fourth branch receives the third's extraction before the fifth reapplies only the visual layer.

The running local checkout, web server and database remain on the complete development version. No customer email, provider request, deployment or database migration is part of this operation.

## Verification

Run unit tests, type checking, lint, bilingual catalogue checks and production builds on the changed third, fourth and fifth tips. Compare the fifth's complete product source against `35e07df`: all non-document product files must be byte-identical, including CSS, assistant UI, all migrations and business logic. This confirms extraction fidelity; prior browser acceptance reports describe the unchanged UI, not a new browser test in this split.
