import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Source maps for Sentry (lib/errors). With SENTRY_AUTH_TOKEN, which only the deployed
// build has (Dockerfile), the browser's and the server's are uploaded after the build
// and then deleted, so none is served or shipped. Without it the browser's aren't made.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

const nextConfig: NextConfig = {
  // A second dev server (end-to-end tests with a fake Google) needs its own build folder;
  // unset everywhere else.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  productionBrowserSourceMaps: uploadSourceMaps,
};

// next-intl loads the request config from i18n/request.ts.
export default withSentryConfig(createNextIntlPlugin()(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // The deployed commit, as on log lines: set at runtime on the server, built in for the browser.
  release: { name: process.env.RENDER_GIT_COMMIT },
  sourcemaps: { disable: !uploadSourceMaps, deleteSourcemapsAfterUpload: true },
  // Sentry's usage data about our builds: not sent.
  telemetry: false,
  // Its navigation hook is for performance tracing, which lib/errors leaves off.
  suppressOnRouterTransitionStartWarning: true,
  silent: !uploadSourceMaps,
});
