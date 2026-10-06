"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setLocale } from "@/lib/actions/locale";
import { localeNames, locales } from "@/lib/i18n/config";

/**
 * Language picker. `compact` is the top-bar version: the visible label is
 * dropped (each option names itself) but kept for screen readers. `bare` is
 * just the select, for a row that labels it (settings).
 */
export function LocaleSwitch({ className, compact = false, bare = false }: { className?: string; compact?: boolean; bare?: boolean }) {
  const t = useTranslations("locale");
  const current = useLocale();
  const [pending, startTransition] = useTransition();
  const select = (
    <select
      className={bare ? className : undefined}
      aria-label={compact || bare ? t("label") : undefined}
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
  );
  if (bare) return select;
  return (
    <label className={compact ? "language-switch" : className}>
      {compact ? <span className="sr-only">{t("label")}</span> : t("label")}
      {select}
    </label>
  );
}
