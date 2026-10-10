import type { Envelope } from "@/lib/keys";

// How a mailbox's refresh token is bound to its row (decision 0016): the
// ciphertext only decrypts as this talent's token for this Google account.
export const tokenAad = (talentId: string, accountSubject: string) => `mail_connection:${talentId}:${accountSubject}`;

type Stored = {
  refreshTokenCiphertext: string;
  refreshTokenNonce: string;
  refreshTokenTag: string;
  dataKeyWrapped: string;
  keyId: string;
};

export const toColumns = (e: Envelope): Stored => ({
  refreshTokenCiphertext: e.ciphertext,
  refreshTokenNonce: e.nonce,
  refreshTokenTag: e.tag,
  dataKeyWrapped: e.wrappedKey,
  keyId: e.keyId,
});

export const fromColumns = (row: Stored): Envelope => ({
  ciphertext: row.refreshTokenCiphertext,
  nonce: row.refreshTokenNonce,
  tag: row.refreshTokenTag,
  wrappedKey: row.dataKeyWrapped,
  keyId: row.keyId,
});
