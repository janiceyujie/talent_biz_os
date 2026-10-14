/** Local manager pilot only; billing and production rollout need a separate review. */
export function managerLocalEnabled(env: Record<string,string|undefined> = process.env) {
  try { return env.NODE_ENV !== "production" && env.APP_ENV === "development" && env.MANAGER_LOCAL_ENABLED === "1" && ["localhost","127.0.0.1","[::1]"].includes(new URL(env.DATABASE_URL||"").hostname); }
  catch { return false; }
}
