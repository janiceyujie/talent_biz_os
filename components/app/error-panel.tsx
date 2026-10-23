"use client";

import { useTranslations } from "next-intl";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect, useState } from "react";
import { reportScreenError, screenErrorCode } from "@/lib/errors/client";

/**
 * What a screen shows when something throws (app/(app)/error.tsx, and
 * app/global-error.tsx when the root layout itself fails). The common case is
 * a tab left open across a deploy (or a dev-server restart): its buttons call
 * server actions the new server doesn't have, and reloading fixes it. Any
 * other error is reported (lib/errors) and shows its error code, which support
 * looks up.
 */
export function ErrorPanel({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errorPage");
  const stale = unstable_isUnrecognizedActionError(error);
  const [code] = useState(() => (stale ? undefined : screenErrorCode(error)));
  // The code is for pasting to support: a button, since picking out digits on a phone is fiddly.
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (stale) return; // normal after a deploy: not reported
    console.error(error);
    reportScreenError(error, code);
  }, [error, stale, code]);
  return (
    <section className="surface padded error-page" role="alert">
      <h2>{stale ? t("staleTitle") : t("title")}</h2>
      <p>{stale ? t("staleBody") : t("body")}</p>
      {code && (
        <p className="muted error-code">
          {t("code", { code })}{" "}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              void navigator.clipboard.writeText(code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? t("copied") : t("copyCode")}
          </button>
        </p>
      )}
      <div className="row-actions">
        <button className="primary" onClick={() => window.location.reload()}>
          {t("reload")}
        </button>
        {!stale && (
          <button className="secondary" onClick={() => retry()}>
            {t("retry")}
          </button>
        )}
      </div>
    </section>
  );
}
