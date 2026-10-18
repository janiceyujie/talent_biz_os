import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import { db } from "@/lib/db";
import { appEnv } from "@/lib/app-env";
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
//   For development and tests (AI_PROVIDER is read when AI_PRIMARY isn't set):
//   gemini     Google's Gemini API; GEMINI_API_KEY, AI_MODEL: one model or a fallback list
//              tried in order when one is busy. On the free tier Google may keep and use
//              what's sent (AI_PROVIDER_KEEPS_DATA).
//   ollama     a free local model through Ollama, offline; AI_MODEL (default qwen3:8b),
//              OLLAMA_URL (default http://127.0.0.1:11434). The same model for every role.
//
// Content from a connected mailbox (its relevance check, and the analysis of
// what's brought in) can run on another provider in development,
// AI_MAILBOX_PROVIDER and AI_MAILBOX_MODEL, e.g. a local model while paste and
// upload use Gemini. It never goes to a provider that may keep it
// (AI_PROVIDER_KEEPS_DATA) unless AI_FREE_TIER_OK=1, which is refused in
// production (docs/decisions/0015).
//
// Every call is logged in ai_call, and can be served from a recording
// (AI_REPLAY) so tests don't spend quota. See docs/decisions/0006 and 0008.

/** A file the model reads alongside the prompt: an image or a PDF, in order. */
export type Attachment = { mimeType: string; data: Uint8Array };

/** What a call is for and whom, for the ai_call log and usage limits. */
export type CallTrace = {
  task: "extract" | "relevance" | "payment_notice" | "eval";
  promptVersion: string;
  talentId?: string | null;
  personId?: string | null;
  messageId?: string | null;
};

/**
 * What a call is for (decision 0015): relevance (score one email, the small
 * model), analysis (a message, the mid-size model), analysis_complex
 * (contracts, PDFs, long or unclear messages, the large model; lib/ai/extract.ts routes).
 */
export type ModelRole = "analysis" | "analysis_complex" | "relevance";

export type StructuredRequest<T> = {
  role?: ModelRole; // default analysis
  fromMailbox?: boolean; // content read from a connected mailbox: the free-tier rule applies
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

const defaultModels: Record<string, string> = { gemini: "gemini-3.5-flash-lite,gemini-3.1-flash-lite", ollama: "qwen3:8b" };

/** The paid providers' model for each role (decision 0015); AI_MODEL_<PROVIDER>_<ROLE> overrides one. */
const roleModels: Record<"anthropic" | "openai", Record<ModelRole, string>> = {
  anthropic: { relevance: "claude-haiku-5-5", analysis: "claude-sonnet-5-5", analysis_complex: "claude-opus-5-5" },
  openai: { relevance: "gpt-6-luna", analysis: "gpt-6.1-sol", analysis_complex: "gpt-6-astra" },
};

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

/** One provider's models for a role: its own per role, or the one configured for every role. */
function modelsOf(provider: string, role: ModelRole): string[] {
  if (provider === "anthropic" || provider === "openai")
    return list(process.env[`AI_MODEL_${provider.toUpperCase()}_${role.toUpperCase()}`] || roleModels[provider][role]);
  return list(process.env.AI_MODEL || defaultModels[provider]);
}

/**
 * Which provider and models answer a call (one model, or a list tried in
 * order when one is busy), and the backup provider, if any. The relevance
 * check only ever reads mailbox content.
 */
export function modelFor(role: ModelRole = "analysis", fromMailbox = role === "relevance") {
  const own = fromMailbox || role === "relevance" ? process.env.AI_MAILBOX_PROVIDER : undefined;
  if (own) {
    const configured = list(process.env.AI_MAILBOX_MODEL);
    return { provider: own, models: configured.length ? configured : modelsOf(own, role), backup: null };
  }
  const provider = process.env.AI_PRIMARY || process.env.AI_PROVIDER || "ollama";
  const backupProvider = process.env.AI_BACKUP;
  return {
    provider,
    models: modelsOf(provider, role),
    backup: backupProvider && backupProvider !== provider ? { provider: backupProvider, models: modelsOf(backupProvider, role) } : null,
  };
}

/** A provider that may keep and use what it's sent: Gemini's free tier, when AI_PROVIDER_KEEPS_DATA=1. */
export const keepsData = (provider: string) => provider === "gemini" && process.env.AI_PROVIDER_KEEPS_DATA === "1";

/** Everyone whose mail this deployment reads has accepted a free tier's terms. Never in production. */
export function freeTierOk() {
  if (process.env.AI_FREE_TIER_OK !== "1") return false;
  if (appEnv(process.env) === "production") throw new Error("AI_FREE_TIER_OK=1 isn't allowed with APP_ENV=production");
  return true;
}

export async function generateObject<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const { provider, models, backup } = modelFor(request.role, request.fromMailbox);
  const started = Date.now();
  const log = (entry: { provider?: string; model: string; status: "ok" | "error"; failureCode?: string; replayed?: boolean } & Partial<Usage>) =>
    db
      .insert(aiCall)
      .values({
        talentId: request.trace.talentId ?? null,
        personId: request.trace.personId ?? null,
        messageId: request.trace.messageId ?? null,
        task: request.trace.task,
        provider,
        promptVersion: request.trace.promptVersion,
        latencyMs: Date.now() - started,
        ...entry,
      })
      .catch((e) => console.error("ai_call log", e)); // logging never breaks an analysis

  if (request.fromMailbox && keepsData(provider) && !freeTierOk()) {
    await log({ model: models.join(","), status: "error", failureCode: "not_configured" });
    throw new ModelError("not_configured", `Mailbox content isn't sent to ${provider}, which may keep it, unless AI_FREE_TIER_OK=1`);
  }

  const replay = replayMode();
  const key = replay !== "off" ? recordingKey(request, provider, models) : "";
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
  const attempt = async (p: string, m: string[]) => {
    try {
      const result = await callProvider(p, request, m);
      await log({ provider: p, model: result.modelVersion, status: "ok", inputTokens: result.inputTokens, outputTokens: result.outputTokens });
      return result;
    } catch (e) {
      await log({ provider: p, model: m.join(",") || p, status: "error", failureCode: e instanceof ModelError ? e.code : "unexpected" });
      throw e;
    }
  };
  let result: ProviderResult<T>;
  try {
    result = await attempt(provider, models);
  } catch (e) {
    // The backup only when the primary can't answer at all: a bad answer is a quality problem, not an outage.
    const down = e instanceof ModelError && (e.code === "unreachable" || e.code === "busy" || e.code === "rate_limited");
    if (!down || !backup || (request.fromMailbox && keepsData(backup.provider) && !freeTierOk())) throw e;
    console.error("model: primary unavailable, using the backup", provider, (e as ModelError).code);
    result = await attempt(backup.provider, backup.models);
  }
  if (replay === "record") await writeRecording(key, result);
  return { object: result.object, modelVersion: result.modelVersion };
}

