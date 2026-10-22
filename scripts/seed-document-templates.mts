import nextEnv from "@next/env";
import { assertLocalTemplateStore } from "../lib/templates/local-store";
nextEnv.loadEnvConfig(process.cwd());
assertLocalTemplateStore(process.env.DATABASE_URL, process.env.STORAGE_S3_ENDPOINT);
await import("./publish-templates.mjs");
