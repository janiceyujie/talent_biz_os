// Saved assistant messages (decision 0023). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AssistantAnswer } from "./answers";
import { answerContent, HISTORY_TURNS, historyFor, questionContent, savedLine, titleOf, type SavedLine } from "./content";

const at = new Date("2026-10-22T03:00:00Z");
const row = (role: "user" | "assistant", content: unknown, id = "m1") => ({ id, role, content, createdAt: at });

describe("savedLine", () => {
  test("a question and an answer come back as saved", () => {
    assert.deepEqual(savedLine(row("user", questionContent({ text: "What's due?", projectId: "11111111-1111-4111-8111-111111111111" }))), {
      id: "m1", role: "user", question: { text: "What's due?", projectId: "11111111-1111-4111-8111-111111111111" }, at: at.toISOString(),
    });
    assert.deepEqual(savedLine(row("user", questionContent({ intent: "today" }))).role, "user");
    const money: AssistantAnswer = { kind: "money", direction: "in", today: "2026-10-22", totals: [{ currency: "TWD", amount: 100 }], overdue: [], lines: [], more: 0 };
    assert.deepEqual(savedLine(row("assistant", answerContent(money))), { id: "m1", role: "assistant", answer: money, at: at.toISOString() });
  });

  test("content of another version or shape is unreadable, not an error", () => {
    assert.deepEqual(savedLine(row("assistant", { v: 2, parts: [] })), { id: "m1", role: "assistant", unreadable: true, at: at.toISOString() });
    assert.deepEqual(savedLine(row("user", { v: 1, question: { intent: "next_month" } })), { id: "m1", role: "user", unreadable: true, at: at.toISOString() });
    assert.deepEqual(savedLine(row("assistant", null)), { id: "m1", role: "assistant", unreadable: true, at: at.toISOString() });
  });
});

describe("historyFor", () => {
  const text = (role: "user" | "assistant", t: string, id: string): SavedLine =>
    role === "user" ? { id, role, question: { text: t }, at: "" } : { id, role, answer: { kind: "text", text: t }, at: "" };

  test("the last turns, oldest first; quick prompts by intent, code-worked answers as their data; unreadable ones skipped", () => {
    const lines: SavedLine[] = [
      { id: "a", role: "user", question: { intent: "receivable" }, at: "" },
      { id: "b", role: "assistant", answer: { kind: "money", direction: "in", today: "2026-10-22", totals: [], overdue: [], lines: [], more: 0 }, at: "" },
      { id: "c", role: "assistant", unreadable: true, at: "" },
      text("user", "And next week?", "d"),
    ];
    const got = historyFor(lines);
    assert.deepEqual(got.map((h) => h.role), ["user", "assistant", "user"]);
    assert.equal(got[0].text, "[quick prompt: receivable]");
    assert.ok(got[1].text.startsWith('{"kind":"money"'));
  });

  test("at most the last few turns, each cut short, and the oldest dropped past the total", () => {
    const many = Array.from({ length: 10 }, (_, i) => text(i % 2 ? "assistant" : "user", `q${i}`, `m${i}`));
    assert.deepEqual(historyFor(many).map((h) => h.text), many.slice(-HISTORY_TURNS).map((l) => ("question" in l && "text" in l.question ? l.question.text : "answer" in l && l.answer.kind === "text" ? l.answer.text : "")));
    const long = Array.from({ length: 6 }, (_, i) => text("assistant", "x".repeat(5000), `l${i}`));
    const got = historyFor(long);
    assert.ok(got.every((h) => h.text.length <= 1500));
    assert.ok(got.reduce((n, h) => n + h.text.length, 0) <= 6000);
    assert.equal(got.length, 4);
  });
});

describe("titleOf", () => {
  test("one line, cut short", () => {
    assert.equal(titleOf("  What's\non   tomorrow? "), "What's on tomorrow?");
    assert.equal(titleOf("a".repeat(100)), `${"a".repeat(80)}…`);
  });
});
