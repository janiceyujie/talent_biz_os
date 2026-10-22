"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AssistantAnswer } from "@/lib/assistant/answers";
import type { Question, SavedLine } from "@/lib/assistant/content";
import type { ConversationSummary } from "@/lib/assistant/conversations";
import type { ProjectSummary } from "@/lib/types";
import { useAppData } from "./app-data";

export type { Question };
/** Why an answer didn't come, as the server says (app/api/assistant/messages/route.ts). */
export type AskError = "busy" | "month_limit" | "day_limit" | "unavailable" | "paused" | "not_found" | "failed";

/**
 * A question is kept as asked and an answer as data, so quick prompts and code-worked answers
 * show in the language of the moment. Saved lines come from the server; a question that failed
 * stays only here, with why, so it can be asked again.
 */
export type ConversationLine = SavedLine | { id: string; role: "user"; question: Question; error: AskError };

type Held = { talentId: string; conversationId: string | null; lines: ConversationLine[]; readOnly: boolean; projectId: string };
const fresh = (talentId: string): Held => ({ talentId, conversationId: null, lines: [], readOnly: false, projectId: "" });

const PICKER_LIMIT = 200; // the scope picker's projects: the most recently updated, as the list endpoint pages them
// The corner panel picks up this tab's conversation after a reload: a per-tab convenience, not where it's kept.
const TAB_KEY = "talent-biz-os.assistant-conversation";
const remember = (value: { talentId: string; id: string } | null) => {
  try {
    if (value) sessionStorage.setItem(TAB_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(TAB_KEY);
  } catch {
    // storage unavailable (private window): a reload starts a new conversation
  }
};
const remembered = (talentId: string) => {
  try {
    const value = JSON.parse(sessionStorage.getItem(TAB_KEY) || "null") as { talentId?: string; id?: string } | null;
    return value?.talentId === talentId && typeof value.id === "string" ? value.id : null;
  } catch {
    return null;
  }
};

function useConversation() {
  const talentId = useAppData().talent.id;
  const [held, setHeld] = useState<Held>(() => fresh(talentId));
  // Switching talent starts a new conversation.
  const current = held.talentId === talentId ? held : fresh(talentId);
  const update = useCallback(
    (change: Partial<Held> | ((old: Held) => Partial<Held>)) =>
      setHeld((h) => {
        const old = h.talentId === talentId ? h : fresh(talentId);
        return { ...old, ...(typeof change === "function" ? change(old) : change), talentId };
      }),
    [talentId],
  );
  const [pending, setPending] = useState(false);
  const [monthLeft, setMonthLeft] = useState<number | null>(null);
  const [list, setList] = useState<{ talentId: string; items: ConversationSummary[]; nextCursor: string | null } | null>(null);
  const [projects, setProjects] = useState<{ talentId: string; items: ProjectSummary[]; more: boolean } | null>(null);
  const sending = useRef(false); // set at once, before the re-render: a double click sends once
  const nextLocalId = useRef(0);

  // The scope picker's projects, fetched once per talent when a view first shows, rather than taken from the layout (decision 0011).
  const [projectsWanted, setProjectsWanted] = useState(false);
  const loadProjects = useCallback(() => setProjectsWanted(true), []); // stable: views call it from an effect
  useEffect(() => {
    if (!projectsWanted || projects?.talentId === talentId) return;
    const controller = new AbortController();
    fetch(`/api/projects?${new URLSearchParams({ view: "all", sort: "updated", limit: String(PICKER_LIMIT) })}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((page: { items: ProjectSummary[]; total: number }) => setProjects({ talentId, items: page.items, more: page.total > page.items.length }))
      .catch(() => {}); // the picker stays on the overview; asking still works
    return () => controller.abort();
  }, [projectsWanted, projects?.talentId, talentId]);

  /** The saved conversations, a page at a time; with no cursor, the first page again. */
  const loadList = useCallback(
    async (cursor?: string) => {
      const res = await fetch(`/api/assistant/conversations?${new URLSearchParams(cursor ? { cursor } : {})}`);
      if (!res.ok) return;
      const page = (await res.json()) as { items: ConversationSummary[]; nextCursor: string | null };
      setList((old) => ({
        talentId,
        items: cursor && old?.talentId === talentId ? [...old.items, ...page.items.filter((i) => !old.items.some((o) => o.id === i.id))] : page.items,
        nextCursor: page.nextCursor,
      }));
    },
    [talentId],
  );
  const listShown = list?.talentId === talentId ? list : null;

  const newConversation = useCallback(() => {
    update({ conversationId: null, lines: [], readOnly: false });
    remember(null);
  }, [update]);

  /** Opens a saved conversation; one that can't be read any more starts a new one instead. */
  const open = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/assistant/conversations/${id}`);
      if (!res.ok) {
        newConversation();
        return false;
      }
      const c = (await res.json()) as ConversationSummary & { lines: SavedLine[] };
      update({ conversationId: c.id, lines: c.lines, readOnly: c.readOnly });
      remember(c.readOnly ? null : { talentId, id: c.id });
      return true;
    },
    [update, newConversation, talentId],
  );

  /** The corner panel's pick-up: this tab's last conversation, when nothing is open yet. */
  const resume = useCallback(() => {
    const id = remembered(talentId);
    if (id) void open(id);
  }, [open, talentId]);

  async function ask(question: Question) {
    if (sending.current || current.readOnly) return false;
    sending.current = true;
    setPending(true);
    const localId = `local-${nextLocalId.current++}`;
    // Asking again after a failure replaces the failed question rather than repeating it.
    update((old) => ({ lines: [...old.lines.filter((l) => !("error" in l)), { id: localId, role: "user", question, at: new Date().toISOString() }] }));
    const fail = (error: AskError) => update((old) => ({ lines: old.lines.map((l) => (l.id === localId ? { id: localId, role: "user", question, error } : l)) }));
    try {
      const res = await fetch("/api/assistant/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...question, ...(current.conversationId ? { conversationId: current.conversationId } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { conversationId?: string; answer?: AssistantAnswer; error?: AskError; monthLeft?: number };
      if (!res.ok || !data.answer || !data.conversationId) {
        fail(data.error && data.error !== "failed" ? data.error : "failed");
        return false;
      }
      if (typeof data.monthLeft === "number") setMonthLeft(data.monthLeft);
      const id = data.conversationId;
      update((old) => ({
        conversationId: id,
        lines: [...old.lines, { id: `local-${nextLocalId.current++}`, role: "assistant", answer: data.answer!, at: new Date().toISOString() }],
      }));
      remember({ talentId, id });
      if (listShown) void loadList(); // the list's order changed
      return true;
    } catch {
      fail("failed");
      return false;
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  /** Deletes a saved conversation for good; the open one gives way to a new one. */
  async function remove(id: string) {
    const res = await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) return false;
    if (current.conversationId === id) newConversation();
    setList((old) => (old ? { ...old, items: old.items.filter((i) => i.id !== id) } : old));
    return true;
  }

  return {
    conversationId: current.conversationId,
    lines: current.lines,
    readOnly: current.readOnly,
    projectId: current.projectId,
    setProjectId: (projectId: string) => update({ projectId }),
    projects: projects?.talentId === talentId ? projects : null,
    loadProjects,
    list: listShown,
    loadList,
    open,
    resume,
    newConversation,
    remove,
    monthLeft,
    pending,
    ask,
  };
}

const ConversationContext = createContext<ReturnType<typeof useConversation> | null>(null);

/** One conversation shared by the floating panel and the full page, kept while moving between pages. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const conversation = useConversation();
  return <ConversationContext.Provider value={conversation}>{children}</ConversationContext.Provider>;
}

export function useAssistantConversation() {
  const conversation = useContext(ConversationContext);
  if (!conversation) throw new Error("AssistantProvider is required");
  return conversation;
}
