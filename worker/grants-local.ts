// A local grant-only worker. It cannot consume Gmail, AI, invoice or delivery jobs.
import { loadEnvConfig } from "@next/env";
async function main() {
  loadEnvConfig(process.cwd());
  const { grantsLocalEnabled } = await import("@/lib/grants/config");
  if (!grantsLocalEnabled() || process.env.GRANTS_SYNC_ENABLED !== "1") throw new Error("local_grant_sync_required");
  const { run, parseCronItems } = await import("graphile-worker");
  const { refreshGrantSources } = await import("@/lib/grants/sync");
  const { GRANT_REFRESH_CRON, GRANT_REFRESH_OPTIONS } = await import("@/lib/grants/refresh-policy");
  const runner = await run({
    connectionString:process.env.DATABASE_URL,
    concurrency:1,
    taskList:{"grants.refresh":async()=>{if((await refreshGrantSources()).some(result=>!result.ok))throw new Error("grant_source_refresh_failed");}},
    parsedCronItems:parseCronItems([{task:"grants.refresh",match:GRANT_REFRESH_CRON,options:GRANT_REFRESH_OPTIONS}]),
  });
  console.log("Local grant-only worker ready: daily at 00:00 UTC. Manual refresh is served by the web app.");
  await runner.promise;
}
main().catch(error=>{console.error("grant-only worker",error);process.exit(1);});
