import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // A second dev server (end-to-end tests with a fake Google) needs its own build folder;
  // unset everywhere else.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

// Loads the request config from i18n/request.ts.
export default createNextIntlPlugin()(nextConfig);
