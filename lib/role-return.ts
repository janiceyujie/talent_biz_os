// Where Change role's close button goes back to: the page it was opened from, passed as ?returnTo=.

/** Pages a close button must never lead back to: signing in and out, the first-run setup, this page, and the API. */
const NOT_BACK_TO = /^\/(?:role|onboarding|sign-in|sign-up|forgot-password|reset-password|api)(?:[/?#]|$)/;

/**
 * `returnTo` as a path on this site, or the home page. Anything else (another site, `//host`, a
 * backslash trick, an auth page) is the home page, so the link can't send anyone elsewhere.
 */
export function roleReturnHref(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\s]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://taloox.invalid");
    if (url.origin !== "https://taloox.invalid" || NOT_BACK_TO.test(url.pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
