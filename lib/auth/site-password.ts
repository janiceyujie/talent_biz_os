import { createHash, timingSafeEqual } from "node:crypto";

// One shared password in front of the whole site, for staging (decision 0027).
// The browser asks for it once (HTTP Basic auth) and sends it with every request
// after, pages, API calls, and static files alike. Any user name is accepted.
// Unset, as in production and on a laptop, everything goes through.

/**
 * Paths a server calls, not a browser: it can't answer the password prompt.
 * Each reveals nothing or has its own check. A new route that Google or another
 * service calls goes here too, or it fails on staging only.
 */
const SERVER_PATHS = [
  /^\/api\/health$/, // deploy smoke check and Render's health check: only the commit
  /^\/api\/calendar\/feed\/[^/]+$/, // calendar apps subscribing; the token in the path is the check
];

export const PASSWORD_PROMPT = { "www-authenticate": 'Basic realm="Taloox staging", charset="UTF-8"' };

/** Whether a request may go on: no password set, a server path, or the right password. */
export function sitePasswordAllows(pathname: string, authorization: string | null, password: string | undefined) {
  if (!password) return true;
  if (SERVER_PATHS.some((path) => path.test(pathname))) return true;
  const [scheme, encoded] = (authorization ?? "").split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return false;
  const credentials = Buffer.from(encoded, "base64").toString("utf8");
  const colon = credentials.indexOf(":");
  return colon >= 0 && same(credentials.slice(colon + 1), password);
}

// Compared as hashes, so the time taken says nothing about the password, not even its length.
const sha256 = (s: string) => createHash("sha256").update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b));
