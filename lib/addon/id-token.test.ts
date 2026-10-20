import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { test } from "node:test";
import { verifyIdToken } from "./id-token";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keys = [{ ...publicKey.export({ format: "jwk" }), kid: "k1" }];
const NOW = Date.parse("2026-10-20T10:00:00Z");
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

function sign(claims: object, header: object = { alg: "RS256", kid: "k1" }) {
  const body = `${b64(header)}.${b64(claims)}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(privateKey).toString("base64url")}`;
}
const good = { iss: "https://accounts.google.com", aud: "client-1", sub: "111", exp: NOW / 1000 + 300, iat: NOW / 1000 };

test("a token Google signed for us is accepted", () => {
  assert.equal(verifyIdToken(sign(good), { keys, audience: "client-1", now: NOW })?.sub, "111");
});

test("another audience, issuer, or an expired token is refused", () => {
  assert.equal(verifyIdToken(sign(good), { keys, audience: "client-2", now: NOW }), null);
  assert.equal(verifyIdToken(sign({ ...good, iss: "https://evil.example" }), { keys, audience: "client-1", now: NOW }), null);
  assert.equal(verifyIdToken(sign({ ...good, exp: NOW / 1000 - 120 }), { keys, audience: "client-1", now: NOW }), null);
});

test("a changed payload, an unknown key, or no signature is refused", () => {
  const [h, , s] = sign(good).split(".");
  assert.equal(verifyIdToken(`${h}.${b64({ ...good, sub: "222" })}.${s}`, { keys, audience: "client-1", now: NOW }), null);
  assert.equal(verifyIdToken(sign(good, { alg: "RS256", kid: "k2" }), { keys, audience: "client-1", now: NOW }), null);
  assert.equal(verifyIdToken(`${b64({ alg: "none" })}.${b64(good)}.`, { keys, audience: "client-1", now: NOW }), null);
});
