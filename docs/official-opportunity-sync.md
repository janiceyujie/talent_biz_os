# Official opportunity synchronization (local, 2026-10-20)

## Scope and storage

The existing `grants.refresh` task and authenticated `refreshGrants` action now synchronize grants and official competition/exhibition calls. The discipline extension adds migration `0039_opportunity_disciplines`; no paid service, AI inference, Gmail access, or outbound messages are involved. Public catalog records remain shared in PostgreSQL; private applications/tasks remain account-scoped and unchanged.

| Source | Discovery entry point | Coverage |
| --- | --- | --- |
| StreetVoice | https://streetvoice.com/opportunities/ | Latest three listing pages; detail submission-calendar dates, Taiwan evidence required. Overseas/ambiguous geography is omitted. |
| Chung Yuan Cultural Park | https://cycc.org.tw/zh-hant/events | Up to two listing pages; application calls only, including named URL aliases. Ordinary audience events and selection results are excluded. |
| King Car Cultural & Art Center | https://www.kingcarart.org.tw/en/projects/award | Official current/archive open-call index; matching application, exhibition and residency titles. The public English route avoids the site's language redirect. |

These sources discover new URLs on each run; they do not merely refresh a fixed curated list. Existing unexpired/undated calls from these sources are also re-read when they leave the bounded index. At most 80 details per source, two concurrent detail requests, a 90-second source budget and a 2 MB per-response limit. This is not an exhaustive historical archive or a guarantee that all Taiwan opportunities are indexed.

Other reviewed sources, including social posts and announcements requiring manual interpretation, remain manual. Their check dates are not advanced by these adapters. Facebook/Instagram authentication or crawler restrictions are not bypassed.

## Schedule and manual refresh

- Shared daily cron: `0 0 * * *` (00:00 UTC / 08:00 Asia/Taipei).
- `GRANT_REFRESH_OPTIONS` supplies three attempts and a 24-hour backfill window using Graphile Worker's existing cron support.
- The local grant-only worker and regular worker use the same policy. Only the grant-only worker was restarted here; Gmail/AI workers were not started.
- The existing Update announcements button runs the same synchronization immediately. Per-source PostgreSQL advisory locks coalesce overlapping requests; successful scheduled work has the existing 15-minute cooldown. Failed sources are eligible for queue retries.
- The local computer, database and worker must be running to perform a crawl. Backfill covers the most recent missed daily run when a previously registered worker restarts; it does not run while the machine is off. Production scheduling/deployment remains a separate task.

## Identity, dates and failures

- Stable source IDs come from official opportunity IDs or named slugs, not the title or a changing date.
- A matching reviewed record is adopted **in place** using its canonical official URL, retaining its UUID, application/task references and human-reviewed eligibility evidence. Eligibility review dates are not automatically certified by a successful fetch.
- The reviewed-import script skips already adopted official identities, preventing later seed/import runs from reintroducing duplicate manual rows.
- Only explicit application periods and source-specific open-call/submission fields become deadlines. Conflicting, invalid and unsupported dates remain unconfirmed. Intraday deadlines remain subject to the existing date-only storage limitation and official rules.
- Any fetch/parse failure rolls back that source's snapshot. Previous records and success timestamps remain intact; source failure is recorded outside the transaction. Other sources proceed independently.
- A missing entry is not deleted or assumed withdrawn. Its own check timestamp eventually makes it unconfirmed under the existing freshness policy.
- Unchanged content does not advance `changedAt`. Grants.gov applicant-category ordering is normalized to avoid false content-update notifications.

## Local verification

- 36 grant-related tests pass, including new discovery on a subsequent run, duplicate index links, URL identity/allowlist, explicit versus event dates, malformed/ambiguous dates, overseas exclusion, detail failure, empty ordinary-event lists, and supported daily/backfill configuration.
- TypeScript no-emit, targeted ESLint and bilingual catalog checks pass.
- Live synchronization succeeded for all five automatic sources (the three above plus MOC and Grants.gov).
- The three new adapters stored 21 opportunities: 19 new rows and 2 in-place adoptions. Total local catalog: 69 rows. Closed calls stay in history and are excluded by the default active filter.
- Simulated network failures for all three new sources preserved every cached field and timestamp. Recovery succeeded; repeated synchronization preserved IDs/counts and unchanged-content timestamps.
- Before/after checks preserved all 50 original opportunity UUIDs, all human-reviewed eligibility records, and hashes of 5 application records, 8 task records and the watch table.
- Browser Update announcements succeeded; source success timestamps and 18 active Taiwan competition/exhibition results were visible. No external application was submitted.

No GitHub push or merge was performed.


## Award and discipline extension (2026-10-20)

