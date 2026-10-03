import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /* config options here */
};

// Loads the request config from i18n/request.ts.
export default createNextIntlPlugin()(nextConfig);
