import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The frame every widget shares: a title (with an optional count and link)
 * and its body on a card. A widget that's turned on always shows, saying so
 * when it has nothing — hiding is only for widgets turned off in 自訂今日總覽.
 */
export function Widget({
  id,
  title,
  count,
  link,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  link?: { href: string; label: ReactNode }; // to the full page: a quiet text link, the same on every widget
  children: ReactNode;
}) {
  const titleId = `widget-${id}`;
  return (
    <section className="widget" data-widget={id} aria-labelledby={titleId}>
      <header className="today-section-title">
        <h2 id={titleId}>{title}</h2>
        {!!count && <span className="today-count">{count}</span>}
        {link && (
          <Link className="text-button" href={link.href}>
            {link.label}
          </Link>
        )}
      </header>
      <div className="surface widget-body">{children}</div>
    </section>
  );
}
