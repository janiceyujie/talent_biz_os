// Sentry in the browser, started by instrumentation-client.ts. Uncaught errors
// are reported by the SDK; an error a screen's error boundary catches, by
// reportScreenError.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from ".";

export function startClientErrors() {
  Sentry.init({
    // The release is built in by withSentryConfig (next.config.ts).
    ...sentryOptions({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, environment: process.env.NEXT_PUBLIC_DEPLOY_ENV }),
    initialScope: { tags: { service: "browser" } },
  });
}

/**
 * The error code a screen shows for an error it caught (decision 0026). One
 * thrown on the server has Next's digest, which the server logged with
 * request.failed and reported: the digest is its code. One thrown here gets a
 * new code, which reportScreenError tags its Sentry event with. Without Sentry
 * there's nothing to find it by, so no code.
 */
export function screenErrorCode(error: Error & { digest?: string }): string | undefined {
  if (error.digest) return error.digest;
  if (!Sentry.isEnabled()) return undefined;
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reports an error a screen caught, with its code. One thrown on the server was reported there. */
export function reportScreenError(error: Error & { digest?: string }, code: string | undefined) {
  if (error.digest) return;
  Sentry.captureException(error, { tags: code ? { error_code: code } : {} });
}
