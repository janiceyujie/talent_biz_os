// Which attachments of an email are brought in. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { notWork } from "@/lib/ai/analysis";
import { chooseAttachments } from "./attachments";
import type { AttachmentRef } from "./gmail/parts";

const MB = 1024 * 1024;
const att = (filename: string, mimeType: string, size: number): AttachmentRef => ({ partId: filename, filename, mimeType, size, attachmentId: "x", data: null });

test("PDFs and images within the limits; the rest are listed, not fetched", () => {
  const { fetch, skipped } = chooseAttachments([
    att("contract.pdf", "application/pdf", 2 * MB),
    att("rider.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 50_000),
    att("poster.jpg", "image/jpeg", 11 * MB), // over 10 MB
    att("stage.png", "image/png", 1 * MB),
    att("photos.zip", "application/zip", 3 * MB),
  ]);
  assert.deepEqual(fetch.map((a) => a.filename), ["contract.pdf", "stage.png"]);
  assert.deepEqual(skipped.map((a) => a.filename), ["rider.docx", "poster.jpg", "photos.zip"]);
});

test("the total stays under what one model request can carry", () => {
  const { fetch, skipped } = chooseAttachments([att("a.pdf", "application/pdf", 7 * MB), att("b.pdf", "application/pdf", 6 * MB), att("c.png", "image/png", 4 * MB)]);
  assert.deepEqual(fetch.map((a) => a.filename), ["a.pdf", "c.png"]);
  assert.deepEqual(skipped.map((a) => a.filename), ["b.pdf"]);
});

test("the analysis calls an email not work only with nothing to act on", () => {
  const empty = { intent: "other", dates: [], money: { amount: 0 }, paymentTerms: "", details: [], asks: [], flags: [] } as unknown as Parameters<typeof notWork>[0];
  assert.ok(notWork(empty));
  assert.ok(!notWork({ ...empty, asks: ["Send the photos from Saturday"] })); // thanks after a show, with an ask: work
  assert.ok(!notWork({ ...empty, intent: "inquiry" }));
  assert.ok(!notWork({ ...empty, flags: [{ kind: "instructions_to_ai", note: "", asStated: "", source: "check" }] } as typeof empty)); // a warning is for a person
});
