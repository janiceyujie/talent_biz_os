# Grants and local manager workflow verification

Date: 2026-10-12. Checkout: `user/timothy0324/local-integration`. Local-only changes; no commit, push, merge, production deployment or production database write.

## Automated checks

- Translation catalogs match: 2,192 keys and 74 registry labels.
- ESLint, TypeScript, all 186 tests in 31 suites, production build and diff whitespace check passed.
- Scope tests cover active roles, pending/revoked exclusion, all eight artist selections, the three-artist cap, date validation and local environment gating.
- Finance tests cover independent artists/currencies, exact minor units, actual settled cash and expected tax-inclusive amounts.
- Final copy and sample-seed guard changes were followed by translation, TypeScript and diff checks.

## Real local HTTP and database checks

A separately isolated disposable manager and four registered artist accounts exercised authenticated application routes. No real artist credentials were used.

- All eight selections (none, A, B, C, AB, AC, BC, ABC) return precisely the selected authorized artists and their records. Default is all authorized artists.
- Anonymous overview returns 401; an unauthorized artist returns 403; four artist selectors return 400. Responses are private and no-store.
- Revoking A immediately blocks its overview data; B and C remain accessible.
- Three artist accounts can read their own projects and event exports; another artist's project and calendar export return 404. Artist accounts cannot read the combined data of others.
- Editing a grant submission date updates one existing todo; database readback confirms one task at 2026-10-20 23:00 and the same project association as its grant application.

## Browser workflow checks

- An artist owner invites an existing verified manager. Pending membership exposes no business data. The manager accepts A alongside B/C; accepting D is refused at the three-artist limit. Declining D removes the invitation.
- The manager can toggle A/B/C while retaining the selected Messages view. Finance keeps artist and currency rows separate.
- The owner revokes A; the manager roster drops to B/C. The manager releases B through confirmation; only C remains. Other artist records are retained.
- Grant workflow: save an official opportunity, add October 19 submission time, edit to October 20, associate a signed execution project, open Calendar at that actual date, then use the calendar editor's link back to the same grant application.
- A fresh final browser check confirms the mouse-click Calendar link is no longer covered by the floating reminder toast on Grants. Calendar shows the submission at 23:00 on October 20. Header notifications remain available.
- Chinese and English interfaces were inspected. Responsive widths 320, 768, 1024 and 1440 were checked without horizontal overflow. Phone date inputs were stacked to avoid truncated numeric dates. Month selection remains compact; calendar chips retain artist names in the agenda on phones.
- A fresh final tab had no warning/error console entries. Earlier development-only hot reload messages were not treated as final-state errors.

## Persistent samples and cleanup

The local trial owner has three separate fictional Sample Artist workspaces with 36 October/November events, 18 message examples, 18 finance entries and one fictional grant planning todo. These are PostgreSQL records, not browser fixtures; sample owners have no authentication credentials. Re-running the sample seed passed exact row comparison for the original workspace and count comparison for all involved tables: no original business rows changed and no duplicates were added.

All five disposable QA accounts and their isolated workspaces were removed after browser sign-out. Their private credential fixture was deleted. The persistent Sample Artist workspaces and public grant opportunities were preserved. Browser viewport overrides were reset and temporary QA tabs closed.

## Remaining product boundaries

The manager dashboard is read-only and locally enabled. Real Pro billing entitlements, cross-artist editing, invitation email delivery and an iPhone client remain future work. Grant todos appear in Taloox Calendar; they are not yet exported to Google/Apple Calendar. No grant save or award status creates a contract, project or received payment automatically.
