"use client";

import { useState } from "react";
import { useSupportTranslations } from "@/lib/i18n/use-support-translations";

/**
 * An id as its first 8 characters; a click copies the whole of it, which Sentry's
 * search needs (Render's matches the 8). Works on a phone, where there's no hover.
 */
export function CopyableId({ id }: { id: string }) {
  const t = useSupportTranslations("support");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="support-id support-copy-id"
      title={`${id}: ${t("account.copyId")}`}
      onClick={() =>
        void navigator.clipboard.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? t("errorCode.copied") : id.slice(0, 8)}
    </button>
  );
}
