# Manager lifecycle verification

Date: 2026-10-13. Local-only on `user/timothy0324/local-integration`.

## Scope

Invite, accept, revoke, re-invite, selected-artist continuity, read-only affordances, and already-open screen revocation. No Gmail, paid AI, subscription checkout, production migration, push, or merge.

## Verified

- 206 existing automated tests pass; both catalogs match with 2,284 keys. Targeted ESLint and isolated production build pass.
- 34 isolated API checks cover all eight A/B/C combinations, pending invitations, anonymous requests, cross-artist requests, disabled manager entitlement, mismatched artist/project ids, and an ownerless manager. Ordinary project API returns 404 without an owned workspace rather than selecting a delegated artist.
- Artist A sends an invitation from Manager access. The owner sees Awaiting acceptance. The manager accepts it; A appears in the roster. Accepting a fourth artist is refused by the three-seat local entitlement.
- A/C selection carries from the manager shortcut to Today, Calendar and Projects. Calendar has no add-event control in the portfolio view. Projects show only A/C and read-only details.
- With A's project details still open, a separate fixture update revokes A. The access recheck removes the protected subtree and shows an access-change message. Retry refreshes the roster; A stays absent and C remains usable in Projects and Finance.
- The owner revokes active access using the confirmation dialog. The revoked record remains visible with Invite again. Re-inviting returns it to Awaiting acceptance; API reads remain denied until acceptance. An ordinary artist without a manager entitlement receives the explicit ineligible-recipient message.
- A 390px invitation screen has no horizontal overflow. Only isolated fixture identities are used; credentials are never included in this record. Temporary test accounts are removed after sign-out, preserving original records and persistent sample artists.

## Limits

Frontend revocation is detected on focus/visibility return or the next 30-second visible-page check, followed by network time. A failed check times out in 10 seconds and hides protected content. Backend access is checked per request. Previously delivered or exported copies cannot be recalled. Real invitation mail, paid plan provisioning, production rollout and delegated editing remain separate work.
