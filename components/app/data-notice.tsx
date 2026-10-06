"use client";

import { useTranslations } from "next-intl";
import { useAppData } from "@/components/app/app-data";

/**
 * What happens to what's sent in, when the AI provider in use may keep it
 * (AI_PROVIDER_KEEPS_DATA, e.g. a free tier). States the facts and leaves the
 * choice to the person, with a caution only for data that's dangerous if it
 * leaks — passwords, codes, ID and account numbers.
 */
export function DataNotice() {
  const service = useAppData().aiDataNotice;
  const t = useTranslations("inbox");
  if (!service) return null;
  return (
    <p className="notice data-notice" role="note">
      {t("dataNotice", { service })}
    </p>
  );
}
