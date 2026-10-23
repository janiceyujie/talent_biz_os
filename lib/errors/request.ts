import type { Instrumentation } from "next";
import { log } from "@/lib/log";

// One line for each request that fails (decision 0026): Next calls onRequestError
// (instrumentation.ts) for an error in a page, a route, a server action, or the
// proxy. Successful requests aren't logged here: Render's request logs list every
// request, on a Pro workspace, and rndr_id finds this one among them.
//
// The line is an error, so it also goes to Sentry with its fields as tags. The
// path isn't logged: its query string can carry a search or an OAuth code.

export const logRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const rndrId = request.headers["rndr-id"];
  log.error("request.failed", {
    route: context.routePath,
    method: request.method,
    source: context.routeType, // render, route, action, or proxy
    digest: (error as { digest?: unknown } | null)?.digest as string | undefined,
    rndr_id: typeof rndrId === "string" ? rndrId : undefined,
    error,
  });
};
