"use client";

import { useSupportTranslations } from "@/lib/i18n/use-support-translations";
import { useState } from "react";
import { codeIn, errorCodeQuery, renderLogs, sentryIssues, type SearchTargets } from "@/lib/support/links";
import { CopyButton } from "./copy-button";

/**
 * Turns the error code from someone's screen into links: Render's logs, where
 * request.failed has it as `digest`, and Sentry, where its event is tagged with
 * it (lib/errors). The person and time narrow it down (decision 0026).
 */
export function ErrorCodeLookup({ targets }: { targets: SearchTargets }) {
  const t = useSupportTranslations("support.errorCode");
  const [pasted, setPasted] = useState("");
  const code = codeIn(pasted);
  return (
    <div className="support-stack">
      <label>
        {t("label")}
        <input value={pasted} onChange={(e) => setPasted(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <p className="muted">{t("help")}</p>
      {pasted && !code && <p className="notice">{t("notACode")}</p>}
      {code && (
        <>
          <div className="support-row">
            <span className="support-id">{t("code", { code })}</span>
            <CopyButton text={code} />
          </div>
          <SearchLinks sentryQuery={errorCodeQuery(code)} targets={targets} renderHelp={t("renderHelp")} />
        </>
      )}
    </div>
  );
}

/**
 * Links to Render's logs and to a search in Sentry. Render's can't carry the
 * search (./links.ts), so renderHelp says what to paste; it shows only with a
 * Render link. Settings that aren't there (on a laptop, say) are one line.
 */
export function SearchLinks({ sentryQuery, targets, renderHelp }: { sentryQuery: string; targets: SearchTargets; renderHelp: string }) {
  const t = useSupportTranslations("support.errorCode");
  const missing = [!targets.renderWeb && "RENDER_SERVICE_ID", !targets.renderWorker && "RENDER_WORKER_SERVICE_ID", !targets.sentryOrg && "SENTRY_ORG"].filter(Boolean);
  return (
    <div className="support-stack">
      <div className="support-row">
        {targets.renderWeb && (
          <a className="secondary" href={renderLogs("web", targets.renderWeb)} target="_blank" rel="noreferrer">
            {t("renderWeb")}
          </a>
        )}
        {targets.renderWorker && (
          <a className="secondary" href={renderLogs("pserv", targets.renderWorker)} target="_blank" rel="noreferrer">
            {t("renderWorker")}
          </a>
        )}
        {targets.sentryOrg && (
          <a className="secondary" href={sentryIssues(targets.sentryOrg, sentryQuery)} target="_blank" rel="noreferrer">
            {t("sentry")}
          </a>
        )}
      </div>
      {(targets.renderWeb || targets.renderWorker) && <p className="muted">{renderHelp}</p>}
      {missing.length > 0 && <p className="muted">{t("notSet", { names: missing.join(", ") })}</p>}
    </div>
  );
}
