import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiCall } from "@/lib/db/schema";

// What model calls cost, estimated from the tokens each one reports (ai_call)
// and list prices. For the evals' budget (scripts/eval-*.mts); the providers'
// own spending limits are the hard cap. Gemini's free tier and a local model cost nothing.

/** US dollars per million tokens, input and output (October 2026 list prices). */
const prices: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "gpt-6-luna": [0.1, 0.5],
  "gpt-6.1-sol": [2, 10],
  "gpt-6-astra": [10, 50],
};

/** A model version as logged ("anthropic:claude-sonnet-5-5") to its price; an unknown paid model is priced like the dearest, to be safe. */
function priceOf(provider: string, modelVersion: string): [number, number] {
  if (provider !== "anthropic" && provider !== "openai") return [0, 0];
  const model = modelVersion.slice(modelVersion.indexOf(":") + 1);
  return prices[model] ?? Object.keys(prices).filter((k) => model.startsWith(k)).map((k) => prices[k])[0] ?? [10, 50];
}

/** Calls made for evals since `since` (replayed ones are free), their tokens, and the estimated cost. */
export async function evalSpend(since: Date) {
  const rows = await db
    .select({ provider: aiCall.provider, model: aiCall.model, replayed: aiCall.replayed, input: aiCall.inputTokens, output: aiCall.outputTokens })
    .from(aiCall)
    .where(and(eq(aiCall.task, "eval"), gte(aiCall.createdAt, since)));
  const real = rows.filter((r) => !r.replayed);
  const inputTokens = real.reduce((n, r) => n + (r.input ?? 0), 0);
  const outputTokens = real.reduce((n, r) => n + (r.output ?? 0), 0);
  const cost = real.reduce((n, r) => {
    const [i, o] = priceOf(r.provider, r.model);
    return n + ((r.input ?? 0) * i + (r.output ?? 0) * o) / 1e6;
  }, 0);
  return { calls: real.length, inputTokens, outputTokens, cost };
}

/** An eval's limits: --max-calls (default 200) and --max-cost in dollars (default 2), per run. */
export function evalBudget(arg: (name: string) => string | undefined) {
  return { maxCalls: Number(arg("max-calls") ?? 200), maxCost: Number(arg("max-cost") ?? 2) };
}

export const spendLine = (s: Awaited<ReturnType<typeof evalSpend>>) =>
  `spent: ${s.calls} calls · ${s.inputTokens.toLocaleString("en")} tokens in, ${s.outputTokens.toLocaleString("en")} out · about $${s.cost.toFixed(2)}`;
