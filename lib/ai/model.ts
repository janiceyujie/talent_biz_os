import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import { db } from "@/lib/db";
import { aiCall } from "@/lib/db/schema";
import type { ModelErrorCode } from "./errors";

// The one place that talks to a language model. The pipeline asks for an
// object matching a zod schema; which model answers is configuration
// (decision 0015):
//
//   AI_PRIMARY=anthropic   Claude; ANTHROPIC_API_KEY. The production primary.
//   AI_PRIMARY=openai      OpenAI; OPENAI_API_KEY.
//   AI_BACKUP=openai       used only when the primary can't answer (unreachable, overloaded,
//                          rate-limited after its own retries); never for a bad answer.
//   Each call names a role, and each provider has a model per role (defaults below;
//   AI_MODEL_<PROVIDER>_<ROLE> overrides one, e.g. AI_MODEL_ANTHROPIC_ANALYSIS).
//
// Development uses the same paid providers, with its own keys and spending
// caps; there is no free or local provider (docs/decisions/0022).
//
// Every call is logged in ai_call, and can be served from a recording
// (AI_REPLAY) so tests don't spend quota. See docs/decisions/0006 and 0008.

/** A file the model reads alongside the prompt: an image or a PDF, in order. */
export type Attachment = { mimeType: string; data: Uint8Array };

/** What a call is for and whom, for the ai_call log and usage limits. */
export type CallTrace = {
  task: "extract" | "relevance" | "payment_notice" | "assistant" | "eval";
  promptVersion: string;
  talentId?: string | null;
  personId?: string | null;
  messageId?: string | null;
  flags?: string[]; // what the deterministic checks found in what's sent, by kind and place, never the text
};

/**
 * What a call is for (decision 0015): relevance (score one email, the small
 * model), analysis (a message, the mid-size model), analysis_complex
 * (contracts, PDFs, long or unclear messages, the large model; lib/ai/extract.ts routes),
 * assistant (a question about the person's own records, the small model until the
 * assistant eval says otherwise; decision 0023).
 */
export type ModelRole = "analysis" | "analysis_complex" | "relevance" | "assistant";

export type StructuredRequest<T> = {
  role?: ModelRole; // default analysis
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  attachments?: Attachment[];
  trace: CallTrace;
};
export type StructuredResult<T> = { object: T; modelVersion: string };
type Usage = { inputTokens: number | null; outputTokens: number | null };
type ProviderResult<T> = StructuredResult<T> & Usage;

/** Why a model call failed — see lib/ai/errors.ts. The detail is for logs. */
export class ModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    detail: string,
  ) {
    super(detail);
  }
}

type Provider = "anthropic" | "openai";

/** Each provider's model for each role (decision 0015); AI_MODEL_<PROVIDER>_<ROLE> overrides one. */
const roleModels: Record<Provider, Record<ModelRole, string>> = {
  anthropic: { relevance: "claude-haiku-5-5", analysis: "claude-sonnet-5-5", analysis_complex: "claude-opus-5-5", assistant: "claude-haiku-5-5" },
  openai: { relevance: "gpt-6-luna", analysis: "gpt-6.1-sol", analysis_complex: "gpt-6-astra", assistant: "gpt-6-luna" },
};

/** One provider's model for a role: AI_MODEL_<PROVIDER>_<ROLE>, or its default. */
function modelOf(provider: string, role: ModelRole): string {
  const own = process.env[`AI_MODEL_${provider.toUpperCase()}_${role.toUpperCase()}`];
  return own || (provider in roleModels ? roleModels[provider as Provider][role] : "");
}

/** Which provider and model answer a call, and the backup provider, if any. */
export function modelFor(role: ModelRole = "analysis") {
  const provider = process.env.AI_PRIMARY || "anthropic";
  const backupProvider = process.env.AI_BACKUP;
  return {
    provider,
    model: modelOf(provider, role),
    backup: backupProvider && backupProvider !== provider ? { provider: backupProvider, model: modelOf(backupProvider, role) } : null,
  };
}

