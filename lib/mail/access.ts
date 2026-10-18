import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailConnection } from "@/lib/db/schema";
import { open } from "@/lib/keys";
import { oauthClient, OAuthError, refreshAccessToken } from "./oauth";
import { fromColumns, tokenAad } from "./token";

// Access tokens for a connected mailbox (decision 0016). Worker only: it's the
// one process that can decrypt a refresh token. Access tokens live in this
// process's memory for their hour and are never written anywhere.

type Connection = typeof mailConnection.$inferSelect;

/** Google no longer accepts the refresh token (access removed, consent expired): only reconnecting helps. */
export class MailAccessLost extends Error {}

const cache = new Map<string, { token: string; expiresAt: number; grant: string }>();
const MARGIN_MS = 60_000; // refresh a minute early

export async function accessToken(c: Connection): Promise<string> {
  const hit = cache.get(c.id);
  if (hit && hit.grant === c.refreshTokenNonce && hit.expiresAt - MARGIN_MS > Date.now()) return hit.token;
  const client = oauthClient();
  if (!client) throw new Error("mail: Google OAuth client not configured");
  try {
    const refreshToken = await open(fromColumns(c), tokenAad(c.talentId, c.accountSubject));
    const res = await refreshAccessToken({
      clientId: client.id,
      clientSecret: client.secret,
      refreshToken,
    });
    cache.set(c.id, {
      token: res.access_token,
      grant: c.refreshTokenNonce,
      expiresAt: Date.now() + res.expires_in * 1000,
    });
    return res.access_token;
  } catch (e) {
    if (e instanceof OAuthError && e.code === "invalid_grant") {
      cache.delete(c.id);
      throw new MailAccessLost();
    }
    throw e;
  }
}

/** Forget a token Gmail turned down, so the next call refreshes it. */
export const dropAccessToken = (connectionId: string) => cache.delete(connectionId);

/** Retrying stops; Settings asks the artist to reconnect. */
export async function markReconnectNeeded(connectionId: string) {
  dropAccessToken(connectionId);
  await db
    .update(mailConnection)
    .set({ status: "reconnect_needed", failure: "invalid_grant" })
    .where(and(eq(mailConnection.id, connectionId), ne(mailConnection.status, "disconnecting")));
}
