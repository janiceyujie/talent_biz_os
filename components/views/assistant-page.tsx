"use client";

import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAssistantConversation } from "@/components/app/assistant-provider";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import type { ConversationSummary } from "@/lib/assistant/conversations";
import { AssistantView } from "./assistant";

/**
 * The Assistant page: saved conversations beside the open one. The open conversation is in the
 * address (?c=), so a reload, Back, or a bookmark opens it again; without one, it's a new conversation.
 */
export function AssistantPage() {
  const { conversationId, open, newConversation } = useAssistantConversation();
  const router = useRouter();
  const pathname = usePathname();
  const asked = useSearchParams().get("c");
  // The address leads: only a change in it opens or clears a conversation, so the moment between a
  // first answer and the address catching up doesn't start a new one.
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (seen.current === asked) return;
    seen.current = asked;
    if (asked && asked !== conversationId) void open(asked);
    if (!asked && conversationId) newConversation();
  }, [asked, conversationId, open, newConversation]);
  // A conversation started here gets its address.
  useEffect(() => {
    if (conversationId && conversationId !== seen.current) {
      seen.current = conversationId;
      router.replace(`${pathname}?c=${conversationId}`, { scroll: false });
    }
  }, [conversationId, pathname, router]);

  return (
    <div className="assistant-page">
      <ConversationList />
      <AssistantView />
    </div>
  );
}

function ConversationList() {
  const t = useTranslations("assistant.history");
  const locale = useLocale();
  const router = useRouter();
  const { list, loadList, conversationId, remove } = useAssistantConversation();
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => void loadList(), [loadList]);
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return (
    <nav className="assistant-history" aria-label={t("title")}>
      <button type="button" className="secondary assistant-new" onClick={() => router.push("/assistant")}>
        <Plus size={16} aria-hidden="true" /> {t("new")}
      </button>
      <h2>{t("title")}</h2>
      {list && !list.items.length && <p className="muted">{t("empty")}</p>}
      <ul>
        {list?.items.map((c) => (
          <li key={c.id} className={c.id === conversationId ? "active" : ""}>
            <button type="button" className="assistant-history-open" aria-current={c.id === conversationId ? "true" : undefined} onClick={() => router.push(`/assistant?c=${c.id}`)}>
              <span>{c.title}</span>
              <small>
                {when(c.updatedAt)}
                {c.readOnly && ` · ${t("readOnly")}`}
              </small>
            </button>
            <button type="button" className="assistant-history-delete" aria-label={t("delete", { title: c.title })} title={t("delete", { title: c.title })} onClick={() => setDeleting(c)}>
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {list?.nextCursor && (
        <button type="button" className="text-button" onClick={() => void loadList(list.nextCursor!)}>
          {t("more")}
        </button>
      )}
      {deleting && (
        <ConfirmDialog
          title={t("deleteTitle")}
          confirmLabel={t("deleteConfirm")}
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setPending(true);
            const wasOpen = deleting.id === conversationId;
            await remove(deleting.id);
            setPending(false);
            setDeleting(null);
            if (wasOpen) router.replace("/assistant");
          }}
        >
          <p>{t("deleteBody", { title: deleting.title })}</p>
        </ConfirmDialog>
      )}
    </nav>
  );
}
