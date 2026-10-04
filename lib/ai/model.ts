import "server-only";
import { z } from "zod";
import type { ModelErrorCode } from "./errors";

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

/** A file the model reads alongside the prompt: an image or a PDF, in order. */
export type Attachment = { mimeType: string; data: Uint8Array };

export type StructuredRequest<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  attachments?: Attachment[];
};
export type StructuredResult<T> = { object: T; modelVersion: string };

/** Why a model call failed — see lib/ai/errors.ts. The detail is for logs. */
export class ModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    detail: string,
  ) {
    super(detail);
  }
}

export async function generateObject<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const provider = process.env.AI_PROVIDER || "ollama";
  if (provider === "gemini") return gemini(request);
  if (provider === "ollama") return ollama(request);
  throw new ModelError("not_configured", `AI_PROVIDER "${provider}" isn't wired up yet`);
}

async function ollama<T>({ system, prompt, schema, attachments = [] }: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const model = process.env.AI_MODEL || "qwen3:8b";
  // Ollama takes images (for vision models) but not PDFs.
  if (attachments.some((a) => !a.mimeType.startsWith("image/")))
    throw new ModelError("unsupported_file", "The local model can't read PDFs — switch AI_PROVIDER to gemini for documents");
  const images = attachments.map((a) => Buffer.from(a.data).toString("base64"));
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
          { role: "user", content: prompt, ...(images.length ? { images } : {}) },
        ],
      }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (e) {
    throw new ModelError("unreachable", `Couldn't reach Ollama at ${url} (${e instanceof Error ? e.message : e}). Is it running?`);
  }
  if (!response.ok) throw new ModelError("unreachable", `Ollama answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = (await response.json()) as { message?: { content?: string } };
  return { object: parseAgainst(schema, body.message?.content ?? ""), modelVersion: `ollama:${model}` };
}

async function gemini<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const { schema } = request;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ModelError("not_configured", "GEMINI_API_KEY isn't set");
  const models = (process.env.AI_MODEL || "gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",").map((m) => m.trim()).filter(Boolean);
  const busy = (r: Response) => r.status === 503 || r.status === 429;
  // Busy (503) and rate-limited (429) answers are usually brief: retry once after a pause, then try the next model.
  let model = models[0];
  let response = await geminiRequest(model, key, request);
  for (const next of models) {
    if (next !== model) {
      model = next;
      response = await geminiRequest(model, key, request);
    }
    if (!busy(response)) break;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    response = await geminiRequest(model, key, request);
    if (!busy(response)) break;
  }
  const body = (await response.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    modelVersion?: string;
    error?: { status?: string; message?: string };
  };
  if (!response.ok) {
    const code: ModelErrorCode = response.status === 429 ? "rate_limited" : response.status === 503 ? "busy" : "unreachable";
    throw new ModelError(code, `Gemini answered ${response.status}: ${body.error?.message?.slice(0, 200)}`);
  }
  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) {
    // Gemini says why it stopped: RECITATION (would copy published text),
    // SAFETY and similar (filters), MAX_TOKENS (ran out of room).
    const reason = body.promptFeedback?.blockReason ?? candidate?.finishReason ?? "no candidates";
    const code: ModelErrorCode =
      reason === "RECITATION" ? "recitation" : reason === "MAX_TOKENS" ? "too_long" : reason === "no candidates" ? "invalid_output" : "blocked";
    throw new ModelError(code, `Gemini returned no answer (${reason})`);
  }
  return { object: parseAgainst(schema, text), modelVersion: `gemini:${body.modelVersion ?? model}` };
}

async function geminiRequest<T>(model: string, key: string, { system, prompt, schema, attachments = [] }: StructuredRequest<T>) {
  // The prompt first (it names the files), then the files in order.
  const parts = [
    { text: prompt },
    ...attachments.map((a) => ({ inlineData: { mimeType: a.mimeType, data: Buffer.from(a.data).toString("base64") } })),
  ];
  try {
    return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      // The key goes in a header, never the URL, so it can't end up in logged URLs or error messages.
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(schema), // Gemini constrains the answer to this schema
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    throw new ModelError("unreachable", `Couldn't reach the Gemini API (${e instanceof Error ? e.message : e})`);
  }
}

function parseAgainst<T>(schema: z.ZodType<T>, text: string): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ModelError("invalid_output", "The model's answer wasn't valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ModelError("invalid_output", `The model's answer didn't match the schema: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}
