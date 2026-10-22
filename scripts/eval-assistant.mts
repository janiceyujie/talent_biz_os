// Assistant evaluation: asks each made-up question in evals/assistant/cases.ts
// with the same snapshot, prompt, and model call the app uses (decision 0023),
// and checks what the answer contains, that it has no links, and that it's in
// the person's language. Run before and after changing the prompt, the
// snapshot, or the assistant's model, and compare.
//
//   npm run eval:assistant                                 # the primary provider from .env.local
//   npm run eval:assistant -- --provider openai            # another provider, its assistant model
//   npm run eval:assistant -- --model claude-sonnet-5-5    # another model for the assistant role
//   npm run eval:assistant -- --max-calls 50 --max-cost 1  # the run's budget (default 200 calls, $2)
//   npm run eval:assistant -- --only zh                    # cases whose id contains "zh"
//
// Results are saved to evals/results/ (not committed).
import { mkdirSync, writeFileSync } from "node:fs";
import nextEnv from "@next/env";
import { cases, overview, project } from "../evals/assistant/cases";

nextEnv.loadEnvConfig(process.cwd()); // same .env files the app reads
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
// --provider names the primary; --model replaces its model for the assistant role.
if (arg("provider")) process.env.AI_PRIMARY = arg("provider");
if (arg("model")) process.env[`AI_MODEL_${(process.env.AI_PRIMARY || "anthropic").toUpperCase()}_ASSISTANT`] = arg("model");
delete process.env.AI_BACKUP; // an eval measures one provider
const only = arg("only");

const { generateText, modelFor } = await import("../lib/ai/model");
const { evalBudget, evalSpend, spendLine } = await import("../lib/ai/spend");
const { ASSISTANT_PROMPT_VERSION, assistantPrompt, assistantSystem } = await import("../lib/assistant/prompt");
const { cleanSnapshot, overviewSnapshot, projectSnapshot } = await import("../lib/assistant/snapshot");

const snapshots = { overview: cleanSnapshot(overviewSnapshot(overview)).snapshot, project: cleanSnapshot(projectSnapshot(project)).snapshot };
const { provider, model } = modelFor("assistant");
const selected = cases.filter((c) => !only || c.id.includes(only));
const cjk = /[㐀-鿿]/;
type Check = { check: string; pass: boolean };
const results: { id: string; answer?: string; checks: Check[]; error?: string }[] = [];

const budget = evalBudget(arg);
const runStarted = new Date();
let stopped = "";
for (const c of selected) {
  // The budget (lib/ai/spend.ts): stop once this run reaches its calls or estimated cost.
  const spent = await evalSpend(runStarted);
  if (spent.calls >= budget.maxCalls || spent.cost >= budget.maxCost) {
    stopped = `stopped at the budget (${budget.maxCalls} calls, $${budget.maxCost.toFixed(2)}): ${selected.length - results.length} cases not run`;
    break;
  }
  try {
    const { text } = await generateText({
      role: "assistant",
      system: assistantSystem(c.locale),
      prompt: assistantPrompt(snapshots[c.scope], c.question, cleanSnapshot({ history: c.history ?? [] }).snapshot.history),
      trace: { task: "eval", promptVersion: ASSISTANT_PROMPT_VERSION },
    });
    const lower = text.toLowerCase();
    const checks: Check[] = [
      ...(c.includes ?? []).map((group) => ({ check: `has ${group.slice(0, 3).join(" | ")}`, pass: group.some((g) => lower.includes(g.toLowerCase())) })),
      ...(c.excludes ?? []).map((x) => ({ check: `not "${x}"`, pass: !lower.includes(x.toLowerCase()) })),
      { check: "no links or images", pass: !/https?:\/\/|!\[|\]\(/.test(text) },
      { check: `in ${c.locale}`, pass: c.locale === "zh-TW" ? cjk.test(text) : !cjk.test(text) },
    ];
    results.push({ id: c.id, answer: text, checks });
  } catch (e) {
    results.push({ id: c.id, checks: [], error: (e as Error).message });
  }
  const r = results.at(-1)!;
  const misses = r.checks.filter((x) => !x.pass);
  console.log(`${r.error ? "!" : misses.length ? "✗" : "✓"} ${c.id.padEnd(30)} ${r.error ?? misses.map((m) => m.check).join("; ")}`);
  if (misses.length) console.log(`    ${r.answer!.replace(/\n/g, "\n    ")}`);
}

const answered = results.filter((r) => !r.error);
const all = answered.flatMap((r) => r.checks);
console.log(`\nprompt ${ASSISTANT_PROMPT_VERSION} · ${provider}:${model}`);
console.log(`cases fully right: ${answered.filter((r) => r.checks.every((x) => x.pass)).length}/${results.length} · checks: ${all.filter((x) => x.pass).length}/${all.length} · errors: ${results.length - answered.length}`);

mkdirSync("evals/results", { recursive: true });
const file = `evals/results/${new Date().toISOString().replace(/[:.]/g, "-")}-assistant-${model.replace(/[^\w.-]+/g, "_")}.json`;
const spend = await evalSpend(runStarted);
console.log(`${spendLine(spend)}${stopped ? `\n${stopped}` : ""}`);
writeFileSync(file, JSON.stringify({ promptVersion: ASSISTANT_PROMPT_VERSION, provider, model, spend, stopped, results }, null, 2));
console.log(`saved ${file}`);
process.exit(0);
