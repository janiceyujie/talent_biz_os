"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Maximize2, Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { AssistantMascot } from "./assistant-mascot";
import { AssistantView } from "@/components/views/assistant";
import { useAssistantConversation } from "./assistant-provider";

/**
 * The assistant in a corner, beside any page: the workspace stays usable, and the conversation is the full page's.
 * The shell holds whether it's open, so the companion's bubble and the reminder pop-up wait while it is.
 */
export function AssistantDock({ open, setOpen, hidden }: { open: boolean; setOpen: (open: boolean) => void; hidden: boolean }) {
  const t = useTranslations("assistant");
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const { pending, conversationId, lines, resume, newConversation } = useAssistantConversation();
  const visible = open && !hidden;
  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };

  // Opened with nothing showing: pick up this tab's conversation, as it was before a reload.
  useEffect(() => {
    if (visible && !conversationId && !lines.length) resume();
  }, [visible, conversationId, lines.length, resume]);

  useEffect(() => {
    if (!visible) return;
    panel.current?.focus({ preventScroll: true });
    // Escape closes it, unless a dialog is open: that Escape is the dialog's.
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("dialog[open]")) {
        setOpen(false);
        launcher.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [visible, setOpen]);

  if (hidden) return null;
  return (
    <div className="assistant-dock">
      {visible && (
        <section ref={panel} id="assistant-dock-panel" className="assistant-dock-panel" role="dialog" aria-modal="false" aria-labelledby="assistant-dock-title" tabIndex={-1}>
          <div className="assistant-dock-heading">
            <h2 id="assistant-dock-title"><AssistantMascot size={32} />{t("dockTitle")}</h2>
            <div>
              <button type="button" className="assistant-dock-action" aria-label={t("history.new")} title={t("history.new")} onClick={newConversation} disabled={pending || !lines.length}>
                <Plus size={19} aria-hidden="true" />
              </button>
              <Link
                className="assistant-dock-action"
                href={conversationId ? `/assistant?c=${conversationId}` : "/assistant"}
                aria-label={t("expand")}
                title={t("expand")}
                onClick={() => setOpen(false)}
              >
                <Maximize2 size={18} aria-hidden="true" />
              </Link>
              <button type="button" className="assistant-dock-action" aria-label={t("minimize")} title={t("minimize")} onClick={close}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
          <AssistantView compact />
        </section>
      )}
      <button
        ref={launcher}
        type="button"
        className="assistant-launcher"
        aria-label={t(visible ? "minimize" : "openChat")}
        aria-expanded={visible}
        aria-controls={visible ? "assistant-dock-panel" : undefined}
        onClick={() => setOpen(!open)}
      >
        {visible ? <X size={22} aria-hidden="true" /> : <AssistantMascot thinking={pending} size={32} />}
        <span>{t("dockTitle")}</span>
        {pending && <i className="assistant-launcher-pending" aria-label={t("working")} />}
      </button>
    </div>
  );
}
