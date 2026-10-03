// Extraction evaluation: runs every case in evals/extraction/cases.ts through
// the same function the app uses (lib/ai/extract.ts) and scores each expected
// field. Use it before and after changing the prompt, the field registry, or
// the model, and compare.
//
//   npm run eval:extraction                         # provider and model from .env.local
//   npm run eval:extraction -- --model gemini-3.5-flash-lite
//   npm run eval:extraction -- --provider ollama --model qwen3:8b
//   npm run eval:extraction -- --only gig            # cases whose id contains "gig"
//
// Results are saved to evals/results/ (not committed). Only made-up messages
// belong in the cases: a free-tier provider may keep what it's sent.
import { mkdirSync, writeFileSync } from "node:fs";
import nextEnv from "@next/env";
import { cases, RECEIVED, type EvalCase } from "../evals/extraction/cases";

nextEnv.loadEnvConfig(process.cwd()); // same .env files the app reads
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
if (arg("provider")) process.env.AI_PROVIDER = arg("provider");
if (arg("model")) process.env.AI_MODEL = arg("model");
const only = arg("only");
const pause = Number(arg("pause") ?? 4000); // free tiers limit requests per minute (~15)

const { extractMessage } = await import("../lib/ai/extract");
type Analysis = Awaited<ReturnType<typeof extractMessage>>["analysis"];

const lower = (s: string) => s.toLowerCase();
type Check = { field: string; pass: boolean; expected: unknown; got: unknown };

function score(c: EvalCase, a: Analysis): Check[] {
  const e = c.expect;
  const checks: Check[] = [];
  const add = (field: string, expected: unknown, got: unknown, pass: boolean) => checks.push({ field, expected, got, pass });
  if (e.intent !== undefined) add("intent", e.intent, a.intent, a.intent === e.intent);
  if (e.projectType !== undefined) add("projectType", e.projectType, a.projectType, a.projectType === e.projectType);
  if (e.amount !== undefined) add("amount", e.amount, a.money.amount, a.money.amount === e.amount);
  if (e.currency !== undefined) add("currency", e.currency, a.money.currency, a.money.currency === e.currency);
  if (e.taxIncluded !== undefined) add("taxIncluded", e.taxIncluded, a.money.taxIncluded, a.money.taxIncluded === e.taxIncluded);
  if (e.replyBy !== undefined) add("replyBy", e.replyBy, a.replyBy, a.replyBy === e.replyBy);
  if (e.counterpartyName !== undefined)
    add("counterparty", e.counterpartyName, a.counterparty.name, lower(a.counterparty.name).includes(lower(e.counterpartyName)));
  if (e.company !== undefined) add("company", e.company, a.counterparty.company, lower(a.counterparty.company).includes(lower(e.company)));
  if (e.email !== undefined) add("email", e.email, a.counterparty.email, lower(a.counterparty.email) === lower(e.email));
  for (const d of e.dates ?? []) {
    const hit = a.dates.some(
      (x) => x.date === d.date && (!d.time || x.time === d.time) && (!d.timeZone || x.timeZone === d.timeZone),
    ) || (!d.time && a.replyBy === d.date);
    add("dates", d, a.dates.map((x) => [x.date, x.time, x.timeZone].filter(Boolean).join(" ")), hit);
  }
  for (const [keys, want] of Object.entries(e.details ?? {})) {
    const values = keys.split("|").map((key) => a.details[key]?.value ?? "");
    const pass = values.some((got) => (want === true ? got !== "" : lower(got).includes(lower(want))));
    add(`details.${keys}`, want, values.join(" | "), pass);
  }
  // Flags: required ones must be raised; a case that expects none must raise none (false alarms erode trust).
  const raised = [...new Set(a.flags.map((f) => f.kind))];
  if (e.flags) for (const kind of e.flags) add("flags", kind, raised, raised.includes(kind as (typeof raised)[number]));
  else add("noFalseFlags", [], a.flags.map((f) => `${f.kind}: ${f.note || f.asStated}`), raised.length === 0);
  return checks;
}

const selected = cases.filter((c) => !only || c.id.includes(only));
const results: { id: string; seconds: number; modelVersion?: string; error?: string; checks: Check[]; analysis?: Analysis }[] = [];
let promptVersion = "";
for (const c of selected) {
  const t0 = Date.now();
  try {
    const out = await extractMessage({ body: c.message, today: RECEIVED.today, timeZone: RECEIVED.timeZone, outputLocale: "zh-TW" });
    promptVersion = out.promptVersion;
    const checks = score(c, out.analysis);
    results.push({ id: c.id, seconds: (Date.now() - t0) / 1000, modelVersion: out.modelVersion, checks, analysis: out.analysis });
    const failed = checks.filter((x) => !x.pass);
    console.log(`${failed.length ? "✗" : "✓"} ${c.id.padEnd(22)} ${String(checks.length - failed.length).padStart(2)}/${checks.length}  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${out.modelVersion}`);
    for (const f of failed) console.log(`    ${f.field}: expected ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.got)}`);
  } catch (e) {
    results.push({ id: c.id, seconds: (Date.now() - t0) / 1000, error: String(e instanceof Error ? e.message : e), checks: [] });
    console.log(`! ${c.id.padEnd(22)} error: ${e instanceof Error ? e.message : e}`);
  }
  if (pause) await new Promise((r) => setTimeout(r, pause));
}

// Accuracy per field, across cases
const byField = new Map<string, { pass: number; total: number }>();
for (const r of results)
  for (const x of r.checks) {
    const name = x.field.startsWith("details.") ? "details" : x.field;
    const s = byField.get(name) ?? { pass: 0, total: 0 };
    s.total++;
    if (x.pass) s.pass++;
    byField.set(name, s);
  }
const all = results.flatMap((r) => r.checks);
const passedCases = results.filter((r) => !r.error && r.checks.every((x) => x.pass)).length;
console.log(`\nprompt ${promptVersion} · ${process.env.AI_PROVIDER}:${process.env.AI_MODEL}`);
console.log(`cases fully right: ${passedCases}/${results.length} · checks: ${all.filter((x) => x.pass).length}/${all.length} · errors: ${results.filter((r) => r.error).length}`);
for (const [field, s] of byField) console.log(`  ${field.padEnd(14)} ${s.pass}/${s.total}`);

mkdirSync("evals/results", { recursive: true });
const file = `evals/results/${new Date().toISOString().replace(/[:.]/g, "-")}-${(process.env.AI_MODEL ?? "").replace(/[^\w.-]+/g, "_")}.json`;
writeFileSync(file, JSON.stringify({ promptVersion, provider: process.env.AI_PROVIDER, model: process.env.AI_MODEL, results }, null, 2));
console.log(`saved ${file}`);
