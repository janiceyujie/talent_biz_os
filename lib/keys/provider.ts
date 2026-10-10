import { appEnv } from "@/lib/app-env";
import { decrypt, encrypt } from "./crypto";

// Where the master key lives (decision 0016). Data keys are wrapped and
// unwrapped by it; its material never reaches the database. The web service
// only wraps; the worker only unwraps (with Cloud KMS, the credentials enforce
// it). Cloud KMS comes with deploy-render; until then, a local key in .env.

export interface KeyProvider {
  /** Which master key (and version) wrapped a data key, stored beside it. */
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

/** The key provider for this environment. */
export const keyProvider = (): KeyProvider => envKeyProvider();
