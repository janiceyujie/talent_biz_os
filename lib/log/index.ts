// Structured logs (decision 0026): one JSON object per line on stdout, which
// Render keeps. A line is an event name and fields from an allowlist: ids,
// codes, statuses, counts, and durations. Any other field fails the type check,
// and each value is checked again as it's written: an id that doesn't look like
// an id, or a code that doesn't look like a code, is replaced with "[invalid]".
// So message content, email addresses, and URLs can't reach a log, even by a cast.
//
// Errors are reduced to name, code, and HTTP status, never their message: a
// library's message can echo content (a Google error quoting an event title).
// When debugging needs the content, the ids lead to it in the database.
//
// An error line also goes to the error tracker, once lib/errors has set it up.

const idFields = [
  "talent_id",
  "person_id",
  "connection_id",
  "message_id",
  "decision_id",
  "project_id",
  "job_id",
  "ai_call_id",
  "request_id",
  "page_id",
  "opportunity_id",
] as const;
/** Short machine values: a job name, a route pattern, an outcome, a provider, an error code. */
const codeFields = ["job", "route", "outcome", "reason", "source", "provider", "mode", "method"] as const;
const numberFields = ["attempt", "status", "duration_ms", "count", "skipped_count", "failed_count", "deleted_count", "usd", "limit", "port"] as const;

type IdField = (typeof idFields)[number];
type CodeField = (typeof codeFields)[number];
type NumberField = (typeof numberFields)[number];

export type LogFields = { [K in IdField]?: string | null } & { [K in CodeField]?: string } & { [K in NumberField]?: number } & {
  /** Any thrown value: logged as its name, code, and status only. */
  error?: unknown;
};

export type Level = "debug" | "info" | "warn" | "error";
export type Service = "web" | "worker";

const ID = /^[A-Za-z0-9_-]{1,64}$/; // uuids, Graphile's numeric job ids, Google's ids
const CODE = /^[A-Za-z0-9_.:/[\]-]{1,80}$/; // "mail.sync", "/api/inbox/[id]", "rateLimitExceeded", "57P01"
const EVENT = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/; // dotted, <area>.<what>
const INVALID = "[invalid]";

const idOrInvalid = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : INVALID);
const codeOrInvalid = (v: unknown) => (typeof v === "string" && CODE.test(v) ? v : INVALID);

/** A thrown value as name, code, and HTTP status: never its message. */
export function errorFields(e: unknown) {
  if (typeof e !== "object" || e === null) return { name: typeof e };
  const o = e as { name?: unknown; code?: unknown; reason?: unknown; status?: unknown; statusCode?: unknown };
  const code = o.code ?? o.reason; // GmailError and Google's APIs carry a reason; Postgres and ours a code
  const status = o.status ?? o.statusCode;
  // A subclass that doesn't set its name still says "Error": its class name says more.
  const name = typeof o.name === "string" && o.name !== "Error" ? o.name : (e.constructor?.name ?? o.name);
  return {
    name: codeOrInvalid(name),
    ...(code !== undefined && { code: typeof code === "number" ? code : codeOrInvalid(code) }),
    ...(typeof status === "number" && { status }),
  };
}

/** Builds one line. Exported for the tests; code calls `log`. */
export function logLine(level: Level, event: string, fields: LogFields, base: { ts: string; service: Service; env: string; release: string }) {
  const line: Record<string, unknown> = { ts: base.ts, level, service: base.service, env: base.env, release: base.release, event: EVENT.test(event) ? event : INVALID };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if ((idFields as readonly string[]).includes(key)) line[key] = value === null ? null : idOrInvalid(value);
    else if ((codeFields as readonly string[]).includes(key)) line[key] = codeOrInvalid(value);
    else if ((numberFields as readonly string[]).includes(key)) line[key] = typeof value === "number" && Number.isFinite(value) ? value : INVALID;
    else if (key === "error") line.error = errorFields(value);
    // Anything else is dropped: only the allowlist is written.
  }
  return line;
}

let service: Service = "web";
/** The worker calls this once at startup; everything else is the web service. */
export function setLogService(s: Service) {
  service = s;
}

type Reporter = (error: unknown, line: Record<string, unknown>) => void;
let reporter: Reporter | undefined;
/** lib/errors calls this when the tracker starts: each error line is reported with its fields. */
export function setErrorReporter(r: Reporter) {
  reporter = r;
}

const production = () => process.env.NODE_ENV === "production";

function write(level: Level, event: string, fields: LogFields = {}) {
  if (level === "debug" && production()) return;
  const line = logLine(level, event, fields, {
    ts: new Date().toISOString(),
    service,
    env: process.env.DEPLOY_ENV || "development",
    release: process.env.RENDER_GIT_COMMIT?.slice(0, 12) || "local",
  });
  if (level === "error" && reporter) {
    try {
      reporter(fields.error, line);
    } catch {
      // Reporting never stops the line being written.
    }
  }
  if (production()) {
    (level === "error" || level === "warn" ? process.stderr : process.stdout).write(`${JSON.stringify(line)}\n`);
    return;
  }
  // On a laptop, a line a person can read: level, event, then the fields.
  const pairs = Object.entries(line)
    .filter(([k]) => !["ts", "level", "service", "env", "release", "event"].includes(k))
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`);
  (level === "error" || level === "warn" ? console.error : console.log)(`[${line.service}] ${level} ${line.event}`, ...pairs);
}

export const log = {
  /** Off in production. */
  debug: (event: string, fields?: LogFields) => write("debug", event, fields),
  /** One line per request or job. */
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  /** Handled, but not normal. */
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  /** Needs attention. */
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};
