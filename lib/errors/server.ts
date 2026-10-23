// Sentry on the web server, started by instrumentation.ts. Errors Next catches
// (a page, a route, a server action) arrive through its onRequestError
// (./request.ts); errors the app catches and logs with log.error, through lib/log.
import * as Sentry from "@sentry/nextjs";
import { setErrorReporter, setLogContext, setRequestIdentifier } from "@/lib/log";
import { errorReporter, sentryOptions } from ".";

Sentry.init({
  ...sentryOptions({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, environment: process.env.DEPLOY_ENV, release: process.env.RENDER_GIT_COMMIT }),
  initialScope: { tags: { service: "web" } },
});
setErrorReporter(errorReporter(Sentry));

// A request's id is its trace id: Next starts a trace for each request and the SDK
// carries it through everything the request runs, with or without a DSN. Sentry's
// events carry the same id, so a log line and an event for one request match.
//
// Who's asking (lib/auth) is kept as tags on the request's isolation scope, which
// the SDK forks for each request: its events carry them, and so does every line.
setRequestIdentifier((ids) => Sentry.getIsolationScope().setTags(ids));
setLogContext(() => {
  const span = Sentry.getActiveSpan();
  if (!span) return {};
  const { person_id, talent_id } = Sentry.getIsolationScope().getScopeData().tags;
  return {
    request_id: span.spanContext().traceId,
    ...(typeof person_id === "string" && { person_id }),
    ...(typeof talent_id === "string" && { talent_id }),
  };
});