export async function generateObject<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const { provider, model, backup } = modelFor(request.role);
  const started = Date.now();
  const log = (entry: { provider?: string; model: string; status: "ok" | "error"; failureCode?: string; replayed?: boolean } & Partial<Usage>) =>
    db
      .insert(aiCall)
      .values({
        talentId: request.trace.talentId ?? null,
        personId: request.trace.personId ?? null,
        messageId: request.trace.messageId ?? null,
        task: request.trace.task,
        flags: request.trace.flags?.length ? request.trace.flags : null,
        provider,
        promptVersion: request.trace.promptVersion,
        latencyMs: Date.now() - started,
        ...entry,
      })
      .catch((e) => console.error("ai_call log", e)); // logging never breaks an analysis

  const replay = replayMode();
  const key = replay !== "off" ? recordingKey(request, provider, model) : "";
  if (replay !== "off") {
    const recorded = await readRecording<T>(key, request.schema);
    if (recorded) {
      await log({ model: recorded.modelVersion, status: "ok", replayed: true });
      return recorded;
    }
    if (replay === "only") {
      await log({ model: "replay", status: "error", failureCode: "replay_missing" });
      throw new ModelError("replay_missing", `No recording ${key} (AI_REPLAY=only); record it with AI_REPLAY=record`);
    }
  }
  const attempt = async (p: string, m: string) => {
    try {
      const result = await callProvider(p, request, m);
      await log({ provider: p, model: result.modelVersion, status: "ok", inputTokens: result.inputTokens, outputTokens: result.outputTokens });
      return result;
    } catch (e) {
      await log({ provider: p, model: m || p, status: "error", failureCode: e instanceof ModelError ? e.code : "unexpected" });
      throw e;
    }
  };
  let result: ProviderResult<T>;
  try {
    result = await attempt(provider, model);
  } catch (e) {
    // The backup only when the primary can't answer at all: a bad answer is a quality problem, not an outage.
    const down = e instanceof ModelError && (e.code === "unreachable" || e.code === "busy" || e.code === "rate_limited");
    if (!down || !backup) throw e;
    console.error("model: primary unavailable, using the backup", provider, (e as ModelError).code);
    result = await attempt(backup.provider, backup.model);
  }
  if (replay === "record") await writeRecording(key, result);
  return { object: result.object, modelVersion: result.modelVersion };
}

/** A free-text answer: one string field, so it gets the structured path's backup, recordings, and logging unchanged. */
const textAnswer = z.object({ answer: z.string() });
export type TextRequest = Omit<StructuredRequest<unknown>, "schema" | "attachments">;

/** A model's answer in its own words (the assistant, decision 0023); nothing in it is acted on. */
export async function generateText(request: TextRequest): Promise<{ text: string; modelVersion: string }> {
  const { object, modelVersion } = await generateObject({ ...request, schema: textAnswer });
  return { text: object.answer, modelVersion };
}

function callProvider<T>(provider: string, request: StructuredRequest<T>, model: string): Promise<ProviderResult<T>> {
  switch (provider) {
    case "anthropic":
      return anthropic(request, model);
    case "openai":
      return openai(request, model);
    default:
      return Promise.reject(new ModelError("not_configured", `AI provider "${provider}" isn't wired up`));
  }
}

// Recorded answers (docs/decisions/0008): AI_REPLAY=record reuses a recording
// when the same request was seen before and records new ones; AI_REPLAY=only
// never calls a model. Never in production.
function replayMode(): "off" | "record" | "only" {
  if (process.env.NODE_ENV === "production") return "off";
  const mode = process.env.AI_REPLAY;
  return mode === "record" || mode === "only" ? mode : "off";
}

// The same provider and model, prompt version, message, files, and schema give
// the same key, so an eval run on another model never replays this one's
// answers. The system prompt is left out because it carries today's date.
function recordingKey(request: StructuredRequest<unknown>, provider: string, model: string) {
  const hash = createHash("sha256");
  hash.update(`${provider}:${model}\n`);
  hash.update(request.trace.promptVersion);
  hash.update(request.prompt);
  hash.update(JSON.stringify(z.toJSONSchema(request.schema)));
  for (const a of request.attachments ?? []) hash.update(createHash("sha256").update(a.data).digest());
  return hash.digest("hex").slice(0, 32);
}

const recordingsDir = () => path.resolve(process.env.AI_RECORDINGS_DIR || ".ai-recordings");

async function readRecording<T>(key: string, schema: z.ZodType<T>): Promise<StructuredResult<T> | null> {
  try {
    const saved = JSON.parse(await readFile(path.join(recordingsDir(), `${key}.json`), "utf8")) as { object: unknown; modelVersion: string };
    const parsed = schema.safeParse(saved.object);
    return parsed.success ? { object: parsed.data, modelVersion: saved.modelVersion } : null; // a stale shape is re-recorded
  } catch {
    return null;
  }
}

async function writeRecording(key: string, result: StructuredResult<unknown>) {
  await mkdir(recordingsDir(), { recursive: true });
  await writeFile(
    path.join(recordingsDir(), `${key}.json`),
    JSON.stringify({ object: result.object, modelVersion: result.modelVersion, recordedAt: new Date().toISOString() }, null, 1),
  );
}

// ---------------------------------------------------------------------------
// The providers (decision 0015), through their official SDKs. Each constrains
// the answer to the schema; the answer is still checked against the zod schema
// here too.

