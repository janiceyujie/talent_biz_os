# October 18 meeting follow-up: first local implementation batch

## Scope and persistence

- Implemented the small product changes assigned to Timothy in the meeting; this is not completion of the entire meeting roadmap.
- Preserved existing uncommitted Invoice, reminder and Taiwan issuer-setup work. No commit, push, remote database changes, real email, or paid model calls.
- No schema migration or new dependency. Optional occupation is stored in the existing person/workspace-scoped PostgreSQL preference table as `profile.role` version 1. Null means skipped/declined; explicit Other remains distinct.
- New workspaces use a neutral vertical. Profile edits do not change existing account types, workspace verticals, manager plans, memberships, or template classifications. Existing accounts use their prior role as a display fallback until a profile is saved.

## Completed

- [x] Replace the two-screen occupation/character setup with a compact form; occupation is optional and can be skipped.
- [x] Move profile editing into the existing app shell as a narrow dialog. Preserve safe return pages and query filters; cancel/close does not save.
- [x] Collapse optional character appearance. Remove outdated copy about manager access being unavailable and avoid asking a manager to name someone else's workspace.
- [x] Separate research occupation from manager entitlement and artist authorization.
- [x] Use reviewed general encouragement without an AI request; scope the daily greeting to the person/workspace rather than occupation.
- [x] Change the opt-in local grant worker schedule to daily at 00:00 UTC. Manual refresh, source locking and the 15-minute throttle remain. This run did not start the full mail/grant worker or wait for a daily trigger.

## Verification

- Full unit suite: 388 passed.
- Existing payment receipt acceptance script: 198 local checks passed, including partial receipts, withholding, combined shortfall, corrections, reversals, multiple installments/costs, reminders and closure gating.
- Existing fake Gmail invoice acceptance script: 160 checks passed. Valid PDF; stored PDF matches the draft attachment. Five simulated draft creations, zero send calls, zero update/delete calls. Disposable fixtures cleaned by the script.
- ESLint, TypeScript, matching locale keys (3,537), registry label checks and production build passed. Final build used `.next-test` to avoid disturbing the development server.
- Daily grant cron expression parsed successfully. Actual scheduled source fetch and source coverage completeness were not tested.
- Browser with disposable local account: first setup with Manager selected then Skip persisted null; later Manager saved as profile only; cancelled Musician edit preserved Manager; account type remained individual, vertical other, and no manager entitlement appeared.
- Verified settings return, close/cancel, general companion text and English labels. Mobile widths 390 and 320 px checked; at 320 px the dialog content width and scroll width were both 280 px. Character controls remained reachable. Screenshots saved under sibling `Talent Deal OS/meeting-review/2026-10-18/development-2026-10-20/`.
- Test identity was signed out and removed along with its own empty workspace. Real user records were not edited.
- A batch write was initially rejected by automatic review. Before applying the approved alternative, original files were backed up to `/tmp/taloox-meeting-original`, each file hash was checked, and a context-checked patch was applied. Existing locale values outside the scoped profile/companion/grant changes were verified unchanged.

## Remaining meeting work (not shipped by this batch)

- [ ] Per-line currencies and project reporting conversion: requires a jointly reviewed financial model, exchange-rate provenance/date and reconciliation rules. Existing same-currency protection remains in place.
- [ ] Grant eligibility questions and explainable matching, with a view-all fallback and official-source coverage audit. Coordinate the larger backend work with Janice.
- [ ] Near-term opportunity discovery (competitions, exhibitions, performance calls), organizer submission/review and follow-up integration. User explicitly places this in the current/near-term phase, not only the distant community vision. No automatic application or guaranteed revenue claims.
- [ ] Janice's live Gmail classification/provider/queue validation, branch integration, production secrets/deployment and permissions audit. Mock draft tests do not prove Google OAuth approval or live account delivery.
- [ ] Mobile web notifications and installation behavior; native iOS remains separate.
- [ ] Research/merchant authorization for official Taiwan e-invoices and authoritative local US tax coverage; do not equate a PDF template with official issuance.
