"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import type { AssistantAnswer, AssistantIntent } from "@/lib/assistant/answers";
import { useAppData } from "./app-data";

/**
 * A question is kept as its intent and an answer as data, so both are shown
 * in the language of the moment. The conversation lives in this tab for now,
 * for the talent being worked on: switching talent starts a new one. Saved
 * conversations come later (decision 0023).
 */
export type ConversationLine =
  | { id: number; role: "user"; intent: AssistantIntent; failed?: boolean }
  | { id: number; role: "assistant"; answer: AssistantAnswer };

function useConversation() {
  const talentId = useAppData().talent.id;
  const [held, setHeld] = useState<{ talentId: string; lines: ConversationLine[] }>({ talentId, lines: [] });
  const lines = held.talentId === talentId ? held.lines : [];
  const setLines = (update: (old: ConversationLine[]) => ConversationLine[]) =>
    setHeld((h) => ({ talentId, lines: update(h.talentId === talentId ? h.lines : []) }));
  const [pending, setPending] = useState(false);
  const sending = useRef(false); // set at once, before the re-render: a double click sends once
  const nextId = useRef(0);

  async function ask(intent: AssistantIntent) {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    const id = nextId.current++;
    // Asking again after a failure replaces the failed question rather than repeating it.
    setLines((old) => [...old.filter((l) => !(l.role === "user" && l.failed)), { id, role: "user", intent }]);
    try {
      const res = await fetch("/api/assistant/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      if (!res.ok) throw new Error(`assistant ${res.status}`);
      const { answer } = (await res.json()) as { answer: AssistantAnswer };
      setLines((old) => [...old, { id: nextId.current++, role: "assistant", answer }]);
    } catch {
      setLines((old) => old.map((l) => (l.id === id && l.role === "user" ? { ...l, failed: true } : l)));
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return { lines, pending, ask };
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
