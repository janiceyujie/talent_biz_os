"use client";

import { useTranslations } from "next-intl";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect } from "react";
import { reportScreenError } from "@/lib/errors/client";

/**
 * What a screen shows when something throws. The common case is a tab left
 * open across a deploy (or a dev-server restart): its buttons call server
 * actions the new server doesn't have, and reloading fixes it. Any other
 * error is reported (lib/errors).
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errorPage");
  const stale = unstable_isUnrecognizedActionError(error);
  useEffect(() => {
    if (stale) return; // normal after a deploy: not reported
    console.error(error);
    reportScreenError(error);
  }, [error, stale]);
  return (
    <section className="surface padded error-page" role="alert">
      <h2>{stale ? t("staleTitle") : t("title")}</h2>
      <p>{stale ? t("staleBody") : t("body")}</p>
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
