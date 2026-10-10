import { hkdfSync } from "node:crypto";
import { decrypt, encrypt } from "@/lib/keys/crypto";
import type { HistoryMode } from "./history";

// What the connect step remembers until Google sends the person back: the
// state, the PKCE verifier, and who started it. Kept in a short-lived,
// encrypted, httpOnly cookie, so nothing is stored for flows never finished.

export const STATE_COOKIE = "mail_oauth";
export const STATE_TTL_SECONDS = 10 * 60;

export type ConnectState = { state: string; verifier: string; personId: string; talentId: string; historyMode: HistoryMode; expiresAt: number };

const AAD = "mail-oauth-state";
const keyFrom = (secret: string) => Buffer.from(hkdfSync("sha256", secret, "", AAD, 32));

export function sealState(s: ConnectState, secret: string): string {
  const sealed = encrypt(keyFrom(secret), Buffer.from(JSON.stringify(s)), AAD);
  return [sealed.nonce, sealed.tag, sealed.ciphertext].map((p) => Buffer.from(p, "base64").toString("base64url")).join(".");
}

/** The remembered flow, or null if the cookie is missing, altered, or expired. */
export function openState(cookie: string | undefined, secret: string, now = Date.now()): ConnectState | null {
  const parts = cookie?.split(".");
  if (parts?.length !== 3) return null;
  const [nonce, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64url").toString("base64"));
  try {
    const s = JSON.parse(decrypt(keyFrom(secret), { nonce, tag, ciphertext }, AAD).toString()) as ConnectState;
    return s.expiresAt > now ? s : null;
  } catch {
    return null;
  }
}
