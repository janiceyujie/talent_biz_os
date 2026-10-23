// Error reporting (decision 0026): Sentry, on the web server (./server.ts), in the
// browser (./client.ts), and in the worker (worker/errors.ts). What an event keeps
// before it leaves is decided here, for all three, so a change of tracker starts in
// this folder.
//
// An event keeps the error's type, its code and HTTP status, the stack trace, and
// ids; never its message, which can echo a customer's mail (a Google error quoting
// an event title). The request, the user, breadcrumbs, and extra data are dropped:
// each can carry content, a cookie, or an OAuth code in a URL. The same rules as
// lib/log, applied to whatever the SDK collected.

import type { ErrorEvent, EventHint } from "@sentry/node";
import { errorFields } from "@/lib/log";

const REMOVED = "[removed]";
const SAFE = /^[A-Za-z0-9_.:/[\]-]{1,80}$/; // an id or a code, as lib/log checks them
const EVENT = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/; // a lib/log event name

/** Contexts that describe the machine, not the person: the rest are dropped. */
const keptContexts = ["os", "runtime", "app", "device", "culture", "cloud_resource", "trace"];

/** Settings every Sentry SDK here starts with. Off without a DSN: locally, and in CI. */
export function sentryOptions(o: { dsn: string | undefined; environment: string | undefined; release?: string }) {
  return {
    dsn: o.dsn,
    enabled: Boolean(o.dsn),
    environment: o.environment || "development",
    release: o.release,
    // No IP address, cookies, or request bodies.
    sendDefaultPii: false,
    // Breadcrumbs record clicks, console output, and URLs; any of them can carry content.
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    beforeSend: scrubEvent,
    // Errors only: no performance tracing, whose spans carry URLs.
    beforeSendTransaction: () => null,
  };
}

/** What leaves for Sentry: an allowlist of the event's parts, each checked. */
export function scrubEvent(event: ErrorEvent, hint?: EventHint): ErrorEvent {
  const values = event.exception?.values ?? [];
  const top = values.length - 1; // Sentry lists an error's causes first and the error itself last
  const fields = hint?.originalException !== undefined ? errorFields(hint.originalException) : undefined;
  const exception = values.map((ex, i) => ({
    // A subclass that doesn't set its name says "Error"; errorFields names it by its class.
    type: i === top && fields ? fields.name : ex.type && SAFE.test(ex.type) ? ex.type : "Error",
    value: i === top && fields ? describe(fields) : REMOVED,
    module: ex.module,
    thread_id: ex.thread_id,
    mechanism: ex.mechanism && { ...ex.mechanism, data: undefined },
    stacktrace: ex.stacktrace && {
      ...ex.stacktrace,
      // A frame's local variables can hold anything. Its lines of source are left for
      // Sentry to fill in from the uploaded source maps, rather than read off the disk.
      frames: ex.stacktrace.frames?.map((frame) => ({ ...frame, vars: undefined, pre_context: undefined, context_line: undefined, post_context: undefined })),
    },
  }));

  const contexts: ErrorEvent["contexts"] = {};
  for (const key of keptContexts) if (event.contexts?.[key]) contexts[key] = event.contexts[key];
  // Next's request context: the route pattern, not the path, which can hold a query.
  const nextjs = event.contexts?.nextjs as { router_path?: unknown; route_type?: unknown; router_kind?: unknown } | undefined;
  if (nextjs) contexts.nextjs = { router_path: nextjs.router_path, route_type: nextjs.route_type, router_kind: nextjs.router_kind };

  const tags: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(event.tags ?? {}))
    if (typeof value === "number" || (typeof value === "string" && SAFE.test(value))) tags[key] = value;

  return {
    type: event.type,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    logger: event.logger,
    environment: event.environment,
    release: event.release,
    dist: event.dist,
    sdk: event.sdk,
    server_name: event.server_name,
    fingerprint: event.fingerprint,
    // The route, without a query string or fragment.
    transaction: event.transaction?.split(/[?#]/)[0],
    // Only lib/log's event names: any other message is free text.
    message: event.message && EVENT.test(event.message) ? event.message : undefined,
    exception: values.length ? { values: exception } : undefined,
    contexts,
    tags,
    // Matches the stack to the uploaded source maps.
    debug_meta: event.debug_meta,
  };
}

function describe(f: ReturnType<typeof errorFields>) {
  const parts = [f.name, "code" in f && `code=${f.code}`, "status" in f && `status=${f.status}`].filter(Boolean);
  return parts.join(" ");
}

type Sdk = {
  captureException: (e: unknown, hint: { tags: Record<string, string | number> }) => unknown;
  captureMessage: (m: string, hint: { level: "error"; tags: Record<string, string | number> }) => unknown;
};

/** Reports lib/log's error lines: the error, or the event name when there's none, with the line's ids. */
export function errorReporter(sdk: Sdk) {
  return (error: unknown, line: Record<string, unknown>) => {
    // The line's event and ids; the SDK sets the environment, release, and service itself.
    const tags: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(line))
      if (!["ts", "level", "service", "env", "release", "error"].includes(key) && (typeof value === "string" || typeof value === "number")) tags[key] = value;
    if (error !== undefined) sdk.captureException(error, { tags });
    else sdk.captureMessage(String(line.event), { level: "error", tags });
  };
}
