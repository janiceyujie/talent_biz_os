// Relevance evaluation: runs every case in evals/relevance/cases.ts through
// the same function the worker uses (lib/mail/relevance/score.ts) and scores
// it against the thresholds. Recall comes first: real work filtered out is the
// costly miss (decision 0013).
//
//   npm run eval:relevance                                 # the relevance provider and model from .env.local
//   npm run eval:relevance -- --provider gemini
//   npm run eval:relevance -- --provider ollama --model qwen3:8b
//   npm run eval:relevance -- --only zh                    # cases whose id contains "zh"
//
// Results are saved to evals/results/ (not committed).
import { mkdirSync, writeFileSync } from "node:fs";
import nextEnv from "@next/env";
import { cases } from "../evals/relevance/cases";

nextEnv.loadEnvConfig(process.cwd()); // same .env files the app reads
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
if (arg("provider")) process.env.AI_MAILBOX_PROVIDER = arg("provider");
if (arg("model")) process.env.AI_MAILBOX_MODEL = arg("model");
const only = arg("only");
const pause = Number(arg("pause") ?? (process.env.AI_MAILBOX_PROVIDER === "gemini" ? 4000 : 0)); // free tiers limit requests a minute

const { scoreMail } = await import("../lib/mail/relevance/score");
const { modelFor } = await import("../lib/ai/model");
const { parseAddress } = await import("../lib/mail/metadata");
const { outcomeFor, thresholds } = await import("../lib/mail/relevance/thresholds");
const { RELEVANCE_PROMPT_VERSION } = await import("../lib/mail/relevance/prompt");

const tabLabel = { Primary: "CATEGORY_PERSONAL", Promotions: "CATEGORY_PROMOTIONS", Updates: "CATEGORY_UPDATES", Social: "CATEGORY_SOCIAL" } as const;
const t = thresholds();
const { provider, models } = modelFor("relevance");
const selected = cases.filter((c) => !only || c.id.includes(only));
const results: { id: string; work: boolean; score: number | null; kind: string | null; expectedKind?: string; steered?: boolean; error?: string }[] = [];

for (const [i, c] of selected.entries()) {
  if (i && pause) await new Promise((r) => setTimeout(r, pause));
  try {
    const out = await scoreMail(
      { from: parseAddress(c.from), subject: c.subject, labels: ["INBOX", tabLabel[c.tab]], snippet: c.snippet },
      { task: "eval" },
      false, // made-up cases, not a mailbox
    );
    // The same cap the worker applies: an email that tries to steer the check is at most "Not sure".
    const score = out.steered ? Math.min(out.score, t.high - 0.001) : out.score;
    results.push({ id: c.id, work: c.work, score, kind: out.kind, expectedKind: c.kind, ...(out.steered ? { steered: true } : {}) });
  } catch (e) {
    results.push({ id: c.id, work: c.work, score: null, kind: null, expectedKind: c.kind, error: (e as Error).message });
  }
  const r = results.at(-1)!;
  const outcome = r.score === null ? "error" : outcomeFor(r.score, t);
  const wrong = r.score !== null && ((c.work && outcome === "skipped") || (!c.work && outcome === "work"));
  const kindMiss = r.kind && c.kind && r.kind !== c.kind ? ` (expected ${c.kind})` : "";
  console.log(
    `${wrong ? "✗" : outcome === "unsure" ? "~" : "✓"} ${c.id.padEnd(22)} ${c.work ? "work" : "not "}  ${r.score?.toFixed(2) ?? "  - "}  ${outcome.padEnd(7)} ${r.kind ?? r.error}${kindMiss}${r.steered ? "  [steering: capped]" : ""}`,
  );
}

const scored = results.filter((r) => r.score !== null);
const work = scored.filter((r) => r.work);
const notWork = scored.filter((r) => !r.work);
const rate = (n: number, of: number) => (of ? `${n}/${of} (${Math.round((100 * n) / of)}%)` : "-");
const at = (low: number, high: number) => ({
  kept: work.filter((r) => r.score! >= low).length, // recall: real work not filtered out
  sure: work.filter((r) => r.score! >= high).length,
  dropped: notWork.filter((r) => r.score! < low).length,
  falseWork: notWork.filter((r) => r.score! >= high).length,
});

console.log(`\nprompt ${RELEVANCE_PROMPT_VERSION} · ${provider}:${models.join(",")} · thresholds ${t.low}/${t.high}`);
const now = at(t.low, t.high);
console.log(`work kept (recall)      ${rate(now.kept, work.length)}   ← must be 100%`);
console.log(`work marked sure        ${rate(now.sure, work.length)}`);
console.log(`not work filtered out   ${rate(now.dropped, notWork.length)}`);
console.log(`not work marked work    ${rate(now.falseWork, notWork.length)}`);
const kinds = scored.filter((r) => r.expectedKind);
console.log(`kind as expected        ${rate(kinds.filter((r) => r.kind === r.expectedKind).length, kinds.length)}`);
if (results.length > scored.length) console.log(`errors                  ${results.length - scored.length}`);

// Where the thresholds could go: the highest low that keeps every work case, and what each choice filters.
const lowest = Math.min(...work.map((r) => r.score!));
console.log(`\nlowest-scoring work case: ${lowest.toFixed(2)} → a low threshold up to that keeps all work`);
for (const low of [0.1, 0.2, 0.3, 0.4]) {
  const x = at(low, t.high);
  console.log(`  low ${low}: work kept ${rate(x.kept, work.length)}, not work filtered ${rate(x.dropped, notWork.length)}`);
}

mkdirSync("evals/results", { recursive: true });
const file = `evals/results/${new Date().toISOString().replace(/[:.]/g, "-")}-relevance-${models.join("_").replace(/[^\w.-]+/g, "_")}.json`;
writeFileSync(file, JSON.stringify({ promptVersion: RELEVANCE_PROMPT_VERSION, provider, models, thresholds: t, results }, null, 2));
console.log(`\nsaved ${file}`);
process.exit(0);
