"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAppData } from "@/components/app/app-data";
import { useAssistantConversation, type Question } from "@/components/app/assistant-provider";
import { RoleAvatar } from "@/components/role/role-portrait";
import { assistantIntents, QUESTION_MAX, type AssistantIntent } from "@/lib/assistant/answers";
import { AnswerView } from "./assistant-answer";

const promptKey = { today: "today", tomorrow: "tomorrow", receivable: "unpaid", payable: "payable" } as const satisfies Record<AssistantIntent, string>;

/**
 * The assistant (decision 0023): quick prompts answered from the person's own records, and questions
 * in their own words answered by the model from the workspace or one project. Each question stands
 * on its own until conversations are saved.
 */
export function AssistantView({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("assistant");
  const tEyebrow = useTranslations("eyebrow");
  const { person } = useAppData();
  const { lines, pending, ask, projectId, setProjectId, projects, loadProjects, monthLeft } = useAssistantConversation();
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const noteId = useId();
  const scopeId = useId();
  const asked = (q: Question) => ("intent" in q ? t(`prompt.${promptKey[q.intent]}`) : q.text);

  useEffect(loadProjects, [loadProjects]); // the scope picker's projects, once per talent

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" }); // braces: newer browsers return a promise here, which React would take for a cleanup
  }, [lines, pending]);

  const send = async () => {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    // A failed question goes back in the box, so nothing typed is lost.
    if (!(await ask({ text, ...(projectId ? { projectId } : {}) }))) setDraft((current) => current || text);
    field.current?.focus();
  };

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
              <p>{asked(line.question)}</p>
              {line.error && (
                <small className="assistant-error">
                  {t(`error.${line.error}`)}{" "}
                  {(line.error === "failed" || line.error === "unavailable" || line.error === "busy") && (
                    <button type="button" className="text-button" disabled={pending} onClick={() => void ask(line.question)}>
                      {t("retry")}
                    </button>
                  )}
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
          <button type="button" key={intent} disabled={pending} onClick={() => void ask({ intent })}>
            {t(`prompt.${promptKey[intent]}`)}
          </button>
        ))}
      </div>
      <div className="assistant-scope">
        <label htmlFor={scopeId}>{t("scope")}</label>
        <select id={scopeId} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={pending}>
          <option value="">{t("scopeOverview")}</option>
          {(projects?.items ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
          {/* Chosen before the list arrived, or beyond it: keep it selectable. */}
          {projectId && !projects?.items.some((p) => p.id === projectId) && <option value={projectId}>{t("scopeProject")}</option>}
        </select>
        {projects?.more && <small>{t("scopeRecent")}</small>}
      </div>
      <form
        className="assistant-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={field}
          rows={compact ? 1 : 2}
          value={draft}
          maxLength={QUESTION_MAX}
          readOnly={pending}
          aria-label={t("input")}
          aria-describedby={noteId}
          placeholder={t("placeholder")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a new line; Enter while composing (Chinese input) only picks the characters.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button aria-label={t("send")} disabled={pending || !draft.trim()}>
          ↑
        </button>
      </form>
      <small id={noteId} className="assistant-notice">
        {t("note")}
        {monthLeft !== null && ` ${t("monthLeft", { count: monthLeft })}`}
      </small>
    </section>
  );
}
