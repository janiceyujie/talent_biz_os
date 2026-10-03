import "server-only";
import { z } from "zod";

// The one place that talks to a language model. The pipeline asks for an
// object matching a zod schema; which model answers is configuration:
//
//   AI_PROVIDER=gemini     Google's Gemini API; GEMINI_API_KEY, AI_MODEL — one model or a fallback
//                          list tried in order when one is busy (e.g. gemini-3.5-flash-lite,gemini-3.1-flash-lite).
//                          On the free tier Google may use inputs to improve its products — test data only.
//   AI_PROVIDER=ollama     a free local model through Ollama, offline
//                          AI_MODEL (default qwen3:8b), OLLAMA_URL (default http://127.0.0.1:11434)
//   AI_PROVIDER=anthropic  Claude — not wired yet; added when we test with it
//
// See docs/decisions/0006-model-provider.md.

export type StructuredRequest<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
};
export type StructuredResult<T> = { object: T; modelVersion: string };

export class ModelError extends Error {}

export async function generateObject<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const provider = process.env.AI_PROVIDER || "ollama";
  if (provider === "gemini") return gemini(request);
  if (provider === "ollama") return ollama(request);
  throw new ModelError(`AI_PROVIDER "${provider}" isn't wired up yet`);
}

async function ollama<T>({ system, prompt, schema }: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const model = process.env.AI_MODEL || "qwen3:8b";
  const url = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        think: false, // reasoning models: answer directly; the schema is the whole output
        format: z.toJSONSchema(schema), // Ollama constrains generation to this schema
        options: { temperature: 0 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (e) {
    throw new ModelError(`Couldn't reach Ollama at ${url} (${e instanceof Error ? e.message : e}). Is it running?`);
  }
  if (!response.ok) throw new ModelError(`Ollama answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = (await response.json()) as { message?: { content?: string } };
  return { object: parseAgainst(schema, body.message?.content ?? ""), modelVersion: `ollama:${model}` };
}

async function gemini<T>({ system, prompt, schema }: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ModelError("GEMINI_API_KEY isn't set");
  const models = (process.env.AI_MODEL || "gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",").map((m) => m.trim()).filter(Boolean);
  const busy = (r: Response) => r.status === 503 || r.status === 429;
  // Busy (503) and rate-limited (429) answers are usually brief: retry once after a pause, then try the next model.
  let model = models[0];
  let response = await geminiRequest(model, key, system, prompt, schema);
  for (const next of models) {
    if (next !== model) {
      model = next;
      response = await geminiRequest(model, key, system, prompt, schema);
    }
    if (!busy(response)) break;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    response = await geminiRequest(model, key, system, prompt, schema);
    if (!busy(response)) break;
  }
  const body = (await response.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    modelVersion?: string;
    error?: { status?: string; message?: string };
  };
  if (!response.ok) {
    const reason =
      response.status === 429
        ? "rate limit reached — wait a minute and retry"
        : response.status === 503
          ? "the model is busy — retry in a minute"
          : body.error?.message?.slice(0, 200);
    throw new ModelError(`Gemini answered ${response.status}: ${reason}`);
  }
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new ModelError(`Gemini returned no answer (${body.candidates?.[0]?.finishReason ?? "no candidates"})`);
  return { object: parseAgainst(schema, text), modelVersion: `gemini:${body.modelVersion ?? model}` };
}

async function geminiRequest<T>(model: string, key: string, system: string, prompt: string, schema: z.ZodType<T>) {
  try {
    return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      // The key goes in a header, never the URL, so it can't end up in logged URLs or error messages.
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(schema), // Gemini constrains the answer to this schema
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    throw new ModelError(`Couldn't reach the Gemini API (${e instanceof Error ? e.message : e})`);
  }
}

function parseAgainst<T>(schema: z.ZodType<T>, text: string): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ModelError("The model's answer wasn't valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ModelError(`The model's answer didn't match the schema: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}
