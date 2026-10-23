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

/** An error a screen caught. One thrown on the server has a digest: the server reported it already. */
export function reportScreenError(error: Error & { digest?: string }) {
  if (error.digest) return;
  Sentry.captureException(error);
}
