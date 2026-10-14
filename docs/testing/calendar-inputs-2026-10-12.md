# Calendar date and time input review

Local review on 2026-10-12, branch `user/timothy0324/local-integration`.

## Scope

Replaced calendar date/time controls with a compact month picker and scrollable time menu. Date and time fields also accept direct numeric input. The same controls cover calendar navigation, quick editing, and full event editing, including travel and accommodation dates. Existing database fields and time-zone semantics are retained; no dependencies or migrations were added.

## Verified behavior

- Date input accepts `20261015`, `2026/10/15`, and full-width numeric text. Impossible dates such as `20260229` are rejected.
- Time input accepts `930`, `0947`, `1530`, `9:30`, and explicit AM/PM. Arbitrary minutes are preserved; impossible times such as `2360` are rejected.
- Blur and Enter normalize valid input. Invalid required input prevents saving rather than silently saving the previous value.
- Date-grid keyboard navigation and time-menu selection work. Escape dismisses the picker without dismissing the event editor.
- The time menu opens at the selected time and keyboard focus follows that option.
- Pickers remain within the viewport at 320, 768, 1024, and 1440 nominal widths. Temporary viewport overrides were reset.
- Chinese and English labels, month/day names, and picker controls were checked in the browser.
- A disposable local workspace created an event through the UI using numeric input, then updated it through quick editing. PostgreSQL read-back confirmed 2026-10-15, 15:30–16:30, Asia/Taipei. The fixture account was signed out and its workspace/account removed after verification. Real workspace records were not changed.

## Automated validation

- 169 tests passed across 31 suites, including date/time parsing, invalid input, leap dates, and month navigation.
- TypeScript, ESLint, production build, and `git diff --check` passed.
- Catalog parity passed: 2,081 translation keys and 74 registry labels.

Changes remain local and uncommitted. No GitHub push or merge was performed.
