import { appEnv } from "@/lib/app-env";
import { readServiceAccount, tokenSource } from "@/lib/google/service-account";
import { decrypt, encrypt } from "./crypto";

// Where the master key lives (decision 0016). Data keys are wrapped and
// unwrapped by it; its material never reaches the database. The web service
// only wraps; the worker only unwraps (with Cloud KMS, the credentials enforce
// it). Deployed, Cloud KMS; on a laptop, a local key in .env.

export interface KeyProvider {
  /** Which master key wrapped a data key, stored beside it. */
  readonly keyId: string;
  wrap(dataKey: Buffer): Promise<string>;
  unwrap(wrapped: string, keyId: string): Promise<Buffer>;
}

export class KeyConfigError extends Error {}

const ENV_KEY_ID = "env:v1";

/** The local master key from MAIL_KEY_DEV (32 bytes, base64). Development only. */
export function envKeyProvider(env: Record<string, string | undefined> = process.env): KeyProvider {
  if (appEnv(env) !== "development") throw new KeyConfigError("MAIL_KEY_DEV is for development only; set up Cloud KMS");
  const master = Buffer.from(env.MAIL_KEY_DEV ?? "", "base64");
  if (master.length !== 32) throw new KeyConfigError("MAIL_KEY_DEV must be 32 bytes, base64 (openssl rand -base64 32)");
  const aad = `data-key:${ENV_KEY_ID}`;
  return {
    keyId: ENV_KEY_ID,
    async wrap(dataKey) {
      const s = encrypt(master, dataKey, aad);
      return [s.nonce, s.tag, s.ciphertext].join(".");
    },
    async unwrap(wrapped, keyId) {
      if (keyId !== ENV_KEY_ID) throw new KeyConfigError(`data key was wrapped by ${keyId}, not ${ENV_KEY_ID}`);
      const [nonce, tag, ciphertext] = wrapped.split(".");
      return decrypt(master, { nonce, tag, ciphertext }, aad);
    },
  };
}

// Cloud KMS (docs/setup/render.md, "Cloud KMS"):
//
//   KMS_KEY              projects/<project>/locations/asia-southeast1/keyRings/<ring>/cryptoKeys/<key>
//   GCP_KMS_CREDENTIALS  a service account's JSON key, or a path to it: on the web service one that
//                        may only encrypt with the key, on the worker one that may only decrypt
//   KMS_API_URL          points it at a fake Cloud KMS in tests
//
// The key's version travels inside KMS's ciphertext, so a data key wrapped before
// a rotation still unwraps; keyId names the key. Disabling the key in KMS stops
// every mailbox at once (decision 0016, "Kill switch").

const KMS_KEY_NAME = /^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/;
/** An unwrapped data key stays in the worker's memory this long, so every sync doesn't call KMS. */
const UNWRAP_CACHE_MS = 5 * 60_000;

/** A Cloud KMS call that failed. 403 is the credential lacking the permission: the web service asked to decrypt, say. */
export class KmsError extends Error {
  constructor(readonly status: number) {
    super(`Cloud KMS ${status}`);
  }
}

export function kmsKeyProvider(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): KeyProvider {
  const key = env.KMS_KEY ?? "";
  if (!KMS_KEY_NAME.test(key)) throw new KeyConfigError("KMS_KEY must name a Cloud KMS key: projects/…/locations/…/keyRings/…/cryptoKeys/…");
  let account: ReturnType<typeof readServiceAccount>;
  try {
    account = readServiceAccount("GCP_KMS_CREDENTIALS", env);
  } catch (e) {
    throw new KeyConfigError((e as Error).message);
  }
  const api = (env.KMS_API_URL || "https://cloudkms.googleapis.com/v1").replace(/\/$/, "");
  const auth = tokenSource({ account: () => account, scope: "https://www.googleapis.com/auth/cloudkms", fail: (s) => new KmsError(s), fetch: fetchImpl });
  const keyId = `kms:${key}`;
  // Binds a wrapped data key to this use, as the local key's aad does.
  const aad = Buffer.from(`data-key:${keyId}`).toString("base64");
  const unwrapped = new Map<string, { dataKey: Buffer; until: number }>();

  async function call<T>(method: "encrypt" | "decrypt", body: object): Promise<T> {
    const res = await fetchImpl(`${api}/${key}:${method}`, {
      method: "POST",
      headers: { authorization: `Bearer ${await auth.token()}`, "content-type": "application/json" },
      body: JSON.stringify({ ...body, additionalAuthenticatedData: aad }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401) auth.reset(); // the next call signs in again
    if (!res.ok) throw new KmsError(res.status);
    return (await res.json()) as T;
  }

  return {
    keyId,
    async wrap(dataKey) {
      return (await call<{ ciphertext: string }>("encrypt", { plaintext: dataKey.toString("base64") })).ciphertext;
    },
    async unwrap(wrapped, wrappedBy) {
      if (wrappedBy !== keyId) throw new KeyConfigError(`data key was wrapped by ${wrappedBy}, not ${keyId}`);
      const now = Date.now();
      for (const [k, v] of unwrapped) if (v.until <= now) unwrapped.delete(k);
      const hit = unwrapped.get(wrapped);
      // A copy: callers zero the key they're given once they're done with it.
      if (hit) return Buffer.from(hit.dataKey);
      const dataKey = Buffer.from((await call<{ plaintext: string }>("decrypt", { ciphertext: wrapped })).plaintext, "base64");
      unwrapped.set(wrapped, { dataKey, until: now + UNWRAP_CACHE_MS });
      return Buffer.from(dataKey);
    },
  };
}

// One provider per process, so its access token and unwrapped keys are reused.
let kms: { key: string; provider: KeyProvider } | null = null;

/** The key provider for this environment: Cloud KMS when KMS_KEY is set, otherwise the local key. */
export function keyProvider(): KeyProvider {
  const key = process.env.KMS_KEY;
  if (!key) return envKeyProvider();
  if (kms?.key !== key) kms = { key, provider: kmsKeyProvider() };
  return kms.provider;
}
