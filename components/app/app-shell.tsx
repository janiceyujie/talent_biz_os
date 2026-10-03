"use client";

import { Bell, Menu, Search, Settings, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { notifications } from "@/lib/domain/workflow";
import { useLabels } from "@/lib/i18n/labels";
import { useNotificationText } from "./notification-text";
import { useAppData } from "./app-data";
import { Modal } from "./modal";
import { isActive, nav } from "./nav";

const initial = (name: string) => name.trim().slice(0, 2).toUpperCase() || "TB";

export function AppShell({ children }: { children: ReactNode }) {
  const data = useAppData();
  const t = useTranslations("shell");
  const tNav = useTranslations("nav");
  const notificationText = useNotificationText();
  const labels = useLabels();
  const pathname = usePathname();
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const sidebar = useRef<HTMLElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const update = () => {
      setNarrow(media.matches);
      if (!media.matches) setMobile(false);
    };
    queueMicrotask(update);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Mobile drawer: trap focus, close on Escape, lock page scroll.
  useEffect(() => {
    if (!narrow || !mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = sidebar.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.querySelector<HTMLElement>("a, button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobile(false);
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...(element?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex='0']",
        ) || []),
      ].filter((node) => node.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [narrow, mobile]);

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, []);

  const alerts = notifications(data);
  const results = [
    ...data.projects
      .filter((p) => !p.archived)
      .map((p) => ({ id: p.id, label: p.title, detail: t("resultProject", { counterparty: p.counterparty }), href: `/projects?id=${p.id}` })),
    ...data.contacts
      .filter((c) => !c.archived)
      .map((c) => ({ id: c.id, label: c.name, detail: `${labels.contactRole(c.role)} · ${c.company}`, href: "/contacts" })),
    ...data.calendar
      .filter((c) => !c.archived)
      .map((c) => ({ id: c.id, label: c.title, detail: t("resultCalendar", { date: c.date }), href: `/calendar?day=${c.date}` })),
    ...data.templates
      .filter((tpl) => !tpl.archived)
      .map((tpl) => ({ id: tpl.id, label: tpl.title, detail: t("resultTemplate"), href: "/drafts" })),
  ]
    .filter((r) => `${r.label} ${r.detail}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 30);

  const open = (href: string) => {
    setShowSearch(false);
    setShowNotifications(false);
    router.push(href);
  };

  return (
    <div className="app-shell">
      <aside
        ref={sidebar}
        id="workspace-navigation"
        className={`sidebar ${mobile ? "open" : ""}`}
        inert={narrow && !mobile}
        role={narrow && mobile ? "dialog" : undefined}
        aria-modal={narrow && mobile ? true : undefined}
        aria-label={tNav("menuLabel")}
      >
        <div className="brand">
          <span>TB</span>
          <div>
            <strong>Talent Business OS</strong>
            <small>Workspace</small>
          </div>
          <button className="close-nav" aria-label={tNav("closeMenu")} onClick={() => setMobile(false)}>
            <X size={20} />
          </button>
        </div>
        <Link className="workspace workspace-link" href="/settings" onClick={() => setMobile(false)}>
          <span>{initial(data.talent.name)}</span>
          <div>
            <strong>{data.talent.name}</strong>
            <small>{data.person.email}</small>
          </div>
        </Link>
        <nav>
          <small>{tNav("groupWork")}</small>
          {nav.map((item, i) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <div key={item.href}>
                {item.group === "manage" && nav[i - 1]?.group === "work" && (
                  <small className="nav-group-label">{tNav("groupManage")}</small>
                )}
                <Link
                  href={item.href}
                  className={active ? "active" : ""}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMobile(false)}
                >
                  <Icon size={19} />
                  <span>{tNav(item.key)}</span>
                  {item.href === "/inbox" && data.inbox.length > 0 && <em>{data.inbox.length}</em>}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div>
            <span>{initial(data.person.displayName)}</span>
            <p>
              <strong>{data.person.displayName}</strong>
              <SignOutButton />
            </p>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="nav-backdrop"
          tabIndex={-1}
          aria-hidden="true"
          aria-label={tNav("closeBackdrop")}
          onClick={() => setMobile(false)}
        />
      )}
      <main className="app-main" inert={narrow && mobile}>
        <header className="topbar">
          <button
            className="menu-button"
            aria-label={tNav("openMenu")}
            aria-expanded={mobile}
            aria-controls="workspace-navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={20} />
          </button>
          <button className="global-search" onClick={() => setShowSearch(true)}>
            <Search size={17} />
            <span>{t("searchPlaceholder")}</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="top-actions">
            <button
              aria-label={t("notifications", { count: alerts.length })}
              onClick={() => setShowNotifications(true)}
            >
              <Bell size={19} />
              {alerts.length > 0 && <i />}
            </button>
            <Link href="/settings" aria-label={t("openSettings")}>
              <Settings size={18} />
            </Link>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
      {showNotifications && (
        <Modal title={t("notifications", { count: alerts.length })} onClose={() => setShowNotifications(false)}>
          {alerts.map((n) => {
            const text = notificationText(n);
            return (
              <article className="notification-row" key={n.id}>
                <button className="text-button left" onClick={() => open(n.href)}>
                  <strong>{text.title}</strong>
                  <small>{text.detail}</small>
                </button>
              </article>
            );
          })}
          {!alerts.length && <p className="empty">{t("notificationsEmpty")}</p>}
        </Modal>
      )}
      {showSearch && (
        <Modal title={t("searchTitle")} onClose={() => setShowSearch(false)}>
          <input
            autoFocus
            aria-label={t("searchTitle")}
            placeholder={t("searchInput")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="search-results">
            {results.map((r) => (
              <button key={r.id} onClick={() => open(r.href)}>
                <strong>{r.label}</strong>
                <small>{r.detail}</small>
              </button>
            ))}
            {!results.length && <p className="empty">{t("noResults")}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
