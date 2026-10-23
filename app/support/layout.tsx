import type { Metadata } from "next";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { requireStaff } from "@/lib/auth/staff";
import { toLocale } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/messages";
import { loadSupportMessages, supportTranslator } from "@/lib/i18n/support-messages";
import { SupportTabs } from "@/components/support/support-tabs";
import "./support.css";

// The Support page (decision 0026): staff only, a 404 for anyone else. Its
// wording is its own catalog (messages/support/), given only to its pages.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SupportLayout({ children }: LayoutProps<"/support">) {
  const viewer = await requireStaff();
  const locale = toLocale(viewer.locale);
  const t = await supportTranslator(locale);
  return (
    // Its client components read this catalog through useSupportTranslations, typed against it,
    // plus the app's common words, for the app's own dialogs.
    <NextIntlClientProvider locale={locale} messages={{ ...(await loadSupportMessages(locale)), common: (await loadMessages(locale)).common } as AbstractIntlMessages}>
      <main className="support-page">
        <h1>{t("title")}</h1>
        <SupportTabs />
        {children}
      </main>
    </NextIntlClientProvider>
  );
}
