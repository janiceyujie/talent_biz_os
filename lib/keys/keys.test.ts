// Encryption at rest for mailbox tokens (decision 0016). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { decrypt, encrypt, newDataKey } from "./crypto";
import { envKeyProvider, KeyConfigError, KmsError, kmsKeyProvider } from "./provider";

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

describe("Cloud KMS", () => {
  const KEY = "projects/p/locations/asia-southeast1/keyRings/r/cryptoKeys/mail";
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const account = { client_email: "web@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), token_uri: "https://oauth.test/token" };
  const env = { KMS_KEY: KEY, GCP_KMS_CREDENTIALS: JSON.stringify(account), KMS_API_URL: "https://kms.test/v1" };

  /** A stand-in Cloud KMS: encrypt stores the plaintext under a new ciphertext; `canDecrypt` plays the credential's permission. */
  function fakeKms(o: { canDecrypt?: boolean } = {}) {
    const store = new Map<string, { plaintext: string; aad: string }>();
    const calls = { token: 0, encrypt: 0, decrypt: 0 };
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href === account.token_uri) {
        calls.token++;
        return json(200, { access_token: "kms-token", expires_in: 3600 });
      }
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer kms-token");
      const body = JSON.parse(String(init?.body));
      if (href === `https://kms.test/v1/${KEY}:encrypt`) {
        calls.encrypt++;
        const ciphertext = Buffer.from(`ct-${store.size}`).toString("base64");
        store.set(ciphertext, { plaintext: body.plaintext, aad: body.additionalAuthenticatedData });
        return json(200, { name: `${KEY}/cryptoKeyVersions/1`, ciphertext });
      }
      if (href === `https://kms.test/v1/${KEY}:decrypt`) {
        calls.decrypt++;
        if (o.canDecrypt === false) return json(403, { error: { code: 403 } });
        const hit = store.get(body.ciphertext);
        if (!hit || hit.aad !== body.additionalAuthenticatedData) return json(400, { error: { code: 400 } });
        return json(200, { plaintext: hit.plaintext });
      }
      return json(404, {});
    }) as typeof fetch;
    return { fetchImpl, calls };
  }

  test("wraps a data key through KMS and unwraps it again", async () => {
    const { fetchImpl } = fakeKms();
    const keys = kmsKeyProvider(env, fetchImpl);
    const dataKey = newDataKey();
    const wrapped = await keys.wrap(dataKey);
    assert.ok(!wrapped.includes(dataKey.toString("base64")));
    assert.equal(keys.keyId, `kms:${KEY}`);
    assert.deepEqual(await keys.unwrap(wrapped, keys.keyId), dataKey);
  });

  test("signs in once for many calls", async () => {
    const { fetchImpl, calls } = fakeKms();
    const keys = kmsKeyProvider(env, fetchImpl);
    await keys.wrap(newDataKey());
    await keys.wrap(newDataKey());
    assert.equal(calls.token, 1);
  });

  test("keeps an unwrapped key for a few minutes, and zeroing the caller's copy doesn't spoil it", async () => {
    const { fetchImpl, calls } = fakeKms();
    const keys = kmsKeyProvider(env, fetchImpl);
    const dataKey = newDataKey();
    const wrapped = await keys.wrap(dataKey);
    const first = await keys.unwrap(wrapped, keys.keyId);
    first.fill(0); // what open() does once it's done
    assert.deepEqual(await keys.unwrap(wrapped, keys.keyId), dataKey);
    assert.equal(calls.decrypt, 1);
  });

  test("a credential that may only encrypt can't unwrap: KMS refuses", async () => {
    const { fetchImpl } = fakeKms({ canDecrypt: false });
    const keys = kmsKeyProvider(env, fetchImpl);
    const wrapped = await keys.wrap(newDataKey());
    await assert.rejects(keys.unwrap(wrapped, keys.keyId), (e) => e instanceof KmsError && e.status === 403);
  });

  test("won't unwrap a key the local key or another KMS key wrapped", async () => {
    const keys = kmsKeyProvider(env, fakeKms().fetchImpl);
    await assert.rejects(keys.unwrap("x.y.z", "env:v1"), KeyConfigError);
    await assert.rejects(keys.unwrap("abc", "kms:projects/p/locations/l/keyRings/r/cryptoKeys/other"), KeyConfigError);
  });

  test("refuses a missing or malformed key name, or credentials it can't read, without echoing them", () => {
    assert.throws(() => kmsKeyProvider({ ...env, KMS_KEY: "" }), KeyConfigError);
    assert.throws(() => kmsKeyProvider({ ...env, KMS_KEY: "projects/p/keys/mail" }), KeyConfigError);
    assert.throws(() => kmsKeyProvider({ ...env, GCP_KMS_CREDENTIALS: "{not json" }), KeyConfigError);
    assert.throws(
      () => kmsKeyProvider({ ...env, GCP_KMS_CREDENTIALS: JSON.stringify({ client_email: "x" }) }),
      (e) => e instanceof KeyConfigError && !e.message.includes("BEGIN"),
    );
  });
});
