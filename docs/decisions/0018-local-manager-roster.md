# Local manager roster and artist-owned access

Status: local pilot, 2026-10-12. User chose artist registration first, followed by an invitation to the manager. No deployment, push, new dependency or schema migration.

## Ownership and roles

Keep existing `person`, `talent` and `membership`. Each artist owns one independent talent workspace; a manager has a separate authenticated person and an active manager membership for each represented artist. Creative-role preferences are not permissions. No global manager identity can read all talent records.

An owner invites an existing verified account from Settings → Manager access. Store a manager membership as invited; the recipient accepts or declines it in Manager workspace. Pending or revoked membership never grants access. Acceptance locks the recipient's person row and rejects a fourth active managed artist in this three-artist pilot. The owner can revoke access, and a manager can release their own access. Both invalidate the workspace's membership calendar-feed token and remove that person's calendar connection for this workspace. Already downloaded/exported data is not recalled. Audit invitation, acceptance, decline, revocation and leaving.

`getCurrentTalent` selects only the person's active owner-held workspace, ordered by creation order and id. A delegated manager or agency-admin membership never becomes the ordinary editing context; accounts without an owner workspace complete onboarding. Accepting a manager invitation does not randomly move existing editing screens to another artist. The combined dashboard is a read-only page inside the shared app layout. Its artist-scoped collections do not replace the shell workspace or inject merged AppData into individual editing, search, assistant or notification contexts. Manager pages always display persisted records, outside browser sample mode. As with other app pages, accounts complete workspace onboarding before entering; the local manager feature gate and server authorization still apply. Explicit artist context and stale-form protection must be designed before adding cross-artist mutations.

## Reads and filtering

The server derives the person id from the session. `/api/manager/overview` accepts artist ids as selectors only. Validate them against active manager/agency-admin memberships before reading, and join that same active membership in every underlying query. Limit selection to three; selecting none returns no business data. Never silently substitute all artists after an empty or unauthorized selection. Keep responses private and no-store. The dashboard supports A, B, C, AB, AC, BC and ABC, plus no selection. Filter changes preserve the active Calendar/Messages/Finance view.

Shared work events and open to-dos appear in one combined calendar, with artist labels. Cross-day events remain visible across their date span. Personal Google calendar imports are excluded. Calendar dates keep their recorded zone; the agenda sorts scheduled instants. Selected dates outside the requested interval are disabled rather than described as empty. Date windows allow at most 93 inclusive days.

Messages use UTC date boundaries and are bounded to 150 recent records. Calendar summaries are bounded to 300 records; when a limit is reached, prompt the user to narrow the range rather than claim a complete listing. Financial totals retain each artist and currency separately. Actual received/paid amounts use settled cash, while receivables/payables use expected tax-inclusive amounts. Cancelled/voided entries are excluded. No exchange-rate or AI call is needed.

## Local boundary and Pro rollout

`MANAGER_LOCAL_ENABLED=1` additionally requires a non-production development app and a loopback database. Default is off; production routes/API cannot be enabled by changing this flag alone. The three-artist constant is a local product pilot, not a verified paid subscription entitlement. Before production, introduce server-side subscription entitlements and seat lifecycle rules, verify downgrade/over-limit behavior, review permission granularity, invitation email/registration, audit retention and revocation of integration access. Do not claim billing or cross-artist editing is live.

The local sample seeder uses the owner of `LOCAL_TRIAL_WORKSPACE_ID`. It creates three explicitly fictional, independently owned artist workspaces with no owner login credentials and simulated manager access for that owner. No existing workspace records, actual artist relationships, Gmail connection or cloud data are overwritten. Deterministic ids make repeated seeding insert-only; revoked sample access is not restored. Samples may be released through Manage connections to free pilot slots.

## Grant workflow

A saved opportunity is an independent application, not a signed deal. Add planning to-dos directly; they appear in Taloox Calendar and Today using the same stored todo. Grant date edits update that todo, not a copy. Save feedback provides a date-specific Calendar action. Calendar editing links back to the authenticated application's detail. Project association belongs to the application; changing it reconciles its existing tasks. Calendar cannot independently change a linked grant task's project or type.

Link to a signed execution project when one actually exists. Saving an opportunity and marking Awarded never creates a signed contract, project or finance receipt automatically. Current grant to-dos are not exported to Google/Apple Calendar. During grant planning, hide the floating reminder toast so it cannot cover action links; notifications remain accessible from the header. Clear previous save toasts when opening another deadline form.

## References

- Existing person/talent architecture and decisions 0004, 0009 and 0017.
- OWASP tenant isolation: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
- OWASP per-request server authorization: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

## Follow-up

Decision 0019 integrates read-only portfolio scope into the existing Today, Calendar and Finance pages. The separate manager dashboard remains a management/overview entry; users no longer need to visit it for those combined views. Server authorization and artist ownership above remain unchanged.
