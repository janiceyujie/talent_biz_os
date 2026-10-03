import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { authAccount, authSession, authVerification, person } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { defaultLocale, isLocale, LOCALE_COOKIE, matchLocale } from "@/lib/i18n/config";

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
    : undefined;

export const isGoogleEnabled = google !== undefined;

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
  account: { modelName: "authAccount", fields: { userId: "personId" } },
  verification: { modelName: "authVerification" },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "重設 Talent Biz OS 密碼",
        text: `請點擊以下連結重設密碼（1 小時內有效）：\n\n${url}\n\n如果你沒有要求重設密碼，請忽略這封信。`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true, // signing in unverified re-sends the link
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "確認你的 Talent Biz OS 電子郵件",
        text: `請點擊以下連結確認你的電子郵件（1 小時內有效）：\n\n${url}`,
      });
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