/** The schema as JSON Schema both structured-output modes accept: no numeric bounds, closed objects. */
export function providerSchema(schema: z.ZodType): Record<string, unknown> {
  const unsupported = new Set(["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems"]);
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) if (!unsupported.has(k)) out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([p, d]) => [p, clean(d)])) : clean(v);
    if (out.type === "object") out.additionalProperties = false;
    return out;
  };
  return clean(z.toJSONSchema(schema)) as Record<string, unknown>;
}

/** Room for the answer and the model's thinking, which counts toward it. */
const maxTokens = (role: ModelRole = "analysis") => (role === "relevance" || role === "assistant" ? 4_000 : role === "analysis" ? 16_000 : 32_000);

/** What an SDK's failure means for us: an outage (the backup may answer), a bad request, or no key. */
function sdkError(provider: string, e: unknown): ModelError {
  const status = (e as { status?: number })?.status;
  const name = (e as Error)?.name ?? "";
  const detail = `${provider}: ${(e as Error)?.message?.slice(0, 300) ?? e}`;
  if (/ConnectionError|ConnectionTimeoutError/.test(name) || status === undefined) return new ModelError("unreachable", detail);
  if (status === 429) return new ModelError("rate_limited", detail);
  if (status >= 500) return new ModelError("busy", detail); // 529 is Anthropic's "overloaded"
  if (status === 401 || status === 403) return new ModelError("not_configured", detail);
  if (status === 413) return new ModelError("too_long", detail);
  return new ModelError("invalid_output", detail);
}

async function anthropic<T>({ system, prompt, schema, attachments = [], role }: StructuredRequest<T>, model: string): Promise<ProviderResult<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ModelError("not_configured", "ANTHROPIC_API_KEY isn't set");
  const client = new Anthropic({ apiKey, timeout: 180_000, maxRetries: 2 });
  // The prompt first (it names the files), then the files in order.
  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: prompt },
    ...attachments.map((a): Anthropic.ContentBlockParam => {
      const data = Buffer.from(a.data).toString("base64");
      return a.mimeType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: a.mimeType as "image/png", data } };
    }),
  ];
  let res: Anthropic.Message;
  try {
    res = await client.messages.create({
      model,
      max_tokens: maxTokens(role),
      system,
      messages: [{ role: "user", content }],
      // Structured output, and a low effort except for the hard cases (decision 0015).
      output_config: { format: { type: "json_schema", schema: providerSchema(schema) }, effort: role === "analysis_complex" ? "medium" : "low" },
    });
  } catch (e) {
    throw sdkError("Anthropic", e);
  }
  if (res.stop_reason === "refusal") throw new ModelError("blocked", "Anthropic declined to answer");
  if (res.stop_reason === "max_tokens") throw new ModelError("too_long", "Anthropic's answer ran out of room");
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return {
    object: parseAgainst(schema, text),
    modelVersion: `anthropic:${res.model}`,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

async function openai<T>({ system, prompt, schema, attachments = [], role }: StructuredRequest<T>, model: string): Promise<ProviderResult<T>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ModelError("not_configured", "OPENAI_API_KEY isn't set");
  const client = new OpenAI({ apiKey, timeout: 180_000, maxRetries: 2 });
  const files = attachments.map((a, i): OpenAI.Responses.ResponseInputContent => {
    const url = `data:${a.mimeType};base64,${Buffer.from(a.data).toString("base64")}`;
    return a.mimeType === "application/pdf" ? { type: "input_file", filename: `file-${i + 1}.pdf`, file_data: url } : { type: "input_image", image_url: url, detail: "auto" };
  });
  let res: OpenAI.Responses.Response;
  try {
    res = await client.responses.create({
      model,
      instructions: system,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...files] }],
      max_output_tokens: maxTokens(role),
      reasoning: { effort: role === "analysis_complex" ? "medium" : "low" },
      text: { format: { type: "json_schema", name: "answer", schema: providerSchema(schema), strict: true } },
    });
  } catch (e) {
    throw sdkError("OpenAI", e);
  }
  if (res.incomplete_details?.reason === "max_output_tokens") throw new ModelError("too_long", "OpenAI's answer ran out of room");
  if (res.incomplete_details?.reason === "content_filter") throw new ModelError("blocked", "OpenAI's filters blocked the answer");
  const refused = res.output.some((o) => o.type === "message" && o.content.some((c) => c.type === "refusal"));
  if (refused) throw new ModelError("blocked", "OpenAI declined to answer");
  return {
    object: parseAgainst(schema, res.output_text),
    modelVersion: `openai:${res.model}`,
    inputTokens: res.usage?.input_tokens ?? null,
    outputTokens: res.usage?.output_tokens ?? null,
  };
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
