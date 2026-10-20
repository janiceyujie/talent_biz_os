// Whether a chosen calendar's window is read again (docs/design/calendar-two-way.md).
// Pure; lib/calendar/google/import.ts does the calls.

/** The window (a month back to six months ahead) moves on a day at a time, so it's read at least this often. */
export const WINDOW_READ_EVERY_MS = 24 * 60 * 60 * 1000;

/** Whether a chosen calendar's window is read again: it changed, it was never read, or a day has passed. */
export function needsWindowRead({ changed, lastImportedAt, now = Date.now() }: { changed: boolean; lastImportedAt: Date | null; now?: number }) {
  return changed || !lastImportedAt || now - lastImportedAt.getTime() >= WINDOW_READ_EVERY_MS;
}
