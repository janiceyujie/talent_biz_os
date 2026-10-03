import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { authAccount, authSession, authVerification, person } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { defaultLocale, isLocale, LOCALE_COOKIE, matchLocale, toLocale } from "@/lib/i18n/config";

const realGoogle =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account" as const, // let people pick which Google account, not silently reuse one
        // Sign-in goes through Google's redirect only; we don't accept bare ID tokens (no One Tap).
        disableIdTokenSignIn: true,
      }
    : undefined;

/**
 * Tests can't drive real Google. With no real keys, outside production, and
 * GOOGLE_TEST_STUB=1, a stand-in "google" provider accepts unsigned ID tokens
 * posted to /api/auth/sign-in/social and /api/auth/link-social, so the same
 * linking rules run against made-up Google identities. Never active otherwise.
 */
const testGoogle =
  !realGoogle && process.env.NODE_ENV !== "production" && process.env.GOOGLE_TEST_STUB === "1"
    ? {
        clientId: "test-stub",
        clientSecret: "test-stub",
        verifyIdToken: async (token: string) => {
          const [header] = token.split(".");
          return JSON.parse(Buffer.from(header, "base64url").toString()).alg === "none";
        },
      }
    : undefined;

const google = realGoogle ?? testGoogle;

/** Whether to show "Continue with Google" — real Google only. */
export const isGoogleEnabled = realGoogle !== undefined;

/** Emails go out in the recipient's saved language, whatever browser asked for them. */
async function emailText(user: object) {
  const locale = toLocale("locale" in user ? user.locale : undefined);
  return getTranslations({ locale, namespace: "emails" });
}

function signupLocale(headers: Headers | undefined) {
  const cookie = headers
    ?.get("cookie")
    ?.split(";")
    .map((c) => c.trim().split("="))
    .find(([name]) => name === LOCALE_COOKIE)?.[1];
  if (isLocale(cookie)) return cookie;
  return matchLocale(headers?.get("accept-language")) ?? defaultLocale;
}

// Better Auth's models map onto our tables: `user` is `person`, and its
// `userId` foreign keys are `personId`. See lib/db/schema.ts.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { person, authSession, authAccount, authVerification },
  }),
  advanced: { database: { generateId: "uuid" } },
  user: {
    modelName: "person",
    fields: { name: "displayName" },
    additionalFields: {
      accountType: { type: "string", required: false, input: false, defaultValue: "individual" },
      locale: { type: "string", required: false, input: false, defaultValue: defaultLocale },
    },
  },
  session: { modelName: "authSession", fields: { userId: "personId" } },
  account: {
    modelName: "authAccount",
    fields: { userId: "personId" },
    // docs/decisions/0001: a first Google sign-in links to an existing person
    // only when both Google and we have verified the email (Better Auth's
    // defaults, kept explicit). A different email links only from settings
    // while signed in. The last sign-in method can't be removed.
    accountLinking: {
      enabled: true,
      requireLocalEmailVerified: true,
      allowDifferentEmails: true, // applies to the signed-in "connect Google" link only
      allowUnlinkingAll: false,
    },
  },
  verification: { modelName: "authVerification" },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const t = await emailText(user);
      await sendEmail({ to: user.email, subject: t("resetSubject"), text: t("resetBody", { url }) });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true, // signing in unverified re-sends the link
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const t = await emailText(user);
      await sendEmail({ to: user.email, subject: t("verifySubject"), text: t("verifyBody", { url }) });
    },
  },
  socialProviders: google ? { google } : {},

  databaseHooks: {
    user: {
      create: {
        // A new account takes the language its sign-up page was showing.
        before: async (user, context) => ({ data: { ...user, locale: signupLocale(context?.headers) } }),
      },
    },
  },

  plugins: [nextCookies()], // must stay last
});
