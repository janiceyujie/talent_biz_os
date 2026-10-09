import { mkdir, readFile, writeFile, rename, rmdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export class LocalAIError extends Error {
  constructor(readonly code: "not_configured" | "usage_limit" | "busy" | "too_long" | "unreachable" | "invalid_output" | "rate_limited", message: string) { super(message); }
}
export type TokenUsage = { inputTokens: number; outputTokens: number; cachedInputTokens: number; cacheWriteTokens: number; reasoningTokens: number };
// Standard USD / million tokens, verified 2026-10-07. No regional or fast tier.
export const LUNA_PRICE = { input: 0.10, cached: 0.01, cacheWrite: 0.125, output: 0.50 };
export function costUSD(u: TokenUsage) {
  if (Object.values(u).some(n => !Number.isSafeInteger(n) || n < 0) || u.cachedInputTokens + u.cacheWriteTokens > u.inputTokens || u.reasoningTokens > u.outputTokens)
    throw new LocalAIError("invalid_output", "Invalid token accounting");
  const multiplier = u.inputTokens > 272000 ? 2 : 1;
  return ((u.inputTokens - u.cachedInputTokens - u.cacheWriteTokens) * LUNA_PRICE.input * multiplier + u.cachedInputTokens * LUNA_PRICE.cached * multiplier + u.cacheWriteTokens * LUNA_PRICE.cacheWrite * multiplier + u.outputTokens * LUNA_PRICE.output * (multiplier === 2 ? 1.5 : 1)) / 1e6;
}
export function assertLocalExperiment() {
  let host = "";
  try { host = new URL(process.env.DATABASE_URL || "").hostname; } catch {}
  if (process.env.NODE_ENV === "production" || process.env.AI_LOCAL_EXPERIMENT !== "1" || !["localhost", "127.0.0.1", "[::1]"].includes(host))
    throw new LocalAIError("not_configured", "This experiment requires a local database and explicit development opt-in");
}
type Entry = { id: string; status: "reserved" | "settled"; chargedUSD: number; at: string; usage?: TokenUsage; model?: string; latencyMs?: number; outcome?: string };
export async function withLocalBudget<T extends { usage: TokenUsage; model: string; latencyMs: number; status: string }>(bytes: number, outputLimit: number, call: () => Promise<T>): Promise<T & { estimatedCostUSD: number; budgetUsedUSD: number }> {
  assertLocalExperiment();
  // UTF-8 byte count plus framing is a conservative bound for bounded text input.
  if (bytes > 200000 || outputLimit > 6000) throw new LocalAIError("too_long", "Request exceeds local evaluation bounds");
  const cap = Math.min(5, Number(process.env.AI_LOCAL_BUDGET_USD || 5));
  if (!Number.isFinite(cap) || cap <= 0) throw new LocalAIError("usage_limit", "Invalid local budget");
  const dir = path.resolve(".ai-local");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, "budget.lock");
  try { await mkdir(lock); } catch { throw new LocalAIError("busy", "Another local AI call is active; retry after it finishes"); }
  try {
    const file = path.join(dir, "budget.json");
    let entries: Entry[];
    try { entries = JSON.parse(await readFile(file, "utf8")); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") entries = []; else throw e; }
    if (!Array.isArray(entries) || entries.some(e => !Number.isFinite(e.chargedUSD) || e.chargedUSD < 0)) throw new Error("Invalid budget ledger; manual review required");
    const used = entries.reduce((sum, e) => sum + e.chargedUSD, 0);
    const reservation = ((bytes + 4096) * LUNA_PRICE.cacheWrite + outputLimit * LUNA_PRICE.output) / 1e6;
    if (used + reservation > cap) throw new LocalAIError("usage_limit", "Local USD 5 experiment ceiling reached");
    const entry: Entry = { id: randomUUID(), status: "reserved", chargedUSD: reservation, at: new Date().toISOString() };
    entries.push(entry);
    const save = async () => { const tmp = file + ".tmp"; await writeFile(tmp, JSON.stringify(entries, null, 2), { mode: 0o600 }); await rename(tmp, file); };
    // Reserve before sending. Network errors, crashes and unknown usage retain the full reservation.
    await save();
    const result = await call();
    const actual = costUSD(result.usage);
    Object.assign(entry, { status: "settled", chargedUSD: actual, usage: result.usage, model: result.model, latencyMs: result.latencyMs, outcome: result.status });
    await save();
    return { ...result, estimatedCostUSD: actual, budgetUsedUSD: used + actual };
  } finally { await rmdir(lock); }
}