function callProvider<T>(provider: string, request: StructuredRequest<T>, models: string[]): Promise<ProviderResult<T>> {
  switch (provider) {
    case "anthropic":
      return anthropic(request, models[0]);
    case "openai":
      return openai(request, models[0]);
    case "gemini":
      return gemini(request, models);
    case "ollama":
      return ollama(request, models[0] ?? "qwen3:8b");
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
function recordingKey(request: StructuredRequest<unknown>, provider: string, models: string[]) {
  const hash = createHash("sha256");
  hash.update(`${provider}:${models.join(",")}\n`);
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

const capabilities = new Map<string, Promise<string[]>>();
/** What a local model can do (Ollama's /api/show), asked once per model. */
function ollamaCapabilities(model: string) {
  const url = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  if (!capabilities.has(model))
    capabilities.set(
      model,
      fetch(`${url}/api/show`, { method: "POST", body: JSON.stringify({ model }), signal: AbortSignal.timeout(10_000) })
        .then((r) => (r.ok ? r.json() : {}))
        .then((b: { capabilities?: string[] }) => b.capabilities ?? [])
        .catch(() => {
          capabilities.delete(model); // try again next time
          return [];
        }),
    );
  return capabilities.get(model)!;
}

async function ollama<T>({ system, prompt, schema, attachments = [] }: StructuredRequest<T>, model: string): Promise<ProviderResult<T>> {
  // Ollama takes images, for vision models only, and never PDFs. A model without vision
  // ignores images without saying so: refuse instead, so nobody trusts an analysis that never saw them.
  if (attachments.some((a) => !a.mimeType.startsWith("image/"))) throw new ModelError("unsupported_file", "The local model can't read PDFs");
  if (attachments.length && !(await ollamaCapabilities(model)).includes("vision"))
    throw new ModelError("unsupported_file", `The local model ${model} can't read images`);
  const images = attachments.map((a) => Buffer.from(a.data).toString("base64"));
  const url = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  return oneAtATime(async () => {
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
    const body = (await response.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
    return {
      object: parseAgainst(schema, body.message?.content ?? ""),
      modelVersion: `ollama:${model}`,
      inputTokens: body.prompt_eval_count ?? null,
      outputTokens: body.eval_count ?? null,
    };
  });
}

// A local model answers one request at a time and queues the rest; a request
// waiting there would use up its own timeout behind the others. The worker's
// jobs (scoring, payment notices, analyses) run side by side, so they take
// turns here instead, and the timeout counts only the request being answered.
let ollamaTurn: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(call: () => Promise<T>): Promise<T> {
  const turn = ollamaTurn.then(call, call);
  ollamaTurn = turn.catch(() => undefined);
  return turn;
}

// ---------------------------------------------------------------------------
// The paid providers (decision 0015), through their official SDKs. Each
// constrains the answer to the schema; the answer is still checked against the
// zod schema here, like every provider's.

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
const maxTokens = (role: ModelRole = "analysis") => (role === "relevance" ? 4_000 : role === "analysis" ? 16_000 : 32_000);

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

async function gemini<T>(request: StructuredRequest<T>, models: string[]): Promise<ProviderResult<T>> {
  const { schema } = request;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ModelError("not_configured", "GEMINI_API_KEY isn't set");
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
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
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
  const usage = body.usageMetadata;
  return {
    object: parseAgainst(schema, text),
    modelVersion: `gemini:${body.modelVersion ?? model}`,
    inputTokens: usage?.promptTokenCount ?? null,
    outputTokens: usage ? (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) : null,
  };
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
