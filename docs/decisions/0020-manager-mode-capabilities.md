# Compact manager mode and project scope

Status: local implementation, 2026-10-12. Refines decisions 0018 and 0019. No deployment or commercial pricing decision.

## User experience

Projects belongs in the shared artist scope alongside Today, Calendar and Finance. Managers need to compare each artist's negotiations, signed work and collections in the same workflow. Keep the original phase tabs, type/search/sort filters, keyset pagination and list/detail layout.

Remove the always-visible artist filter row. Eligible accounts get one compact header scope button, showing My workspace when off or the selected artists when on. Opening it reveals Manager mode, All artists and individual artist checkboxes. Turning mode off returns to the personal workspace; turning it on remembers the last selection. Escape, outside click and a labeled close button dismiss the native popover. On phones the trigger becomes an icon with a complete accessible name. Explanations stay behind Info hints.

Basic and ordinary Pro have no manager-mode control or manager navigation. Selecting a manager creative/account role does not grant this capability. The manager plan's name/pricing is provisional; paid checkout is not implemented. My workspace remains usable independently of the manager capability.

## Server eligibility and consent

`manager_entitlement` is a server-owned PostgreSQL record, not a user preference. It stores plan, active state, artist limit, source and optional expiration. Only an active unexpired manager plan enables the capability. A source of local_trial identifies fictional local testing; it is not a subscription receipt. No client API or user preference action can assign or change this record. RLS is enabled without public policies, so anonymous/authenticated Supabase roles cannot grant themselves capabilities.

The header switch controls display only. Business reads also require active manager/agency-admin membership for every selected artist. Every manager API checks plan eligibility and artist authorization. Query-level access checks protect against membership/plan changes. The three-artist sample trial remains three seats; the capability supports a separately configured four-seat plan. Invitation acceptance locks the recipient and plan record and enforces that configured limit.

After a downgrade below the active roster size, combined reads fail closed even for a smaller selected subset. The UI explains the limit and offers Manage connections, rather than silently substituting artists or leaving a dead switch. Subscription expiry disables manager reads without deleting artist-owned records or erasing consent/history. Billing webhooks, integration lifecycle and production rollout still need their separate implementation/review.

## Projects

`/api/manager/projects` reuses the original server list reader with an authenticated artist scope and private/no-store responses. Counts and page rows share the same filters and authorization. Cursor pagination does not aggregate an entire roster in browser memory. Row labels include the artist; quote amounts use their actual currency.

The individual manager project endpoint validates both artist and project, loads the authorized project details, related calendar/payments/contracts and timeline, and rechecks access before returning. Next-task and primary-company subqueries match the project's talent id as well as project id. Read-only detail tabs do not expose editing, stage changes, archive, signing or owner-context download links. Scoped list responses never keep another selected roster's stale rows after scope changes or denied requests.

Only the four supported pages use artist scope in this batch. Search, assistant, Intake and other pages retain My workspace. Delegate editing remains future work. Existing migrations were preserved; 0028 adds the capability table and 0029 enables its RLS. Both were applied only to the loopback local database.

## References and design inference

- Slack workspace switching: https://slack.com/help/articles/1500002200741-Switch-between-workspaces
- Asana portfolio views and plan availability: https://help.asana.com/s/article/portfolio-views?language=en_US

The compact switcher and plan-gated portfolio are adaptations to this product. Neither source specifies Taloox's pricing, artist-seat policy or permissions.
