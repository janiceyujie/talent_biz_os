// Reading a full Gmail message from its MIME parts. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { readMessage, type GmailPart } from "./parts";

const b64 = (text: string | Buffer) => Buffer.from(text).toString("base64url");
const part = (o: Omit<Partial<GmailPart>, "headers"> & { headers?: Record<string, string> }): GmailPart => ({
  ...o,
  headers: Object.entries(o.headers ?? {}).map(([name, value]) => ({ name, value })),
});

test("the plain text, the headers for threading, and real attachments only", () => {
  const m = readMessage({
    id: "m1",
    threadId: "t1",
    internalDate: "1760000000000",
    payload: part({
      mimeType: "multipart/mixed",
      headers: { From: "Lin <Lin@Venue.example>", Subject: "Contract", "Message-ID": "<a@venue>", "In-Reply-To": "<b@me>", References: "<c@x> <b@me>" },
      parts: [
        part({
          mimeType: "multipart/alternative",
          parts: [
            part({ partId: "0.0", mimeType: "text/plain", headers: { "Content-Type": "text/plain; charset=UTF-8" }, body: { data: b64("Attached is v2.") } }),
            part({ partId: "0.1", mimeType: "text/html", body: { data: b64("<p>Attached is v2.</p>") } }),
          ],
        }),
        part({ partId: "1", mimeType: "image/png", filename: "logo.png", headers: { "Content-ID": "<logo>", "Content-Disposition": "inline" }, body: { attachmentId: "x", size: 900 } }),
        part({ partId: "2", mimeType: "application/pdf", filename: "contract-v2.pdf", headers: { "Content-Disposition": "attachment" }, body: { attachmentId: "att2", size: 52000 } }),
        part({ partId: "3", mimeType: "text/calendar", filename: "invite.ics", body: { data: b64("BEGIN:VCALENDAR"), size: 15 } }),
      ],
    }),
  });
  assert.equal(m.text, "Attached is v2.");
  assert.deepEqual(m.from, { address: "lin@venue.example", name: "Lin" });
  assert.equal(m.headerMessageId, "<a@venue>");
  assert.equal(m.references, "<c@x> <b@me>");
  assert.deepEqual(
    m.attachments.map((a) => [a.filename, a.mimeType, a.attachmentId, !!a.data]),
    [
      ["contract-v2.pdf", "application/pdf", "att2", false],
      ["invite.ics", "text/calendar", null, true],
    ],
  );
});

test("HTML only becomes text", () => {
  const m = readMessage({ id: "m", threadId: "t", payload: part({ mimeType: "text/html", body: { data: b64("<div>週五 <b>19:00</b></div><div>台北</div>") } }) });
  assert.equal(m.text, "週五 19:00\n\n台北");
});

test("a Big5 body is decoded", () => {
  const big5 = Buffer.from([0xa4, 0xa4, 0xa4, 0xe5]); // the two Chinese characters for "Chinese" in Big5
  const m = readMessage({ id: "m", threadId: "t", payload: part({ mimeType: "text/plain", headers: { "Content-Type": 'text/plain; charset="big5"' }, body: { data: b64(big5) } }) });
  assert.equal(m.text, "中文");
});
