"use client";

import { Bell, Menu, Search, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { notifications } from "@/lib/domain/workflow";
import { contactRoleLabels } from "@/lib/labels";
import { useAppData } from "./app-data";
import { Modal } from "./modal";
import { isActive, nav } from "./nav";

const initial = (name: string) => name.trim().slice(0, 2).toUpperCase() || "TB";

export function AppShell({ children }: { children: ReactNode }) {
  const data = useAppData();
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
      .map((p) => ({ id: p.id, label: p.title, detail: `合作案 · ${p.counterparty}`, href: `/projects?id=${p.id}` })),
    ...data.contacts
      .filter((c) => !c.archived)
      .map((c) => ({ id: c.id, label: c.name, detail: `${contactRoleLabels[c.role]} · ${c.company}`, href: "/contacts" })),
    ...data.calendar
      .filter((c) => !c.archived)
      .map((c) => ({ id: c.id, label: c.title, detail: `行程 · ${c.date}`, href: `/calendar?day=${c.date}` })),
    ...data.templates
      .filter((t) => !t.archived)
      .map((t) => ({ id: t.id, label: t.title, detail: "範本", href: "/drafts" })),
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
        aria-label="工作區選單"
      >
        <div className="brand">
          <span>TB</span>
          <div>
            <strong>Talent Business OS</strong>
            <small>Workspace</small>
          </div>
          <button className="close-nav" aria-label="關閉選單" onClick={() => setMobile(false)}>
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
          <small>工作區</small>
          {nav.map((item, i) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <div key={item.href}>
                {item.group === "manage" && nav[i - 1]?.group === "work" && (
                  <small className="nav-group-label">管理</small>
                )}
                <Link
                  href={item.href}
                  className={active ? "active" : ""}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMobile(false)}
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
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
          aria-label="關閉背景選單"
          onClick={() => setMobile(false)}
        />
      )}
      <main className="app-main" inert={narrow && mobile}>
        <header className="topbar">
          <button
            className="menu-button"
            aria-label="開啟選單"
            aria-expanded={mobile}
            aria-controls="workspace-navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={20} />
          </button>
          <button className="global-search" onClick={() => setShowSearch(true)}>
            <Search size={17} />
            <span>搜尋案件、合作方、行程、範本…</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="top-actions">
            <button
              aria-label={`通知${alerts.length ? `，${alerts.length} 則` : ""}`}
              onClick={() => setShowNotifications(true)}
            >
              <Bell size={19} />
              {alerts.length > 0 && <i />}
            </button>
            <Link href="/settings" aria-label="開啟設定">
              <Settings size={18} />
            </Link>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
      {showNotifications && (
        <Modal title={`通知 · ${alerts.length} 則`} onClose={() => setShowNotifications(false)}>
          {alerts.map((n) => (
            <article className="notification-row" key={n.id}>
              <button className="text-button left" onClick={() => open(n.href)}>
                <strong>{n.title}</strong>
                <small>{n.detail}</small>
              </button>
            </article>
          ))}
          {!alerts.length && (
            <p className="empty">目前沒有通知。近期行程、待辦期限與逾期款項會自動出現在這裡。</p>
          )}
        </Modal>
      )}
      {showSearch && (
        <Modal title="搜尋工作區" onClose={() => setShowSearch(false)}>
          <input
            autoFocus
            aria-label="搜尋工作區"
            placeholder="輸入關鍵字"
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
            {!results.length && <p className="empty">沒有符合的結果。</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
