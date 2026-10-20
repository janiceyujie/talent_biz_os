// Google-signed ID tokens on a Gmail add-on request (docs/design/gmail-addon.md,
// Security): the system token proves Google sent it, the user token says which
// Google account is in Gmail. Checked with Google's published keys and Node's
// crypto, no library. Pure but for fetching the keys.
import { createPublicKey, createVerify, type JsonWebKey } from "node:crypto";

export type IdClaims = { iss: string; aud: string; sub: string; exp: number; iat?: number; email?: string; email_verified?: boolean };
type Jwk = JsonWebKey & { kid?: string };

const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const SKEW_S = 60; // clocks drift; Google's own libraries allow about this

const part = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

/** The token's claims when Google signed it for `audience` and it hasn't expired; null otherwise. */
export function verifyIdToken(token: string, { keys, audience, now = Date.now() }: { keys: Jwk[]; audience: string; now?: number }): IdClaims | null {
  const pieces = token.split(".");
  if (pieces.length !== 3) return null;
  let header: { alg?: string; kid?: string }, claims: IdClaims;
  try {
    header = part(pieces[0]);
    claims = part(pieces[1]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256") return null;
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const ok = createVerify("RSA-SHA256")
    .update(`${pieces[0]}.${pieces[1]}`)
    .verify(createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(pieces[2], "base64url"));
  if (!ok) return null;
  const s = now / 1000;
  if (!ISSUERS.includes(claims.iss) || claims.aud !== audience || typeof claims.sub !== "string") return null;
  if (typeof claims.exp !== "number" || claims.exp + SKEW_S < s || (claims.iat ?? 0) - SKEW_S > s) return null;
  return claims;
}

const CERTS = "https://www.googleapis.com/oauth2/v3/certs";
let cached: { keys: Jwk[]; until: number } | null = null;

/** Google's current signing keys, kept as long as Google's Cache-Control allows. */
export async function googleKeys(): Promise<Jwk[]> {
  if (cached && cached.until > Date.now()) return cached.keys;
  const res = await fetch(CERTS, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Google certs ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  cached = { keys, until: Date.now() + maxAge * 1000 };
  return keys;
}
