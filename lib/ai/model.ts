import "server-only";
import { z } from "zod";

// The one place that talks to a language model. The pipeline asks for an
// object matching a zod schema; which model answers is configuration:
//
//   AI_PROVIDER=ollama     a free local model through Ollama (development)
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
  let raw: unknown;
  try {
    raw = JSON.parse(body.message?.content ?? "");
  } catch {
    throw new ModelError("The model's answer wasn't valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ModelError(`The model's answer didn't match the schema: ${parsed.error.issues[0]?.message}`);
  return { object: parsed.data, modelVersion: `ollama:${model}` };
}
