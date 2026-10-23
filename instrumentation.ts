// Runs once as the web server starts: error reporting (lib/errors). proxy.ts and
// every route run on Node, so there is no Edge setup; Next still builds this file
// for Edge, so lib/errors is imported only on Node.
import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./lib/errors/server");
}

/** Errors Next catches in a page, a route, a server action, or the proxy: logged, and so reported. */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logRequestError } = await import("./lib/errors/request");
  await logRequestError(...args);
};
