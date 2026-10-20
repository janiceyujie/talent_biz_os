# Opportunity exploration local validation — 2026-10-20

Scope: existing local development database `taloox_merged_20261019` on `127.0.0.1:54322`. No remote migration, GitHub push, real mail, paid service, external application submission or AI request.

## Delivered flow

1. Open Opportunities in the existing app shell.
2. Choose Grants or Competitions & showcases, then filter/search the database-backed catalogue.
3. Set the actual applicant profile for this person/workspace. Unknown values are allowed.
4. Inspect preliminary eligibility, the specific reason, source and review date.
5. Follow the opportunity and optionally set a submission date/time/time zone.
6. The same todo appears in the application, Today and Calendar. Edit or complete it in place. Repeated saves do not duplicate it.
7. Track progress independently; connect a signed project only when execution work is confirmed. Following or selection never invents revenue.

## Verification

- New local migration applied: two additive columns, one index, one kind constraint. Existing records default to grant; no destructive change.
- Unit coverage: eligibility states, missing profiles, expired/future evidence, unknown/Other official categories, additional qualifying prose, exact-ID validation, no title-keyword or source-country inference, detail fetch limits/failure preservation, semantic hashing, daily schedule and manual/concurrent refresh policy.
- `scripts/check-opportunities.mts`: 74 acceptance assertions passed with two disposable identities. Covers SQL filtering before pagination (28 fixtures, 20 + 8 pages), cursor/filter binding, profile isolation, unauthorized requests, category separation, save/schedule idempotency, ownership checks, date/time-zone edits, completion/reopening, duplicate task requests, Calendar rendering and no automatic project creation.
- Browser: saved profile reloads; official NEA criteria can be matched independently of its expired deadline; ISC date `2026/10/27` and compact time `1530` normalize and save as `2026-10-27 15:30`; submission summary and linked todo appear immediately.
- Responsive review: 320 × 568 applicant dialog; 390 × 844 expanded eligibility/details; desktop 1440 × 1000. No document horizontal overflow at 320/390.
- Real manual refresh: immediate Updating state and successful MOC / Grants.gov timestamp updates. The button becomes usable again. Curated catalogue review dates are not reset by this action.
- Local grant-only worker starts with only `grants.refresh` registered, daily at 00:00 UTC. Schedule configuration/startup checked; a future overnight execution has not yet been observed.

- Final checks: 396 unit tests passed; the 25 grant-focused tests passed again after the final adapter refinement. ESLint, i18n checks (3,580 matching keys and 75 registry labels), production build and `git diff --check` passed.
- Disposable browser/acceptance identities and fixtures were removed; the local development server and grant-only worker remain running.
- Final database readback: 22 Grants.gov listings (18 include official eligibility evidence, including ambiguous excerpts), 7 MOC listings, and 4 reviewed entries. Evidence presence does not mean automatically confirmed eligibility.

## Coverage and remaining boundaries

- Current automatic discovery is MOC latest news and Grants.gov arts listings, not all national or local opportunities.
- Eligibility facts are incomplete by design. MOC requires official-rule review; ambiguous Grants.gov rules retain their official excerpts and stay unconfirmed. An initial match is not proof of full eligibility.
- Three non-grant catalogue entries are curated official references, not a comprehensive crawler. Creative Expo is a next-call monitoring reference, not a confirmed open cycle.
- Official sources reviewed: https://sxsw.com/music-festival/ ; https://songwritingcompetition.com/rules ; https://creativexpo.tw/zh-TW ; https://www.arts.gov/grants/grants-for-arts-projects ; https://www.grants.gov/api/common/fetchopportunity .
- Worker scheduling remains local and depends on the process, database, network and awake Mac. Deployment monitoring/recovery is separate.
- Build retains the pre-existing dynamic filesystem tracing warning at `lib/ai/model.ts` concerning AI recordings. This batch does not alter that subsystem.
