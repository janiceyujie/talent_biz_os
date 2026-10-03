"use client";

import { useTranslations } from "next-intl";

// The assistant is a Later feature (docs/architecture.md). The panel keeps the
// prototype's layout so the dashboard reads right; input stays disabled.
export function AssistantView({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("assistant");
  return (
    <section className={`assistant-panel ${compact ? "" : "assistant-expanded"}`}>
      <header>
        <div className="assistant-mark">✦</div>
        <div>
          <span>Talent Assistant</span>
          <small>{t("status")}</small>
        </div>
      </header>
      <div className="message-list" aria-live="polite">
        <p className="message">
          {t("intro")}
        </p>
      </div>
      <div className="quick-prompts">
        {[t("prompt.today"), t("prompt.tomorrow"), t("prompt.unpaid")].map((p) => (
          <button key={p} disabled>
            {p}
          </button>
        ))}
      </div>
      <form className="assistant-input" onSubmit={(e) => e.preventDefault()}>
        <input aria-label={t("input")} placeholder={t("placeholder")} disabled />
        <button aria-label={t("send")} disabled>
          ↑
        </button>
      </form>
    </section>
  );
}
