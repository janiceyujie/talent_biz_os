"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AssistantAnswer, AssistantIntent } from "@/lib/assistant/answers";
import type { ProjectSummary } from "@/lib/types";
import { useAppData } from "./app-data";

/** What the person asked: a quick prompt's intent, or their own words about the workspace or one project. */
export type Question = { intent: AssistantIntent } | { text: string; projectId?: string };
/** Why an answer didn't come, as the server says (app/api/assistant/messages/route.ts). */
export type AskError = "busy" | "month_limit" | "day_limit" | "unavailable" | "not_found" | "failed";

/**
 * A question is kept as asked and an answer as data, so quick prompts and code-worked answers
 * show in the language of the moment. The conversation lives in this tab for now, for the talent
 * being worked on: switching talent starts a new one. Saved conversations come later (decision 0023).
 */
export type ConversationLine =
  | { id: number; role: "user"; question: Question; error?: AskError }
  | { id: number; role: "assistant"; answer: AssistantAnswer };

const PICKER_LIMIT = 200; // the scope picker's projects: the most recently updated, as the list endpoint pages them

function useConversation() {
  const talentId = useAppData().talent.id;
  const [held, setHeld] = useState<{ talentId: string; lines: ConversationLine[]; projectId: string }>({ talentId, lines: [], projectId: "" });
  const current = held.talentId === talentId ? held : { talentId, lines: [], projectId: "" };
  const update = (change: Partial<Omit<typeof held, "talentId">> | ((old: typeof current) => Partial<Omit<typeof held, "talentId">>)) =>
    setHeld((h) => {
      const old = h.talentId === talentId ? h : { talentId, lines: [], projectId: "" };
      return { ...old, ...(typeof change === "function" ? change(old) : change), talentId };
    });
  const [pending, setPending] = useState(false);
  const [monthLeft, setMonthLeft] = useState<number | null>(null);
  const [projects, setProjects] = useState<{ talentId: string; items: ProjectSummary[]; more: boolean } | null>(null);
  const sending = useRef(false); // set at once, before the re-render: a double click sends once
  const nextId = useRef(0);

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

  async function ask(question: Question) {
    if (sending.current) return false;
    sending.current = true;
    setPending(true);
    const id = nextId.current++;
    // Asking again after a failure replaces the failed question rather than repeating it.
    update((old) => ({ lines: [...old.lines.filter((l) => !(l.role === "user" && l.error)), { id, role: "user", question }] }));
    const fail = (error: AskError) => update((old) => ({ lines: old.lines.map((l) => (l.id === id && l.role === "user" ? { ...l, error } : l)) }));
    try {
      const res = await fetch("/api/assistant/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(question),
      });
      const data = (await res.json().catch(() => ({}))) as { answer?: AssistantAnswer; error?: AskError; monthLeft?: number };
      if (!res.ok || !data.answer) {
        fail(data.error && data.error !== "failed" ? data.error : "failed");
        return false;
      }
      if (typeof data.monthLeft === "number") setMonthLeft(data.monthLeft);
      update((old) => ({ lines: [...old.lines, { id: nextId.current++, role: "assistant", answer: data.answer! }] }));
      return true;
    } catch {
      fail("failed");
      return false;
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return {
    lines: current.lines,
    projectId: current.projectId,
    setProjectId: (projectId: string) => update({ projectId }),
    projects: projects?.talentId === talentId ? projects : null,
    loadProjects,
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
