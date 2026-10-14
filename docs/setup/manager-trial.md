# Local manager trial

The local Manager workspace is available at `/manager`; artist owners invite managers from Settings → Manager access (`/manager/access`). Register and verify both accounts first. No invitation email is sent by this pilot. Invitation recipients find pending invitations on Manager workspace. Accepting the fourth active represented artist is refused.

Enable only in ignored local `.env.local` with development app settings, a loopback database and `MANAGER_LOCAL_ENABLED=1`. Defaults in `.env.example` are off. Invitations use existing membership records. Manager capabilities additionally require the generated `0029_integrated_local_features.sql` migration; consult decision 0023 before applying it to a database with the earlier local feature chain.

For the existing local trial owner, `npm run db:seed-manager` inserts three Sample Artist workspaces with October/November events, message examples and independent finance records. It also includes a fictional grant submission to-do in Sample Artist A. The seeder does not create usable artist-owner login accounts, send invitations, invoke AI, or change the original workspace's business records. It refuses to overwrite an existing non-sample manager roster. Re-running inserts missing sample ids only; it preserves changed records and revoked memberships. Expand Manage connections on `/manager` to release a sample's access and free a slot.

Use a separately isolated fixture account for actual invite/accept/revoke tests, not the sample owners. Do not treat sample memberships as real consent or real customer relationships. The supplied sample notes and names identify fictional records.

This is a read-only combined dashboard. Actual Pro subscription billing, cross-artist editing, automatic invitation mail, iPhone application delivery and external calendar export of grant to-dos are not enabled. Production changes require the review described in decision 0018.

Managers can now select artists directly on the existing Today, Calendar and Finance pages. Selection persists across those pages. These portfolio views reuse the existing calendar and finance components as read-only views; My workspace retains normal editing. See decision 0019 for the boundaries and the next batches.

Decision 0020 now gates manager mode on a server-owned active manager entitlement, in addition to the local flag and artist membership. Run the new additive migrations before enabling the local pilot. The sample seeder assigns the trial owner a local_trial three-seat capability without creating a paid subscription. Basic/ordinary Pro do not get manager mode. Eligible users open the header scope selector and enable Manager mode; Projects now supports the same artist scope.

## Invitation and access lifecycle verification (2026-10-13)

The invite recipient must have a verified account and an active manager capability before the owner sends the invitation. The owner sees Awaiting acceptance, Active, or Access revoked. Revoked records remain visible; Invite again fills the email and requires a new invitation and acceptance. No email is sent by this local workflow.

Read-only artist pages share a lightweight access boundary. A visible page rechecks access every 30 seconds and on tab focus/visibility return, with a 10-second timeout. Hidden tabs do not poll. Failed or denied checks remove protected content and offer Retry; Retry refreshes the roster so the user can continue with remaining authorized artists. Server readers independently authorize every request and recheck membership after collecting data. This is bounded polling, not real-time push; previously exported data cannot be recalled. No AI request is made.

Regular editing uses only owner-held workspaces, never a fallback manager membership. Ownerless accounts receive onboarding rather than artist editing access. Connection controls remain outside the read-only data boundary so a manager can release a connection when over the seat limit. Notification toasts are suppressed on manager pages; notifications remain available in the header.
