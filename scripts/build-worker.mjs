// Bundles the worker and the migration script into dist/ for the deployed image
// (Dockerfile), so it runs them with plain node instead of tsx. Our own code is
// bundled; packages stay in node_modules. Locally, `npm run worker` and
// `npm run db:migrate` still run the TypeScript directly.
import { build } from "esbuild";

// Plain node resolves ES modules strictly: `next/headers` must be written
// `next/headers.js`. next-intl (reached through lib/auth/config.ts) leaves the
// extension off, which tsx and Next's bundler forgive and node doesn't. So
// next-intl is bundled, and its imports of next's modules get the extension.
const packages = {
  name: "packages",
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, ({ path }) => {
      if (path.startsWith("@/")) return; // ours, through tsconfig paths
      if (/^next-intl(\/|$)/.test(path)) return; // bundled
      if (/^next\/[\w/-]+$/.test(path)) return { path: `${path}.js`, external: true };
      return { path, external: true };
    });
  },
};

const common = {
  bundle: true,
  plugins: [packages],
  platform: "node",
  target: "node26",
  // As under tsx: the app's modules import "server-only", which resolves only under react-server.
  conditions: ["react-server"],
  sourcemap: true,
  logLevel: "warning",
};

// The worker as CommonJS: its packages are a mix of CommonJS, whose named exports
// an ES module can't always import (`loadEnvConfig` from @next/env), and ES
// modules, which node can require.
await build({ ...common, entryPoints: ["worker/index.ts"], outfile: "dist/worker.cjs", format: "cjs" });

// The migration script uses top-level await, so it stays an ES module.
await build({ ...common, entryPoints: ["scripts/migrate.mts"], outfile: "dist/migrate.mjs", format: "esm" });
