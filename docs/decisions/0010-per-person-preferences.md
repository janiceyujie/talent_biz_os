# 0010 — Per-person settings in a key–value table

**Status:** Accepted (2026-10-06)

## Context

今日總覽 became widgets that a person can show, hide, and reorder (the first of several layout-style settings to come: a calendar's default view, how long before a deal counts as quiet). Such settings should follow the person across devices, may differ per workspace (a manager arranging each talent's overview differently), and must survive the app changing — widgets added, renamed, or removed after someone saved a layout.

## Decision

- **A `preference` table: one row per person, workspace (talent), and key, with the value as JSON.** The first key is `overview.layout`. A new setting is a new key, not a migration.
- **Allowed keys and their value shapes live in code** (`lib/preferences.ts`), each with two schemas:
  - **read** — forgiving: a value that doesn't fit, an unknown key, or a missing row reads as "not set", so the defaults apply and a page never breaks on an old save;
  - **save** — strict: only known keys, and for the layout only widget ids that exist.
- **Store the difference from the defaults, not the whole layout.** Defaults per role live in code (`lib/overview/widgets.ts`); a save holds an order and what's hidden, with a `version`. A widget added later still shows for everyone, unless they hid it.
- **Only the person themselves, in the workspace they're in, reads or writes their rows** (server actions with `requireTalent`). The last save wins; nothing is merged across devices.
- **恢復預設 deletes the row** rather than saving the defaults, so later changes to the defaults reach that person too.
- **Per-device conveniences stay in the browser** (the collapsed sidebar, remembered tabs): they're about the screen, not the person.

## Alternatives considered

- **A JSON column on `person` or `membership`.** One place, no new table, but every setting shares one blob (harder to validate, reset, or drop one), and per-workspace settings would need `membership` anyway.
- **A column per setting.** Typed, but a migration for every new setting and a wide table of mostly defaults.
- **Browser storage.** No database change, but the layout wouldn't follow the person to another device, and clearing site data loses it.

## Consequences

- The database doesn't check a value's shape; the code does, on every read and save. A key removed from `lib/preferences.ts` leaves rows that are simply ignored (and can be cleaned up in the change that removes it).
- Deleting a person or a workspace deletes their settings (foreign keys cascade).
- Layout settings are now product data: when a widget id is renamed, keep reading the old one or accept that saved layouts fall back to their defaults for it.
