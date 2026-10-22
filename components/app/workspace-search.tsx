"use client";

import { BriefcaseBusiness, Building2, CalendarDays, FileText, Search, UserRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SEARCH_SHORTCUT } from "@/lib/brand";
import { useLabels } from "@/lib/i18n/labels";
import { readSearchHistory, RECENT_MAX, searchWorkspace, type SearchItem } from "@/lib/workspace-search";
import { useAppData } from "./app-data";

const icons = { project: BriefcaseBusiness, contact: UserRound, organization: Building2, calendar: CalendarDays, template: FileText };
const SHOWN = 30; // results listed; more says to narrow the search

/**
 * The search in the top bar (⌘K): type and pick from the list under it, by mouse or the arrow keys.
 * Before typing it suggests recent picks, remembered in this browser by id only, for this person and
 * workspace. It searches what the layout carries: projects, contacts, organizations, calendar
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

  const items = useMemo<SearchItem[]>(
    () => [
      ...data.projects
        .filter((p) => !p.archived)
        .map((p) => ({ id: `project:${p.id}`, kind: "project" as const, label: p.title, detail: t("resultProject", { counterparty: p.counterparty }), href: `/projects?id=${encodeURIComponent(p.id)}` })),
      ...data.contacts
        .filter((c) => !c.archived)
        .map((c) => ({ id: `contact:${c.id}`, kind: "contact" as const, label: c.name, detail: [labels.contactRole(c.role), c.company].filter(Boolean).join(" · "), keywords: c.email, href: "/contacts" })),
      ...data.organizations
        .filter((o) => !o.archived)
        .map((o) => ({ id: `organization:${o.id}`, kind: "organization" as const, label: o.name, detail: t("resultOrganization"), href: `/contacts/organizations/${encodeURIComponent(o.id)}` })),
      ...data.calendar
        .filter((c) => !c.archived)
        .map((c) => ({ id: `calendar:${c.id}`, kind: "calendar" as const, label: c.title, detail: t("resultCalendar", { date: c.date }), href: `/calendar?day=${encodeURIComponent(c.date)}` })),
      ...data.templates
        .filter((tpl) => !tpl.archived)
        .map((tpl) => ({ id: `template:${tpl.id}`, kind: "template" as const, label: tpl.title, detail: t("resultTemplate"), href: "/drafts" })),
    ],
    [data, labels, t],
  );
  const matches = searchWorkspace(items, query, recent);
  const results = matches.slice(0, SHOWN);
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
  const choose = (item: SearchItem) => {
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
          <div className="workspace-search-caption">{query.trim() ? t("searchMatches", { count: matches.length }) : t("searchSuggestions")}</div>
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
                    <small title={item.detail}>{item.detail}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {!results.length && query.trim() && <p className="workspace-search-empty">{t("noResults")}</p>}
          {matches.length > SHOWN && <p className="workspace-search-empty">{t("searchRefine", { count: SHOWN })}</p>}
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {expanded ? (query.trim() ? t("searchMatches", { count: matches.length }) : t("searchSuggestions")) : ""}
      </span>
    </div>
  );
}
