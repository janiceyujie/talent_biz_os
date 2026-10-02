import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";

/** Optimistic check for the proxy: is a session cookie present? Not proof of a valid session. */
export function hasSessionCookie(request: NextRequest) {
  return getSessionCookie(request) !== null;
}
