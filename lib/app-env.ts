// Which environment this is (docs/design/gmail-ingestion.md, Configuration):
// development, testing, or production. It gates what may only run on a
// laptop, such as the .env mailbox key. Unset, it follows NODE_ENV, so a
// production build never counts as development by accident.

export const appEnvs = ["development", "testing", "production"] as const;
export type AppEnv = (typeof appEnvs)[number];

export function appEnv(env: Record<string, string | undefined> = process.env): AppEnv {
  const value = env.APP_ENV;
  if (value) {
    if ((appEnvs as readonly string[]).includes(value)) return value as AppEnv;
    throw new Error(`APP_ENV must be one of ${appEnvs.join(", ")}`);
  }
  return env.NODE_ENV === "production" ? "production" : "development";
}
