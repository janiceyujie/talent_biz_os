import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

// Signing in to Google as a service account, for the APIs our services call with
// their own credentials rather than a person's (Pub/Sub, Cloud KMS): a signed
// request, exchanged for an hour's access token. Plain fetch, no SDK (decision 0014).

export type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

/** A service account's JSON key, from a setting that holds the JSON or a path to it. Errors never carry the key's text. */
export function readServiceAccount(setting: string, env: Record<string, string | undefined> = process.env): ServiceAccount {
  const raw = env[setting] ?? "";
  let sa: Partial<ServiceAccount>;
  try {
    sa = JSON.parse(raw.trim().startsWith("{") ? raw : readFileSync(raw, "utf8"));
  } catch (e) {
    // The file error's code (ENOENT) or the parse error's name; never the key's text.
    throw new Error(`${setting} can't be read as a service account's JSON key (${(e as NodeJS.ErrnoException)?.code ?? (e as Error)?.name})`);
  }
  if (!sa.client_email || !sa.private_key) throw new Error(`${setting} isn't a service account's key: no client_email or private_key`);
  return sa as ServiceAccount;
}

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

/**
 * Access tokens for one service account and scope, cached for their hour.
 * `fail` turns Google's refusal into the caller's own error; `reset` drops the
 * cached token after a 401, so the next call signs in again.
 */
export function tokenSource(o: { account: () => ServiceAccount; scope: string; fail: (status: number) => Error; fetch?: typeof fetch }) {
  let cached: { token: string; until: number } | null = null;
  return {
    async token() {
      if (cached && cached.until > Date.now()) return cached.token;
      const sa = o.account();
      const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
        JSON.stringify({ iss: sa.client_email, scope: o.scope, aud: tokenUri, iat: now, exp: now + 3600 }),
      )}`;
      const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
      const res = await (o.fetch ?? fetch)(tokenUri, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw o.fail(res.status);
      const json = (await res.json()) as { access_token: string; expires_in: number };
      cached = { token: json.access_token, until: Date.now() + (json.expires_in - 60) * 1000 };
      return json.access_token;
    },
    reset() {
      cached = null;
    },
  };
}
