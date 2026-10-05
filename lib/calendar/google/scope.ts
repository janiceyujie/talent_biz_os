// The Google permission phase 1 asks for (decision 0009): calendars this app creates, nothing else.
// Shared by the server sync and the settings card that requests it.
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

/** Phase 2: list the person's calendars and read events on the ones they choose. Asked when they turn it on. */
export const IMPORT_SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];

/** Whether a stored scope list (comma- or space-separated) includes every one of `wanted`. */
export const hasScopes = (stored: string | null | undefined, wanted: string[]) => {
  const have = new Set((stored ?? "").split(/[ ,]/));
  return wanted.every((s) => have.has(s));
};
