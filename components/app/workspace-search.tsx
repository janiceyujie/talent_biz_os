"use client";

import { BriefcaseBusiness, Building2, CalendarDays, FileText, Search, UserRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { SEARCH_SHORTCUT } from "@/lib/brand";
import { useLabels } from "@/lib/i18n/labels";
import type { SearchHit } from "@/lib/data/search";
import { readSearchHistory, RECENT_MAX } from "@/lib/workspace-search";
import { useAppData } from "./app-data";

const icons = { project: BriefcaseBusiness, contact: UserRound, organization: Building2, calendar: CalendarDays, template: FileText };
const PAUSE = 150; // ms after the last keystroke before asking

type Found = { items: SearchHit[]; total: number; more: boolean };

/**
 * The search in the top bar (⌘K): type and pick from the list under it, by mouse or the arrow keys.
 * Before typing it suggests recent picks, remembered in this browser by id only, for this person and
 * workspace. The server searches (app/api/search): projects, contacts, organizations, calendar
 * items, and reply templates.
 */
export function WorkspaceSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const data = useAppData();
  const t = useTranslations("shell");
  const labels = useLabels();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const storageKey = `taloox-search:${data.talent.id}:${data.person.email}`;

  const [found, setFound] = useState<{ key: string; result: Found } | null>(null);
  const key = `${query.trim()}|${recent.join(",")}`;
  // Ask once typing pauses; a newer question cancels an older one still on its way.
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    const timer = setTimeout(
      () =>
        fetch(`/api/search?${new URLSearchParams({ q: query.trim(), recent: recent.join(",") })}`, { signal: abort.signal })
          .then((r) => (r.ok ? (r.json() as Promise<Found>) : Promise.reject(r.status)))
          .then((result) => setFound({ key, result }))
          .catch(() => {}), // offline or aborted: the last results stay
      query.trim() ? PAUSE : 0,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [open, key]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` stands for the query and recent picks
  const results = found?.result.items ?? [];
  const total = found?.result.total ?? 0;
  const searching = !!query.trim() && found?.key !== key;
  const detailOf = (hit: SearchHit) =>
    hit.kind === "project"
      ? t("resultProject", { counterparty: hit.detail })
      : hit.kind === "contact"
        ? [labels.contactRole(hit.role as Parameters<typeof labels.contactRole>[0]), hit.detail].filter(Boolean).join(" · ")
        : hit.kind === "organization"
          ? t("resultOrganization")
          : hit.kind === "calendar"
            ? t("resultCalendar", { date: hit.detail })
            : t("resultTemplate");
  const expanded = open && (query.trim().length > 0 || results.length > 0);

  const close = () => {
    onOpenChange(false);
    setActive(-1);
  };
  const show = () => {
    try {
      setRecent(readSearchHistory(localStorage.getItem(storageKey)));
    } catch {
      setRecent([]); // no browser storage: no suggestions from history, search still works
    }
    onOpenChange(true);
    setActive(-1);
  };
  const choose = (item: SearchHit) => {
    const next = [item.id, ...recent.filter((r) => r !== item.id)].slice(0, RECENT_MAX);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
    setRecent(next);
    close();
    setQuery("");
    input.current?.blur();
    router.push(item.href);
  };

  // ⌘K (Ctrl K) from anywhere puts the cursor in the search.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, []);
  // A press outside closes the list.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, onOpenChange]);
  useEffect(() => {
    if (active >= 0) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div
      ref={root}
      className="workspace-search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <div className={`global-search workspace-search-field ${open ? "is-open" : ""}`}>
        <Search size={17} aria-hidden="true" />
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label={t("searchTitle")}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? `${id}-results` : undefined}
          aria-activedescendant={expanded && active >= 0 && results[active] ? `${id}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={t("searchPlaceholder")}
          value={query}
          onFocus={show}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
            onOpenChange(true);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return; // typing Chinese: Enter picks a character, not a result
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              onOpenChange(true);
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (results.length ? (i < 0 && step < 0 ? results.length - 1 : (i + step + results.length) % results.length) : -1));
            } else if (e.key === "Enter" && open && results.length) {
              e.preventDefault();
              choose(results[Math.max(active, 0)]);
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className="workspace-search-clear"
            aria-label={t("clearSearch")}
            onClick={() => {
              setQuery("");
              setActive(-1);
              input.current?.focus();
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : (
          <kbd aria-hidden="true">{SEARCH_SHORTCUT}</kbd>
        )}
      </div>
      {expanded && (
        <div className="workspace-search-dropdown">
          <div className="workspace-search-caption">{searching ? t("searching") : query.trim() ? t("searchMatches", { count: total }) : t("searchSuggestions")}</div>
          <div id={`${id}-results`} ref={list} role="listbox" aria-label={t("searchTitle")} className="workspace-search-list">
            {results.map((item, index) => {
              const Icon = icons[item.kind];
              return (
                <button
                  type="button"
                  role="option"
                  id={`${id}-${index}`}
                  aria-selected={active === index}
                  tabIndex={-1}
                  key={item.id}
                  className="workspace-search-option"
                  onPointerDown={(e) => e.preventDefault()} // keep the input focused, so the list doesn't close first
                  onClick={() => choose(item)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>
                    <strong title={item.label}>{item.label}</strong>
                    <small title={detailOf(item)}>{detailOf(item)}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {!results.length && query.trim() && !searching && <p className="workspace-search-empty">{t("noResults")}</p>}
          {(total > results.length || found?.result.more) && <p className="workspace-search-empty">{t("searchRefine", { count: results.length })}</p>}
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {expanded && !searching ? (query.trim() ? t("searchMatches", { count: total }) : t("searchSuggestions")) : ""}
      </span>
    </div>
  );
}
