"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { buttonClass, FormMessage } from "@/components/form";
import { confirmAddonLink } from "@/lib/actions/addon";

export function ConfirmLink({ token }: { token: string }) {
  const t = useTranslations("addonLink");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <button type="button" className={buttonClass} disabled={pending} onClick={() => startTransition(async () => setError(await confirmAddonLink(token)))}>
        {t("link")}
      </button>
    </>
  );
}
