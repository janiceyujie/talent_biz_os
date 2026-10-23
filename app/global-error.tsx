"use client";

import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState } from "react";
import { ErrorPanel } from "@/components/app/error-panel";
import { defaultLocale, isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/messages";
import "./globals.css";
import "./experience.css";

/**
 * What shows when the root layout itself fails (app/layout.tsx): it replaces the
 * whole document, so it brings its own <html>, styles, and messages. Without the
 * layout there's no session to read the language from: the language switch's
 * cookie, then the browser's. The catalogs are loaded only when this shows; it's
 * rare, and they're too large to ship with every page.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [intl, setIntl] = useState<{ locale: Locale; messages: Awaited<ReturnType<typeof loadMessages>> }>();
  useEffect(() => {
    const locale = browserLocale();
    void loadMessages(locale).then((messages) => setIntl({ locale, messages }));
  }, []);
  return (
    <html lang={intl?.locale ?? defaultLocale}>
      <body>
        {intl && (
          <NextIntlClientProvider locale={intl.locale} messages={intl.messages}>
            <main className="padded">
              <ErrorPanel error={error} retry={retry} />
            </main>
          </NextIntlClientProvider>
        )}
      </body>
    </html>
  );
}

function browserLocale(): Locale {
  const cookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  if (cookie && isLocale(decodeURIComponent(cookie))) return decodeURIComponent(cookie) as Locale;
  return matchLocale(navigator.languages.join(",")) ?? defaultLocale;
}
