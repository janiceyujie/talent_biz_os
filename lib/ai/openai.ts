import "server-only";
import { LocalAIError, withLocalBudget, type TokenUsage } from "./local-budget";
export type Turn = { role: "user" | "assistant"; content: string };
export async function openAIResponse(request: { instructions: string; input: string | Turn[]; schema?: Record<string, unknown>; maxOutputTokens?: number }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new LocalAIError("not_configured", "OPENAI_API_KEY is not configured");
  const model = process.env.AI_MODEL || "gpt-6-luna";
  if (model !== "gpt-6-luna") throw new LocalAIError("not_configured", "Local cost guard is calibrated only for gpt-6-luna");
  const body = { model, store: false, service_tier: "default", reasoning: { effort: "low" }, max_output_tokens: request.maxOutputTokens ?? 1500, instructions: request.instructions, input: request.input,
    ...(request.schema ? { text: { format: { type: "json_schema", name: "extraction", strict: false, schema: request.schema } } } : {}) };
  const encoded = JSON.stringify(body);
  const result = await withLocalBudget(Buffer.byteLength(encoded), body.max_output_tokens, async () => {
    const start = Date.now();
    let response: Response;
    try { response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: encoded, signal: AbortSignal.timeout(90000) }); }
    catch { throw new LocalAIError("unreachable", "OpenAI request failed; reserved cost retained"); }
    if (!response.ok) throw new LocalAIError(response.status === 429 ? "rate_limited" : "unreachable", `OpenAI HTTP ${response.status}`);
    const data = await response.json();
    const u = data.usage;
    if (!u) throw new LocalAIError("invalid_output", "No usage returned; reserved cost retained");
    const usage: TokenUsage = { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0, cacheWriteTokens: u.input_tokens_details?.cache_write_tokens ?? 0, reasoningTokens: u.output_tokens_details?.reasoning_tokens ?? 0 };
    const text = (data.output ?? []).filter((x: { type: string }) => x.type === "message").flatMap((x: { content?: { type: string; text?: string }[] }) => x.content ?? []).filter((x: { type: string }) => x.type === "output_text").map((x: { text?: string }) => x.text ?? "").join("\n");
    return { text, usage, model: data.model ?? model, latencyMs: Date.now() - start, status: data.status as string };
  });
  if (result.status !== "completed" || !result.text) throw new LocalAIError("too_long", "Response incomplete or refused; usage was accounted for");
  return result;
}
