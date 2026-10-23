import * as Sentry from "@sentry/node";
import { setErrorReporter } from "@/lib/log";
import { errorReporter, sentryOptions } from "@/lib/errors";

// Sentry in the worker (lib/errors): each log.error line, such as job.failed, is
// reported with its ids. Graphile retries a job before it fails, so a retry isn't one.

export function startErrors() {
  Sentry.init({
    ...sentryOptions({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, environment: process.env.DEPLOY_ENV, release: process.env.RENDER_GIT_COMMIT }),
    initialScope: { tags: { service: "worker" } },
  });
  setErrorReporter(errorReporter(Sentry));
}

/** Sends what's waiting before the process exits. */
export const flushErrors = () => Sentry.flush(2000);
