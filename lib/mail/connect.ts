import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailConnection } from "@/lib/db/schema";
import { KeyConfigError, keyProvider, seal } from "@/lib/keys";
import type { HistoryMode } from "./history";
import { authorizationUrl, exchangeCode, idTokenClaims, newState, oauthClient, OAuthError, pkce, revokeToken } from "./oauth";
import { openState, sealState, STATE_TTL_SECONDS } from "./oauth-state";
import { grantsGmail } from "./scope";
import { toColumns, tokenAad } from "./token";

// Connecting a mailbox (decision 0013, 0016), called by the thin routes in
// app/api/mail. The web service holds Google's tokens only while saving: it
// encrypts the refresh token, stores it, and drops both.

/** Where Google sends the person back; must be listed on the OAuth client. */
export const redirectUri = () => `${(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/mail/callback`;
const stateSecret = () => process.env.BETTER_AUTH_SECRET ?? "";

/** What the settings row says after the round trip: a key under gmail.result. */
export type ConnectResult =
  | "connected"
  | "notConfigured"
  | "expired"
  | "cancelled"
  | "notGranted"
  | "noOffline"
  | "otherAccount"
  | "disconnecting"
  | "googleError";

/** Whether this environment can connect a mailbox: an OAuth client and a usable master key. */
export function mailConfigured() {
  if (!oauthClient() || !stateSecret()) return false;
  try {
    keyProvider();
    return true;
  } catch (e) {
    if (e instanceof KeyConfigError) return false;
    throw e;
  }
}

/** Google's consent URL and the cookie that remembers this attempt. */
export function startConnect(o: { personId: string; talentId: string; historyMode: HistoryMode }): { url: string; cookie: string } | { error: ConnectResult } {
  const client = oauthClient();
  if (!client || !mailConfigured()) return { error: "notConfigured" };
  const { verifier, challenge } = pkce();
  const state = newState();
  const cookie = sealState({ ...o, state, verifier, expiresAt: Date.now() + STATE_TTL_SECONDS * 1000 }, stateSecret());
  return { url: authorizationUrl({ clientId: client.id, redirectUri: redirectUri(), state, challenge }), cookie };
}

/** Back from Google: check it's the same attempt and person, trade the code, store the encrypted refresh token. */
export async function finishConnect(o: {
  cookie: string | undefined;
  params: URLSearchParams;
  personId: string;
  talentId: string;
}): Promise<ConnectResult> {
  const client = oauthClient();
  if (!client || !mailConfigured()) return "notConfigured";
  const remembered = openState(o.cookie, stateSecret());
  if (!remembered || remembered.state !== o.params.get("state") || remembered.personId !== o.personId || remembered.talentId !== o.talentId)
    return "expired";
  if (o.params.get("error")) return "cancelled"; // e.g. access_denied: the person said no
  const code = o.params.get("code");
  if (!code) return "expired";

  let tokens;
  try {
    tokens = await exchangeCode({ clientId: client.id, clientSecret: client.secret, code, verifier: remembered.verifier, redirectUri: redirectUri() });
  } catch (e) {
    if (e instanceof OAuthError) {
      console.error("mail connect: code exchange failed", e.status, e.code);
      return e.code === "invalid_grant" ? "expired" : "googleError";
    }
    throw e;
  }
  // Anything we won't keep is withdrawn at Google straight away.
  const giveBack = () => revokeToken(tokens.refresh_token ?? tokens.access_token).catch(() => undefined);

  if (!grantsGmail(tokens.scope)) return giveBack().then(() => "notGranted");
  if (!tokens.refresh_token) return giveBack().then(() => "noOffline");
  const account = idTokenClaims(tokens.id_token);
  if (!account) return giveBack().then(() => "googleError");

  const [existing] = await db
    .select({ id: mailConnection.id, accountSubject: mailConnection.accountSubject, status: mailConnection.status })
    .from(mailConnection)
    .where(and(eq(mailConnection.talentId, o.talentId), eq(mailConnection.provider, "gmail")));
  if (existing?.status === "disconnecting") return giveBack().then(() => "disconnecting");
  // One mailbox per talent for now (decision 0013); the same account again is a reconnect.
  if (existing && existing.accountSubject !== account.subject) return giveBack().then(() => "otherAccount");

  const token = toColumns(await seal(tokens.refresh_token, tokenAad(o.talentId, account.subject)));
  await db
    .insert(mailConnection)
    .values({
      talentId: o.talentId,
      connectedBy: o.personId,
      accountEmail: account.email,
      accountSubject: account.subject,
      scopes: tokens.scope ?? "",
      historyMode: remembered.historyMode,
      ...token,
    })
    .onConflictDoUpdate({
      target: [mailConnection.talentId, mailConnection.provider, mailConnection.accountSubject],
      // A reconnect keeps the history choice and the sync cursor.
      set: { ...token, connectedBy: o.personId, accountEmail: account.email, scopes: tokens.scope ?? "", status: "connected", failure: null },
    });
  return "connected";
}
