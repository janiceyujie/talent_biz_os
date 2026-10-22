"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

/**
 * The end of a list: the next page loads as it scrolls into view (a button too, for keyboards
 * and if scrolling doesn't trigger it), or a failure to retry — never a list that silently stops short.
 */
export function ListMore({ list, failedText }: { list: { loading: boolean; failed: boolean; hasMore: boolean; loadMore: () => void; retry: () => void }; failedText: string }) {
  const t = useTranslations("list");
  const end = useRef<HTMLDivElement>(null);
  const { loadMore, hasMore } = list;
  useEffect(() => {
    const target = end.current;
    if (!target) return;
    const watch = new IntersectionObserver((seen) => seen.some((e) => e.isIntersecting) && loadMore(), { rootMargin: "600px 0px" });
    watch.observe(target);
    return () => watch.disconnect();
  }, [loadMore, hasMore]);
  if (list.failed)
    return (
      <p className="notice error" role="alert">
        {failedText}{" "}
        <button className="text-button" onClick={list.retry}>
          {t("retry")}
        </button>
      </p>
    );
  return hasMore ? (
    <div ref={end} className="deal-list-more">
      <button className="text-button" disabled={list.loading} onClick={loadMore}>
        {list.loading ? t("loading") : t("loadMore")}
      </button>
    </div>
  ) : null;
}
