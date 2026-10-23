"use client";

import { createTranslator, useLocale, useMessages, type NamespaceKeys, type NestedKeyOf } from "next-intl";
import { useMemo } from "react";
import type supportMessages from "@/messages/support/en.json";

type SupportMessages = typeof supportMessages;

/**
 * useTranslations for the Support page's client components. Its catalog isn't the
 * app's (lib/i18n/support-messages.ts), so the keys are typed against it here; the
 * Support layout's provider holds only that catalog.
 */
export function useSupportTranslations<N extends NamespaceKeys<SupportMessages, NestedKeyOf<SupportMessages>>>(namespace: N) {
  const locale = useLocale();
  const messages = useMessages() as unknown as SupportMessages;
  return useMemo(() => createTranslator({ locale, messages, namespace }), [locale, messages, namespace]);
}
