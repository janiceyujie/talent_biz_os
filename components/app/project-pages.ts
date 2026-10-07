"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_MAX, PAGE_SIZE, type ListSort, type ListView, type ProjectPage as Page } from "@/lib/domain/project-list";

const SEARCH_PAUSE = 250; // ms after the last keystroke

const url = (p: { view: ListView; type: string; q: string; sort: ListSort }, cursor: string, limit: number) =>
  `/api/projects?${new URLSearchParams({ view: p.view, type: p.type, q: p.q, sort: p.sort, cursor, limit: String(limit) })}`;

/**
 * The projects list, a page at a time from app/api/projects (decision 0011).
 * A new view, filter, or order starts again from the first page (a search
 * once typing pauses); `loadMore` appends the next. When `revision` changes
 * — the app's data after a save — it reloads as many rows as are showing, so
 * the list doesn't jump back to the top. `restore` is how many rows to load
 * on arrival, when coming back to a list that had scrolled further.
 */
export function useProjectPages(params: { view: ListView; type: string; q: string; sort: ListSort }, revision: unknown, restore = 0) {
  const [state, setState] = useState<{ page: Page | null; loading: boolean; failed: boolean }>({ page: null, loading: true, failed: false });
  const shown = useRef(0);
  const request = useRef<AbortController | null>(null);
  const count = state.page?.items.length ?? 0;
  useEffect(() => {
    shown.current = count;
  }, [count]);

  const load = useCallback(
    (cursor: string, limit: number, append: boolean) => {
      request.current?.abort();
      const abort = (request.current = new AbortController());
      setState((s) => ({ ...s, loading: true, failed: false }));
      fetch(url(params, cursor, limit), { signal: abort.signal })
        .then((r) => (r.ok ? (r.json() as Promise<Page>) : Promise.reject(r.status)))
        .then((next) =>
          setState((s) => ({
            page: append && s.page ? { ...next, items: [...s.page.items, ...next.items] } : next,
            loading: false,
            failed: false,
          })),
        )
        .catch(() => !abort.signal.aborted && setState((s) => ({ ...s, loading: false, failed: true })));
    },
    [params.view, params.type, params.q, params.sort], // eslint-disable-line react-hooks/exhaustive-deps -- the four values are the request
  );

  // A new view, filter, or order: the first page (after a pause while typing). On arrival, as many rows as before.
  // Decided by the list, not consumed: effects may run twice (React's development checks) and must agree.
  const listKey = `${params.view}|${params.type}|${params.q.trim()}|${params.sort}`;
  const arrivedAt = useRef(listKey);
  const goal = useRef(0); // rows still to load back in
  useEffect(() => {
    if (listKey !== arrivedAt.current) arrivedAt.current = ""; // left the list we arrived at
    const target = arrivedAt.current ? restore : 0;
    goal.current = target;
    const timer = setTimeout(() => load("", Math.min(Math.max(target, PAGE_SIZE), PAGE_MAX), false), params.q && !target ? SEARCH_PAUSE : 0);
    return () => clearTimeout(timer);
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps -- `load` changes with the request

  // Coming back to more rows than one request returns: keep loading pages until they're all there.
  const { page: current, loading: busy } = state;
  useEffect(() => {
    const want = goal.current;
    if (!want || !current || busy) return;
    if (current.items.length >= want || !current.nextCursor) goal.current = 0;
    else load(current.nextCursor, Math.min(want - current.items.length, PAGE_MAX), true);
  }, [current, busy, load]);

  // After a save: the same rows again, fresh.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    load("", Math.min(Math.max(shown.current, PAGE_SIZE), PAGE_MAX), false);
  }, [revision]); // eslint-disable-line react-hooks/exhaustive-deps -- only a new revision reloads

  useEffect(() => () => request.current?.abort(), []);

  const { page, loading, failed } = state;
  const loadMore = useCallback(() => {
    if (page?.nextCursor && !loading) load(page.nextCursor, PAGE_SIZE, true);
  }, [page, loading, load]);

  return {
    items: page?.items ?? [],
    total: page?.total ?? null,
    counts: page?.counts ?? null,
    hasMore: !!page?.nextCursor,
    loading,
    failed,
    loadMore,
    retry: () => load("", PAGE_SIZE, false),
  };
}
