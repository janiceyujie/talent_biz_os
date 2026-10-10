import { decrypt, encrypt, newDataKey, type Sealed } from "./crypto";
import { keyProvider } from "./provider";

// Envelope encryption for one stored secret (decision 0016): a fresh data key
// per secret encrypts it; the master key wraps the data key.

export { KeyConfigError, keyProvider, type KeyProvider } from "./provider";

export type Envelope = Sealed & { wrappedKey: string; keyId: string };

/** Encrypt `secret` for storage, bound to `aad` (what row it belongs to). */
export async function seal(secret: string, aad: string): Promise<Envelope> {
  const keys = keyProvider();
  const dataKey = newDataKey();
  try {
    return { ...encrypt(dataKey, Buffer.from(secret), aad), wrappedKey: await keys.wrap(dataKey), keyId: keys.keyId };
  } finally {
    dataKey.fill(0);
  }
}

/** Decrypt a stored secret. The worker's job: the web service never calls this. */
export async function open(envelope: Envelope, aad: string): Promise<string> {
  const dataKey = await keyProvider().unwrap(envelope.wrappedKey, envelope.keyId);
  try {
    return decrypt(dataKey, envelope, aad).toString();
  } finally {
    dataKey.fill(0);
  }
}
