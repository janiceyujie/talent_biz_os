import "server-only";
import { googleKeys, verifyIdToken, type IdClaims } from "./id-token";

// Who's asking (docs/design/gmail-addon.md, Security): first that Google sent
// the request (the system token, for our endpoint, from the add-on's service
// account), then which Google account is in Gmail (the user token, for the
// add-on's OAuth client). Nothing else in a request identifies anyone.
//
// Tests can't drive Gmail. With no real configuration, outside production, and
// GMAIL_ADDON_TEST_STUB=1, unsigned tokens ("alg": "none") stand in, as
// GOOGLE_TEST_STUB does for sign-in (lib/auth/config.ts).

const clientId = process.env.GMAIL_ADDON_CLIENT_ID;
const serviceAccount = process.env.GMAIL_ADDON_SERVICE_ACCOUNT;
const configured = !!clientId && !!serviceAccount;
const stub = !configured && process.env.NODE_ENV !== "production" && process.env.GMAIL_ADDON_TEST_STUB === "1";

/** The URL Google calls, and the system token's audience. */
export const addonEndpoint = () => `${(process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "")}/api/addon/gmail`;
export const addonAvailable = () => configured || stub;

const unsigned = (token: string): IdClaims | null => {
  try {
    const [h, p] = token.split(".");
    if (JSON.parse(Buffer.from(h, "base64url").toString()).alg !== "none") return null;
    return JSON.parse(Buffer.from(p, "base64url").toString());
  } catch {
    return null;
  }
};

/** The Google account behind a request, or null when Google didn't send it. */
export async function identify(systemIdToken: string, userIdToken: string): Promise<{ sub: string; email: string } | null> {
  if (!systemIdToken || !userIdToken) return null;
  let system: IdClaims | null, user: IdClaims | null;
  if (stub) {
    system = unsigned(systemIdToken);
    user = unsigned(userIdToken);
  } else if (configured) {
    const keys = await googleKeys();
    system = verifyIdToken(systemIdToken, { keys, audience: addonEndpoint() });
    user = verifyIdToken(userIdToken, { keys, audience: clientId! });
    if (system && (system.email !== serviceAccount || system.email_verified !== true)) system = null;
  } else return null;
  if (!system || !user?.sub || !user.email) return null;
  return { sub: user.sub, email: user.email.toLowerCase() };
}
