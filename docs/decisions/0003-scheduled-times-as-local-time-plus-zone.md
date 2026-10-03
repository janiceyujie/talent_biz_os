# 0003 — Scheduled times are stored as local time plus zone, not UTC

**Status:** Accepted (recorded 2026-10-03; decided with the calendar and travel work)

## Context

The common advice is "store timestamps in UTC, convert on display." That's right for moments that already happened. For things scheduled in the future it loses information: an artist playing Tokyo means "21:00 in Tokyo", not an instant. Travel crosses zones (depart Taipei, arrive Tokyo). Deadlines often have a date but no time. Payment dates are business days, not moments.

## Decision

Three kinds of time, stored three ways:

1. **Moments that happened** — `created_at`, `updated_at`, `archived_at`, `voided_at`, `completed_at`, `read_at`, `snoozed_until`, session expiry — are `timestamptz` instants.
2. **Scheduled things** — calendar events, travel and stays, to-do deadlines — store the local date, an optional local time (none = all day), and the IANA zone it was entered in (`start_date`, `start_time`, `time_zone`; `end_*` for arrival and check-out in its own zone). This is iCalendar's model (`DTSTART;TZID=…`), and how Google Calendar stores events.
3. **Business days** — payment recorded / due / settled — are plain `date`s in the talent's zone. "Today" is the date in the talent's zone.

The instant is derived when it's needed — urgency, "arrival after departure", `.ics` output — by `lib/domain/dates.ts`. A wall time that daylight saving makes nonexistent or ambiguous is refused for travel rather than guessed; `.ics` output uses the conventional resolution. Zones are stored by canonical IANA name and chosen with a picker that only accepts real zones. Display shows each item in its own zone, plus the viewer's time when the zones differ.

## Alternatives considered

- **UTC only.** Loses which zone the person meant (needed to show "21:00 · Asia/Tokyo"), breaks if a country changes its DST rules before the event (the stored instant is then an hour off from what was agreed), and has no honest value for date-only items.
- **UTC plus the zone.** Keeps the zone, but the stored instant goes stale on rule changes, and two columns can disagree. The local time is the fact; the instant is derived.
- **Fixed offsets (`+09:00`).** Don't follow DST; wrong half the year in many places.

## Consequences

- Sorting and comparing scheduled items across zones needs the derived instant, not the stored columns; anything new that compares times should use `exactInstant` / `wallTimeToUtc`.
- The calendar grid places items by their own local date; there's no single merged timeline across zones (each item can show the viewer's time).
- "Today" follows the talent's zone, not the viewer's. A per-person zone for a manager abroad is Later.
