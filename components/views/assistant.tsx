"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAssistantConversation, type Question } from "@/components/app/assistant-provider";
import { AssistantMascot } from "@/components/app/assistant-mascot";
import { assistantIntents, promptKeys, QUESTION_MAX } from "@/lib/assistant/answers";
import { AnswerView } from "./assistant-answer";

/**
 * The assistant (decision 0023): quick prompts answered from the person's own records, and questions
 * in their own words answered by the model from the workspace or one project, with the conversation's
 * last turns. Every answered question is saved to the conversation.
 */
export function AssistantView({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("assistant");
  const tEyebrow = useTranslations("eyebrow");
  const { lines, pending, ask, readOnly, projectId, setProjectId, projects, loadProjects, monthLeft } = useAssistantConversation();
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const noteId = useId();
  const scopeId = useId();
  const asked = (q: Question) => ("intent" in q ? t(`prompt.${promptKeys[q.intent]}`) : q.text);
  const off = pending || readOnly;

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
          <AssistantMascot size={48} />
          <div>
            <span>{tEyebrow("talentAssistant")}</span>
            <small>{t("status")}</small>
          </div>
        </header>
      )}
      <div className="message-list" role="log" aria-label={t("conversation")} aria-live="polite" aria-busy={pending}>
        {!lines.length && <p className="message">{t("intro")}</p>}
        {lines.map((line) =>
          "unreadable" in line ? (
            <div key={line.id} className={`message ${line.role === "user" ? "user" : ""}`} role="group">
              <p className="muted">{t("unreadable")}</p>
            </div>
          ) : line.role === "user" ? (
            <div key={line.id} className="message user" role="group" aria-label={t("you")}>
              <p>{asked(line.question)}</p>
              {"error" in line && (
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
            <AssistantMascot thinking size={32} />
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
          <button type="button" key={intent} disabled={off} onClick={() => void ask({ intent })}>
            {t(`prompt.${promptKeys[intent]}`)}
          </button>
        ))}
      </div>
      <div className="assistant-scope">
        <label htmlFor={scopeId}>{t("scope")}</label>
        <select id={scopeId} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={off}>
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
          readOnly={off}
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
        <button aria-label={t("send")} disabled={off || !draft.trim()}>
          ↑
        </button>
      </form>
      <small id={noteId} className="assistant-notice">
        {readOnly ? t("readOnly") : t("note")}
        {!readOnly && monthLeft !== null && ` ${t("monthLeft", { count: monthLeft })}`}
      </small>
    </section>
  );
}
