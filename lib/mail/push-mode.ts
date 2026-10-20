import { appEnv } from "@/lib/app-env";

// How the worker hears about new mail (decision 0013): Gmail's push through
// Pub/Sub, or a 2-minute poll. Push is required in production, so a deploy
// missing a setting fails at startup instead of quietly polling; development
// may poll, so a laptop runs without Google Cloud. Half set up is a mistake
// anywhere. Pure, no server-only imports: the worker checks it at startup.

export const PUSH_SETTINGS = ["PUBSUB_TOPIC", "PUBSUB_SUBSCRIPTION", "GCP_PUBSUB_CREDENTIALS"] as const;

/** "push" or "polling" for this environment; throws, naming what's missing, when it can't run as set. */
export function pushMode(env: Record<string, string | undefined> = process.env): "push" | "polling" {
  const missing = PUSH_SETTINGS.filter((name) => !env[name]);
  if (!missing.length) return "push";
  if (appEnv(env) === "production" || missing.length < PUSH_SETTINGS.length) {
    throw new Error(`Gmail push isn't fully set up: set ${missing.join(", ")} on the worker (docs/setup/gmail.md, Push)`);
  }
  return "polling";
}
