// Reads the opportunity sources into the catalogue now, as the worker's daily
// opportunities.refresh does (decision 0024): for a first fill in development,
// or to see a source's changes without waiting. Running it twice changes nothing
// the sources haven't.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd()); // the same .env files the app reads, before the database connects

const { refreshOpportunities } = await import("@/lib/opportunities/refresh");
const outcomes = await refreshOpportunities();
for (const o of outcomes) console.log(`${o.source}: ${o.ok ? `${o.count} calls read` : "failed (see above)"}`);
process.exit(outcomes.every((o) => o.ok) ? 0 : 1);
