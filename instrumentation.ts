// Runs once as the web server starts: error reporting (lib/errors). proxy.ts and
// every route run on Node, so there is no Edge setup.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./lib/errors/server");
}

/** Errors Next catches in a page, a route, or a server action. */
export const onRequestError = Sentry.captureRequestError;
