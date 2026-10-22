// How much of a Gmail response is read. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FETCH_LIMITS } from "../attachments";
import { MAX_ATTACHMENT, MAX_RESPONSE, readCapped } from "./limits";

/** A response streamed in chunks, without a length up front, as Gmail's chunked replies are. */
const streamed = (bytes: number, chunk = 64 * 1024) => {
  let left = bytes;
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (left <= 0) return c.close();
      const n = Math.min(chunk, left);
      left -= n;
      pulled += n;
      c.enqueue(new Uint8Array(n).fill(97));
    },
  });
  return { res: new Response(body), pulled: () => pulled };
};

describe("readCapped", () => {
  test("a response within the cap is read whole", async () => {
    assert.equal(await readCapped(new Response('{"id":"a"}'), MAX_RESPONSE), '{"id":"a"}');
  });
  test("past the cap it stops reading, without taking the rest", async () => {
    const { res, pulled } = streamed(MAX_RESPONSE * 3);
    assert.equal(await readCapped(res, MAX_RESPONSE), null);
    assert.ok(pulled() < MAX_RESPONSE + 2 * 64 * 1024, `read ${pulled()} bytes`);
  });
  test("a declared length past the cap is refused before reading", async () => {
    const res = new Response("x", { headers: { "content-length": String(MAX_RESPONSE + 1) } });
    assert.equal(await readCapped(res, MAX_RESPONSE), null);
  });
  test("the largest attachment we fetch, as base64 in its JSON, fits the attachment cap but not the general one", async () => {
    const base64 = Math.ceil((FETCH_LIMITS.fileBytes * 4) / 3) + 100;
    assert.notEqual(await readCapped(streamed(base64).res, MAX_ATTACHMENT), null);
    assert.equal(await readCapped(streamed(base64).res, MAX_RESPONSE), null);
  });
});
