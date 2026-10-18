# Manager mode and Projects verification

Date: 2026-10-12. Local-only on user/timothy0324/local-integration.

## Automated and database/API checks

191 tests pass, including manager capability defaults, Basic/Pro exclusion, active/expired plans, three/four-seat limits and downgrade behavior. Translation, lint, type and production build checks are completed for the batch.

An isolated manager and four fictional artist accounts exercised all eight artist selections against the paginated Projects endpoint. There were 240 sample projects across three artists; keyset pages had no duplicates. Counts matched filtered artist scope. A project detail returned only its own authorized calendar, payments, contract and timeline. A mismatched artist/project returned 404, a pending artist returned 403, and anonymous access returned 401.

Basic and Pro fixtures both held an active manager membership but could not access the portfolio snapshot, project list or project detail APIs. Manager expiry denied reads. A four-seat capability accepted an active four-artist roster; reducing it to three refused a one-artist subset until the roster was brought within limit. Revoking A denied its project details while B remained accessible.

RLS catalog state was verified. Anonymous and authenticated database roles could not read or assign manager capabilities. A deliberately mismatched cross-tenant todo was excluded from the project's next-action/detail data, then removed.

## Browser checks

Basic and ordinary Pro have no manager-mode trigger and no manager navigation. The eligible manager defaults to My workspace, with no extra artist filter row. Opening the header menu and enabling Manager mode shows authorized artist checkboxes. A/C selection follows into the original Projects page, retaining native list filters and showing only A/C labels.

Search for the signed trial collaborations returns two projects with matching phase counts. Project payments and contract sections open. Read-only detail tabs contain no create/edit/settle/archive/sign controls. Escape closes the picker. Turning mode off restores the personal Projects create action; turning it on remembers A/C. That selection also carries into Finance, Calendar and Today.

Screenshots under manager-mode show the compact menu open and closed, including the 320px phone picker. Projects list-to-detail and return navigation work on the phone. Document width matches the viewport at 320, 768, 1024 and 1440px; the final console contains no warnings or errors. Fresh final browser-console inspection is used instead of treating development hot-reload messages as final-state errors. Temporary fixtures are removed after sign-out, preserving the original workspace and persistent Sample Artist data.

## Remaining boundaries

Real subscription checkout/webhooks are not implemented. Local trial eligibility is a server-owned mock capability. Artist portfolio data remains read-only; Intake and assistant context are not yet combined. No production write, push or merge is part of this batch.
