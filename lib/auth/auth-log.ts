import { eq } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { db } from "@/lib/db";
import { person } from "@/lib/db/schema";
import { log } from "@/lib/log";

// Sign-in and sign-up outcomes (decision 0026), from Better Auth's after hook.
// A failed sign-in logs the person_id when the account exists and only the
// reason when it doesn't: never the email address typed.

type AfterContext = {
  path: string;
  body?: unknown;
  context: { returned?: unknown; newSession?: { user: { id: string } } | null };
};

const methods: Record<string, string> = { "/sign-in/email": "email", "/sign-up/email": "email", "/callback/:id": "google", "/sign-in/social": "google" };

export async function logAuthOutcome(ctx: AfterContext) {
  const method = methods[ctx.path];
  if (!method) return;
  const signUp = ctx.path === "/sign-up/email";
  const session = ctx.context.newSession;
  const returned = ctx.context.returned;

  if (session) return log.info("auth.sign_in.succeeded", { person_id: session.user.id, method });
  if (!isAPIError(returned)) return; // a sign-up waiting for its confirmation email: auth.account.created logs it

  const reason = returned.statusCode === 302 ? googleError(returned) : (returned.body as { code?: string } | undefined)?.code;
  if (returned.statusCode === 302 && !reason) return; // a redirect that isn't a failure
  const email = (ctx.body as { email?: unknown } | undefined)?.email;
  const personId = !signUp && typeof email === "string" ? await personWith(email) : undefined;
  log.warn(signUp ? "auth.sign_up.failed" : "auth.sign_in.failed", { method, reason: reason ?? "unknown", person_id: personId });
}

/** Google's callback fails by redirecting with ?error=<code>. */
function googleError(e: { headers?: HeadersInit }) {
  const location = new Headers(e.headers).get("location");
  if (!location) return undefined;
  return new URL(location, "http://x").searchParams.get("error") ?? undefined;
}

async function personWith(email: string) {
  const [row] = await db.select({ id: person.id }).from(person).where(eq(person.email, email.trim().toLowerCase())).limit(1);
  return row?.id ?? null;
}
