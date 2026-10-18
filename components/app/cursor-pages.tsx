"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { appendPage, type CursorPage } from "@/lib/domain/cursor-page";

/** Every filter/workspace change invalidates old rows immediately, including in-flight requests. */
export function useCursorPages<T extends { id: string }>(url: string, scope: string, revision: unknown, enabled = true) {
  const key = `${scope}:${url}`;
  const [state, setState] = useState<{ key: string; revision: unknown; page: CursorPage<T> | null; loading: boolean; failed: boolean }>({ key: "", revision: null, page: null, loading: false, failed: false });
  const request = useRef<AbortController | null>(null);
  const load = useCallback((cursor = "", append = false) => {
    if (!enabled) return;
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    setState(s => ({ key, revision, page: append && s.key === key && s.revision === revision ? s.page : null, loading: true, failed: false }));
    fetch(`${url}&cursor=${encodeURIComponent(cursor)}`, { signal: abort.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error(String(response.status)); return await response.json() as CursorPage<T>; })
      .then(page => { if (!abort.signal.aborted) setState(s => ({ key, revision, page: { ...page, items: append && s.page ? appendPage(s.page.items, page.items) : page.items }, loading: false, failed: false })); })
      .catch(error => { if (!abort.signal.aborted) setState(s => ({ ...s, page: ["401", "403", "404"].includes(error.message) ? null : s.page, loading: false, failed: true })); });
  }, [enabled, key, revision, url]);
  useEffect(() => {
    const timer = setTimeout(() => load(), 250);
    return () => { clearTimeout(timer); request.current?.abort(); };
  }, [load]);
  const current = state.key === key && state.revision === revision;
  const page = current ? state.page : null;
  const loading = enabled && (!current || state.loading);
  const failed = current && state.failed;
  const loadMore = useCallback(() => { if (!loading && page?.nextCursor) load(page.nextCursor, true); }, [load, loading, page]);
  return { items: page?.items ?? [], total: page?.total ?? null, hasMore: !!page?.nextCursor, loading, failed, loadMore,
    retry: () => page?.nextCursor ? load(page.nextCursor, true) : load() };
}

/** Automatic near-end loading with a keyboard/touch fallback; errors never trigger an automatic retry loop. */
export function PageLoader({ page }: { page: { loading: boolean; failed: boolean; hasMore: boolean; loadMore: () => void; retry: () => void } }) {
  const t = useTranslations("pagination");
  const sentinel = useRef<HTMLDivElement>(null);
  const { loading, failed, hasMore, loadMore } = page;
  useEffect(() => {
    const element = sentinel.current;
    if (!element || loading || failed || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) loadMore(); }, { rootMargin: "200px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, failed, hasMore, loadMore]);
  return <div ref={sentinel} className="list-page-loader" aria-busy={loading}>
    {loading ? <span role="status">{t("loading")}</span> : failed ? <><span role="alert">{t("failed")}</span><button type="button" className="secondary" onClick={page.retry}>{t("retry")}</button></> : hasMore ? <button type="button" className="secondary" onClick={loadMore}>{t("more")}</button> : null}
  </div>;
}
