"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAppData } from "@/components/app/app-data";
import { useAssistantConversation } from "@/components/app/assistant-provider";
import { RoleAvatar } from "@/components/role/role-portrait";
import { assistantIntents, type AssistantIntent } from "@/lib/assistant/answers";
import { AnswerView } from "./assistant-answer";

const promptKey = { today: "today", tomorrow: "tomorrow", receivable: "unpaid", payable: "payable" } as const satisfies Record<AssistantIntent, string>;

/**
 * The assistant (decision 0023): the quick prompts, answered from the person's own
 * records. Typing a question of your own comes with the model; until then the box is off.
 */
export function AssistantView({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("assistant");
  const tEyebrow = useTranslations("eyebrow");
  const { person } = useAppData();
  const { lines, pending, ask } = useAssistantConversation();
  const end = useRef<HTMLDivElement>(null);
  const noteId = useId();
  const prompt = (intent: AssistantIntent) => t(`prompt.${promptKey[intent]}`);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" }); // braces: newer browsers return a promise here, which React would take for a cleanup
  }, [lines, pending]);

  return (
    <section className={`assistant-panel ${compact ? "" : "assistant-expanded"}`}>
      {!compact && (
        <header>
          <RoleAvatar role={person.role} appearance={person.appearance} />
          <div>
            <span>{tEyebrow("talentAssistant")}</span>
            <small>{t("status")}</small>
          </div>
        </header>
      )}
      <div className="message-list" role="log" aria-label={t("conversation")} aria-live="polite" aria-busy={pending}>
        {!lines.length && <p className="message">{t("intro")}</p>}
        {lines.map((line) =>
          line.role === "user" ? (
            <div key={line.id} className="message user" role="group" aria-label={t("you")}>
              <p>{prompt(line.intent)}</p>
              {line.failed && (
                <small className="assistant-error">
                  {t("failed")}{" "}
                  <button type="button" className="text-button" disabled={pending} onClick={() => void ask(line.intent)}>
                    {t("retry")}
                  </button>
                </small>
              )}
            </div>
          ) : (
            <div key={line.id} className="message assistant-answer" role="group" aria-label={tEyebrow("talentAssistant")}>
              <AnswerView answer={line.answer} />
            </div>
          ),
        )}
        {pending && (
          <div className="message assistant-pending" role="status">
            <p>
              {t("working")}
              <span className="assistant-typing" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </p>
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="quick-prompts">
        {assistantIntents.map((intent) => (
          <button type="button" key={intent} disabled={pending} onClick={() => void ask(intent)}>
            {prompt(intent)}
          </button>
        ))}
      </div>
      <form className="assistant-input" onSubmit={(e) => e.preventDefault()}>
        <input aria-label={t("input")} aria-describedby={noteId} placeholder={t("placeholder")} disabled />
        <button aria-label={t("send")} disabled>
          ↑
        </button>
      </form>
      <small id={noteId} className="assistant-notice">
        {t("comingSoon")}
      </small>
    </section>
  );
}
