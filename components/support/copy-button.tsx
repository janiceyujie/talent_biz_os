"use client";

import { useSupportTranslations } from "@/lib/i18n/use-support-translations";
import { useState } from "react";

/** Copies a code or id, for pasting into Render's log search. */
export function CopyButton({ text }: { text: string }) {
  const t = useSupportTranslations("support.errorCode");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="secondary"
      onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
      onBlur={() => setCopied(false)}
    >
      {copied ? t("copied") : t("copy")}
    </button>
  );
}
