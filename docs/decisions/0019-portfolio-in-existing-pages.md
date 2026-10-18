# Artist portfolio scope in existing pages

Status: local pilot, 2026-10-12. Supersedes the UI-only separation in decision 0018; retains artist ownership, manager invitation and authorization rules.

## Product flow

Managers use the existing Today, Calendar and Finance pages. A compact shared artist filter offers My workspace, All artists and individual artist checkboxes. Active manager memberships supply the roster; choosing a creative role alone does not grant access. Selection survives page navigation, refresh and browser Back. Explicit none remains none. The manager workspace is a management/overview entry in the Manage navigation group, with direct links to the existing pages. Its My workspace link explicitly returns to the user's personal editing context.

Calendar reuses the existing day/week time grid and month view rather than a second manager-only calendar. Each record names its artist. Finance reuses currency selection, date filters, actual cash metrics, charts, ledger and CSV export. CSV includes an artist column. Currency totals stay separate; no exchange-rate or AI call is made. Today shows selected artists' upcoming schedule, due to-dos and outstanding amounts by currency.

Changing the artist scope preserves calendar view/date/scroll and finance currency/date filters. Hide the previous scope's data during loading without unmounting the filters. Never show stale artist records as the new scope. Personal preview dates and browser fixtures do not become artist portfolio records.

## Data and authorization boundary

`PortfolioProvider` holds a display selection only. The authenticated `/api/manager/workspace` reads actual PostgreSQL records and validates every selected id against active manager/agency-admin memberships. Every collection query joins the same current active membership. The response is private/no-store. Pending and revoked memberships do not grant access. Recheck when returning focus to the tab. Frontend selection never substitutes for server authorization.

Page-local `AppDataScope` supplies read-only calendar, payment and project-summary collections to the three supported views. The shell, search, assistant, notifications, other pages and mutation actions retain their existing workspace context. Do not globally replace `getCurrentTalent` or aggregate unrelated AppData. The Info hint explains this boundary. Original workspace create/edit/settle/void/archive/delete/drag and external calendar export actions are absent from artist views. Calendar items open a viewing dialog. My workspace restores normal existing actions.

This keeps combined viewing separate from future per-artist editing. Before enabling edits, require explicit target artist id, server-side role/operation authorization and stale-form checks. The three-artist cap remains the existing local pilot limit; it is not a paid entitlement implementation or an unlimited roster.

## Size limits and future batches

The pilot bounds one snapshot to 1,000 events, 1,000 to-dos, 2,000 ledger records and 1,000 project summaries. Above any limit, return a limited result with no business collections; never calculate totals from truncated data. For production, separate paged calendars/ledgers from server aggregate queries.

Next batches should apply the same scope to Intake and Projects with explicit artist context on their existing paginated server APIs, then delegated mutations and assistant context. Do not imply those pages are already aggregated. Billing/seat lifecycle remains future work from decision 0018. No schema migration, production-data write, external integration change or push is part of this batch.
