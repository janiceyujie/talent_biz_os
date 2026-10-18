// The analysis prompt's thread block (decision 0013). Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { messagePrompt, threadBlock } from "./prompts";

test("no thread, no block", () => {
  assert.equal(threadBlock([]), "");
  assert.ok(messagePrompt("hi", "en").startsWith("<message>"));
});

test("earlier messages, oldest first, before the message, as background", () => {
  const prompt = messagePrompt("同樣時間可以嗎？", "zh-TW", [], [
    { date: "2026-09-28", from: "them", name: "Maya", intent: "inquiry", fee: "30000 TWD", dates: ["2026-11-14 18:00 演出"], asks: ["11/14 檔期"] },
    { date: "2026-09-30", from: "you", name: "", intent: "confirmation", fee: "", dates: [], asks: [] },
  ]);
  assert.match(prompt, /^<earlier_in_thread>\n- 2026-09-28, the other side \(Maya\): inquiry · fee 30000 TWD · dates 2026-11-14 18:00 演出 · asked 11\/14 檔期\n- 2026-09-30, the artist: confirmation\n<\/earlier_in_thread>\n\n<message>\n/);
});
