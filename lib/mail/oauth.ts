import { createHash, randomBytes } from "node:crypto";
import { MAIL_SCOPES } from "./scope";

// Google OAuth for the mailbox connection (decision 0016): authorization code
// with PKCE, plain fetch. GOOGLE_OAUTH_AUTH_URL, GOOGLE_OAUTH_TOKEN_URL, and
// GOOGLE_OAUTH_REVOKE_URL point it at a fake Google in tests.

const authBase = () => process.env.GOOGLE_OAUTH_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const tokenUrl = () => process.env.GOOGLE_OAUTH_TOKEN_URL || "https://oauth2.googleapis.com/token";
const revokeUrl = () => process.env.GOOGLE_OAUTH_REVOKE_URL || "https://oauth2.googleapis.com/revoke";

/** The OAuth client sign-in uses (one client, one consent screen); null when Google isn't set up. */
export function oauthClient(env: Record<string, string | undefined> = process.env) {
  return env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET } : null;
}

const base64url = (bytes: Buffer) => bytes.toString("base64url");

/** A PKCE pair: the verifier stays with us, the challenge goes to Google. */
export function pkce() {
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: challengeFor(verifier) };
}
export const challengeFor = (verifier: string) => base64url(createHash("sha256").update(verifier).digest());

export const newState = () => base64url(randomBytes(24));

/** Google's consent screen. `prompt=consent` with offline access, so Google returns a refresh token every time. */
export function authorizationUrl(o: { clientId: string; redirectUri: string; state: string; challenge: string }) {
  const q = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: MAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "select_account consent",
    include_granted_scopes: "false", // only this flow's scopes, not sign-in's or Calendar's
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: "S256",
  });
  return `${authBase()}?${q}`;
}

export class OAuthError extends Error {
  constructor(
    readonly status: number, // HTTP status, 0 = no response
    readonly code: string, // Google's error code, e.g. invalid_grant
  ) {
    super(`Google OAuth ${status} ${code}`); // never the response body: it can hold tokens
  }
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string };

async function tokenCall(body: Record<string, string>): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new OAuthError(0, "network");
  }
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string };
  if (!res.ok || !json.access_token) throw new OAuthError(res.status, json.error ?? "unexpected");
  return json as TokenResponse;
}

/** Trade the one-time code (with our client secret and the PKCE verifier) for tokens. */
export const exchangeCode = (o: { clientId: string; clientSecret: string; code: string; verifier: string; redirectUri: string }) =>
  tokenCall({
    grant_type: "authorization_code",
    client_id: o.clientId,
    client_secret: o.clientSecret,
    code: o.code,
    code_verifier: o.verifier,
    redirect_uri: o.redirectUri,
  });

/** A fresh access token (about an hour) from the stored refresh token. The worker's job. */
export const refreshAccessToken = (o: { clientId: string; clientSecret: string; refreshToken: string }) =>
  tokenCall({ grant_type: "refresh_token", client_id: o.clientId, client_secret: o.clientSecret, refresh_token: o.refreshToken });

/**
 * Withdraw our access at Google. Resolves when Google revoked it or says the
 * token is already invalid (400); throws on no answer or a server error, so the
 * caller can try again.
 */
export async function revokeToken(token: string) {
  let res: Response;
  try {
    res = await fetch(revokeUrl(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new OAuthError(0, "network");
  }
  if (!res.ok && res.status !== 400) throw new OAuthError(res.status, "revoke_failed");
}

/**
 * Whose account this is, from the ID token. It came straight from Google's token
 * endpoint over TLS, so its signature needn't be checked (OpenID Connect Core 3.1.3.7).
 */
export function idTokenClaims(idToken: string | undefined): { subject: string; email: string } | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: unknown; email?: unknown };
    return typeof claims.sub === "string" && typeof claims.email === "string" ? { subject: claims.sub, email: claims.email } : null;
  } catch {
    return null;
  }
}
