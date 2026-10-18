import { appEnv } from "@/lib/app-env";
/** The experiment cannot write or schedule against a hosted database. */
export function grantsLocalEnabled(env: Record<string,string|undefined> = process.env) {
  try {
    return env.NODE_ENV !== "production" && env.GRANTS_LOCAL_ENABLED === "1" && appEnv(env) === "development" && ["localhost","127.0.0.1","[::1]"].includes(new URL(env.DATABASE_URL || "").hostname);
  } catch { return false; }
}
