"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setLocale } from "@/lib/actions/locale";
import { localeNames, locales } from "@/lib/i18n/config";

export function LocaleSwitch({ className }: { className?: string }) {
  const t = useTranslations("locale");
  const current = useLocale();
  const [pending, startTransition] = useTransition();
  return (
    <label className={className}>
      {t("label")}
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(() => setLocale(next));
        }}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
