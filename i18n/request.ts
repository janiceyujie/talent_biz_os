import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { defaultLocale, isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/messages";

/** Signed in: the person's setting. Signed out: the switch's cookie, then the browser, then the default. */
async function requestLocale(): Promise<Locale> {
  const session = await getSession();
  if (session && isLocale(session.locale)) return session.locale;
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return matchLocale((await headers()).get("accept-language")) ?? defaultLocale;
}

// An explicit locale (getTranslations({ locale })) wins: emails and the
// calendar feed speak the recipient's language, not the request's.
export default getRequestConfig(async ({ locale: explicit }) => {
  const locale = isLocale(explicit) ? explicit : await requestLocale();
  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: "Asia/Taipei", // screens format stored local dates; this only covers next-intl's own fallback
    onError(error) {
      if (process.env.NODE_ENV !== "production") console.warn(`[i18n] ${error.message}`);
    },
    getMessageFallback: ({ namespace, key }) => [namespace, key].filter(Boolean).join("."),
  };
});
