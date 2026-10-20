"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Maximize2, MessageCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AssistantView } from "@/components/views/assistant";
import { useAssistantConversation } from "./assistant-provider";

/** A non-modal conversation that stays available while navigating the workspace. */
export function AssistantDock({ hidden = false }: { hidden?: boolean }) {
  const t = useTranslations("assistant");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const { pending } = useAssistantConversation();
  const fullPage = pathname.startsWith("/assistant");
  const visible = open && !hidden && !fullPage;
  const close = () => { setOpen(false); launcher.current?.focus(); };

  useEffect(() => {
    if (!visible) return;
    panel.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("dialog[open]")) {
        setOpen(false);
        launcher.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [visible]);

  if (fullPage || hidden) return null;
  return <div className="assistant-dock" data-preview-safe="true">
    {visible && <section ref={panel} id="assistant-dock-panel" className="assistant-dock-panel" role="dialog" aria-modal="false" aria-labelledby="assistant-dock-title" tabIndex={-1}>
      <div className="assistant-dock-heading">
        <h2 id="assistant-dock-title">{t("dockTitle")}</h2>
        <div>
          <Link className="assistant-dock-action" href="/assistant" aria-label={t("expand")} title={t("expand")} onClick={() => setOpen(false)}><Maximize2 size={18} aria-hidden="true" /></Link>
          <button type="button" className="assistant-dock-action" aria-label={t("minimize")} title={t("minimize")} onClick={close}><X size={20} aria-hidden="true" /></button>
        </div>
      </div>
      <AssistantView compact />
    </section>}
    <button ref={launcher} type="button" className="assistant-launcher" aria-label={t(visible ? "minimize" : "openChat")} aria-expanded={visible} aria-controls={visible ? "assistant-dock-panel" : undefined} onClick={() => setOpen(!open)}>
      {visible ? <X size={22} aria-hidden="true" /> : <MessageCircle size={22} aria-hidden="true" />}
      <span>{t("dockTitle")}</span>
      {pending && <i className="assistant-launcher-pending" aria-label={t("working")} />}
    </button>
  </div>;
}
