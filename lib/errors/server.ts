// Sentry on the web server, started by instrumentation.ts. Errors Next catches
// (a page, a route, a server action) arrive through its onRequestError; errors
// the app catches and logs with log.error, through lib/log.
import * as Sentry from "@sentry/nextjs";
import { setErrorReporter } from "@/lib/log";
import { errorReporter, sentryOptions } from ".";

Sentry.init({
  ...sentryOptions({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, environment: process.env.DEPLOY_ENV, release: process.env.RENDER_GIT_COMMIT }),
  initialScope: { tags: { service: "web" } },
});
setErrorReporter(errorReporter(Sentry));
