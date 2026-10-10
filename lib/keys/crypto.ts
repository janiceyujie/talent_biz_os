import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for secrets at rest (decision 0016). `aad` binds a ciphertext to
// the row it belongs to, so it can't be copied onto another row and decrypt.

export type Sealed = { ciphertext: string; nonce: string; tag: string }; // base64

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;

export const newDataKey = () => randomBytes(KEY_BYTES);

export function encrypt(key: Buffer, plaintext: Buffer, aad: string): Sealed {
  if (key.length !== KEY_BYTES) throw new Error("encryption key must be 32 bytes");
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

/** Throws if the key, the aad, or any byte of the sealed value is wrong. */
export function decrypt(key: Buffer, sealed: Sealed, aad: string): Buffer {
  if (key.length !== KEY_BYTES) throw new Error("encryption key must be 32 bytes");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.nonce, "base64"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]);
}
