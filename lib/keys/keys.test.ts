// Encryption at rest for mailbox tokens (decision 0016). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decrypt, encrypt, newDataKey } from "./crypto";
import { envKeyProvider, KeyConfigError } from "./provider";

const MASTER = Buffer.alloc(32, 7).toString("base64");
const dev = { APP_ENV: "development", MAIL_KEY_DEV: MASTER };

describe("AES-256-GCM", () => {
  const key = newDataKey();

  test("a sealed secret opens with the same key and row binding", () => {
    const sealed = encrypt(key, Buffer.from("1//refresh-token"), "mail_connection:t1:s1");
    assert.equal(decrypt(key, sealed, "mail_connection:t1:s1").toString(), "1//refresh-token");
    assert.notEqual(sealed.ciphertext, Buffer.from("1//refresh-token").toString("base64"));
  });

  test("copied onto another row, it doesn't open", () => {
    const sealed = encrypt(key, Buffer.from("1//refresh-token"), "mail_connection:t1:s1");
    assert.throws(() => decrypt(key, sealed, "mail_connection:t2:s1"));
  });

  test("a changed byte or the wrong key is refused, not decrypted to garbage", () => {
    const sealed = encrypt(key, Buffer.from("1//refresh-token"), "row");
    const flipped = Buffer.from(sealed.ciphertext, "base64");
    flipped[0] ^= 1;
    assert.throws(() => decrypt(key, { ...sealed, ciphertext: flipped.toString("base64") }, "row"));
    assert.throws(() => decrypt(newDataKey(), sealed, "row"));
  });

  test("two seals of the same secret differ (a fresh nonce each time)", () => {
    assert.notEqual(encrypt(key, Buffer.from("x"), "row").nonce, encrypt(key, Buffer.from("x"), "row").nonce);
  });
});

describe("the local master key", () => {
  test("wraps and unwraps a data key", async () => {
    const keys = envKeyProvider(dev);
    const dataKey = newDataKey();
    const wrapped = await keys.wrap(dataKey);
    assert.ok(!wrapped.includes(dataKey.toString("base64")));
    assert.deepEqual(await keys.unwrap(wrapped, keys.keyId), dataKey);
  });

  test("refuses to run outside development", () => {
    assert.throws(() => envKeyProvider({ ...dev, APP_ENV: "production" }), KeyConfigError);
    assert.throws(() => envKeyProvider({ ...dev, APP_ENV: "testing" }), KeyConfigError);
    assert.throws(() => envKeyProvider({ MAIL_KEY_DEV: MASTER, NODE_ENV: "production" }), KeyConfigError);
  });

  test("refuses a missing or short key", () => {
    assert.throws(() => envKeyProvider({ APP_ENV: "development" }), KeyConfigError);
    assert.throws(() => envKeyProvider({ APP_ENV: "development", MAIL_KEY_DEV: "c2hvcnQ=" }), KeyConfigError);
  });

  test("won't unwrap a key another master key wrapped", async () => {
    const keys = envKeyProvider(dev);
    const wrapped = await keys.wrap(newDataKey());
    await assert.rejects(keys.unwrap(wrapped, "kms:projects/x/keys/y/1"), KeyConfigError);
  });
});