- New automatic sources: BAMID Golden Melody JSON (newest two application announcements, excluding winners/judges), Golden Horse annual rules (short and feature film periods separately), Kaohsiung Film Festival rules (short and XR separately), and Taiwan Fashion Design Award annual rules. They use the existing daily/manual task, source locks and rollback/cache behavior.
- Golden Melody uses the explicit application section of the linked MOC page and accepts UTF-8 BOM JSON. News publication dates, review periods and ceremony dates are not deadlines. Golden Horse, KFF and TFDA records are keyed by year/track; a new year never replaces an older tracked entry.
- Taipei Film Festival was initially a reviewed snapshot; it is now automatic through the extension below. GIMA remains covered by the existing StreetVoice adapter. Closed editions require the All statuses or Past deadline filter.
- PostgreSQL stores a validated text array of disciplines, with a GIN index. Filtering and totals run before LIMIT 20; the filter is included in the cursor identity. Multiple disciplines per opportunity are supported. Tags do not determine eligibility.
- Reviewed tags take precedence. Conservative title matching supplies tags for otherwise unclassified source rows. Unknown titles remain visible under All disciplines and Not yet classified; broad general grants are not guessed to fit every profession. This is discoverability tagging, not a complete official taxonomy.
- Apply the generated additive migration before serving the changed app/worker. On a normal migration lineage use the project migrator; the local merged development database was identity-checked and only this new migration was applied and journaled, avoiding replay of divergent historical migrations.
- After migrating, run `scripts/import-reviewed-opportunities.mts` and `scripts/backfill-opportunity-disciplines.mts` with the React server condition. Both guard loopback development databases. Existing opportunity UUIDs, applications, tasks and watches are retained.
- Local verification includes 42 grant tests, live source parsing, 20+5 SQL pagination with multi-tag records, changed-filter cursor rejection, exact counts, original UUID/eligibility/tracking retention, and responsive browser filtering. The latest local catalogue contains 79 opportunities; this is a bounded catalogue, not a complete list of every award.


## Taipei Film Festival and additional official calls (2026-10-20)

Three additional adapters share the existing daily/manual synchronization, for 12 automatic sources total. No new migration, dependency, credentials or paid service is needed for this extension.

| Source | Live discovery | Coverage and safeguards |
| --- | --- | --- |
| Taipei Film Festival | https://www.taipeiff.taipei/tw/news?c=38 and the news page's public `/api/articles/news` read-only POST queries | Retrieve the page's public query token on every run; search submission/registration/extension notices. Up to three 30-item pages per query and 30 details; latest two publication years plus known active calls. Awards, international new talent and marketing calls are separate year/track IDs even when announced in one article. Workshops, results, tickets and festival dates are excluded. |
| Shin Kong Mitsukoshi Cultural Foundation | https://culture.skm.com.tw/ | Discover the photography competition, analog photography call and photography sponsorship programme. Resolve the official rules link under the same event UUID. Edition comes from the listing heading, not the date above it. Rules' submission labels take priority over generic homepage dates. Up to 20 listed calls. |
| Kaohsiung Award | https://awardkmfa.org.tw/announcements | Discover numbered official announcement pages and recheck known active calls. Normalize Unicode mathematical digits and HTML entities; use explicit submission periods. Up to 20 details. |

Each adapter is bounded by a 60–90 second source budget, existing 10-second per-request timeout and 2 MB response cap. No arbitrary-host redirects are followed. A changed official structure fails visibly and preserves the previous cache. Conflicting deadline announcements remain unconfirmed rather than choosing an unsupported date. No applicant eligibility is inferred merely from fetching an announcement.

The six previously reviewed Taipei/SKM/Kaohsiung rows are adopted using verified official host **and year/track ID**, preserving UUIDs and human eligibility. URL-only adoption would merge the three Taipei tracks incorrectly, so it is not used. Subsequent reviewed-catalogue imports skip adopted identities. New editions receive new IDs; old applications remain attached to their original editions.

SKM currently refreshes calls listed on its live homepage; if a call disappears, its row is retained and eventually becomes stale/unconfirmed. Kaohsiung discovery covers the current announcement index, not a promised full historical archive. Broader TFAM/NTSO and other municipal sources still require dedicated adapters and date-rule validation; social posts remain supporting research, not an unrestricted automatic feed.

Validation: 51 grant tests, TypeScript, targeted ESLint and all 3,656 bilingual message keys passed. Live synchronization succeeded for all 12 sources. The catalogue grew from 79 to 83 records (six adopted, four newly discovered), preserving all 79 original IDs, eligibility evidence and hashes of applications/tasks/watches. Re-importing the reviewed catalogue did not recreate the six adopted rows. The local-only grant worker is required for daily execution; production deployment remains separate.

Network-failure injection for all three new adapters preserved every cached row field and previous successful check time. Browser-triggered manual refresh then recovered all 12 sources, displayed their latest successful times, and retained film-discipline filtering. The grant-only worker was restarted with the new adapters; no Gmail/AI worker was started. No GitHub push or merge was performed.
