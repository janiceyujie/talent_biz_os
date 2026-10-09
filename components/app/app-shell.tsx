"use client";

import { Bell, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { COLLAPSE_SHORTCUT, PRODUCT_MONOGRAM, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { AssistantProvider } from "./assistant-provider";
import { AssistantDock } from "./assistant-dock";
import { WorkspaceSearch } from "./workspace-search";
import { AccountMenu } from "./account-menu";
import { Companion } from "./companion";
import { NotificationList, ReminderToast, useNotifications } from "./notifications";
import { PreviewBanner, useAppData } from "./app-data";
import { Modal } from "./modal";
import { isActive, nav } from "./nav";

// Collapsing the sidebar to its icons is a per-browser preference (wide screens only; phones use the drawer).
const COLLAPSED_KEY = "talent-biz-os.sidebar-collapsed";
const rememberCollapsed = (collapsed: boolean) => {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // storage unavailable (private window): it just isn't remembered
  }
};

export function AppShell({ children }: { children: ReactNode }) {
  const data = useAppData();
  return <AssistantProvider key={`${data.talent.id}:${data.person.email}:${Boolean(data.preview)}`}><ShellContent>{children}</ShellContent></AssistantProvider>;
}

function ShellContent({ children }: { children: ReactNode }) {
  const data = useAppData();
  const t = useTranslations("shell");
  const tNav = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const showTip = (el: HTMLElement, label: string) => {
    const r = el.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2 });
  };
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      setTip(null);
      rememberCollapsed(!c);
      return !c;
    });
  useEffect(() => {
    let stored = false;
    try {
      stored = localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {}
    if (stored) queueMicrotask(() => setCollapsed(true));
  }, []);

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
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((c) => {
          rememberCollapsed(!c);
          return !c;
        });
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, []);

  const { unread } = useNotifications();
  // Messages waiting for the person: analyzed and not yet filed or dismissed.
  const toReview = data.inbox.filter((m) => m.status === "analyzed" || m.status === "error").length;
  const open = (href: string) => {
    setShowSearch(false);
    setShowNotifications(false);
    router.push(href);
  };

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
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
          <Link className="brand-home" href="/" aria-label={`${PRODUCT_NAME} · ${tNav("home")}`} onClick={() => setMobile(false)}>
            <span>{PRODUCT_MONOGRAM}</span>
            <div>
              <strong>{PRODUCT_NAME}</strong>
              <small>{PRODUCT_TAGLINE}</small>
            </div>
          </Link>
          <button data-preview-safe="true" className="close-nav" aria-label={tNav("closeMenu")} onClick={() => setMobile(false)}>
            <X size={20} />
          </button>
        </div>
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
                  // Collapsed, the label shows as a tooltip beside the icon (the sidebar scrolls, so it's drawn outside it).
                  onMouseEnter={collapsed ? (e) => showTip(e.currentTarget, tNav(item.key)) : undefined}
                  onMouseLeave={collapsed ? () => setTip(null) : undefined}
                  onFocus={collapsed ? (e) => e.currentTarget.matches(":focus-visible") && showTip(e.currentTarget, tNav(item.key)) : undefined}
                  onBlur={collapsed ? () => setTip(null) : undefined}
                  onClick={() => setMobile(false)}
                >
                  <Icon size={19} />
                  <span>{tNav(item.key)}</span>
                  {item.href === "/inbox" && toReview > 0 && <em>{toReview}</em>}
                </Link>
              </div>
            );
          })}
        </nav>
      </aside>
      {collapsed && tip && (
        // The link already carries its name for screen readers; this is the visible copy.
        <div className="nav-tip" aria-hidden="true" style={{ top: tip.top }}>
          {tip.label}
        </div>
      )}
      {mobile && (
        <button data-preview-safe="true"
          className="nav-backdrop"
          tabIndex={-1}
          aria-hidden="true"
          aria-label={tNav("closeBackdrop")}
          onClick={() => setMobile(false)}
        />
      )}
      <main className="app-main" inert={narrow && mobile}>
        <header className="topbar">
          <button data-preview-safe="true"
            className="menu-button"
            aria-label={tNav("openMenu")}
            aria-expanded={mobile}
            aria-controls="workspace-navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={20} />
          </button>
          <div className="topbar-start">
            {/* Wide screens: collapse the sidebar to its icons for more room (calendar, dashboard). Phones use the menu button above. */}
            <button data-preview-safe="true"
              className="collapse-nav"
              aria-label={tNav(collapsed ? "expandMenu" : "collapseMenu")}
              title={`${tNav(collapsed ? "expandMenu" : "collapseMenu")} (${COLLAPSE_SHORTCUT})`}
              aria-expanded={!collapsed}
              aria-controls="workspace-navigation"
              onClick={toggleCollapsed}
            >
              {collapsed ? <PanelLeftOpen size={19} aria-hidden="true" /> : <PanelLeftClose size={19} aria-hidden="true" />}
            </button>
            <WorkspaceSearch key={`${data.talent.id}:${data.person.email}:${Boolean(data.preview)}`} open={showSearch} onOpenChange={setShowSearch} />
          </div>
          <Companion
            key={data.person.role}
            open={companionOpen}
            onOpenChange={setCompanionOpen}
            blocked={mobile || showNotifications || showSearch}
          />
          <div className="top-actions">
            <button data-preview-safe="true"
              aria-label={t("notifications", { count: unread.length })}
              onClick={() => setShowNotifications(true)}
            >
              <Bell size={19} />
              {unread.length > 0 && <i />}
            </button>
            <AccountMenu />
          </div>
        </header>
        <PreviewBanner />
        <div className="page-content" key={data.preview?"preview":"workspace"}>{children}</div>
      </main>
      {showNotifications && (
        <Modal title={t("notifications", { count: unread.length })} onClose={() => setShowNotifications(false)}>
          <NotificationList open={open} />
        </Modal>
      )}
      <AssistantDock hidden={mobile || showNotifications} />
      <ReminderToast onOpen={() => setShowNotifications(true)} suppress={showNotifications || showSearch || companionOpen} />

    </div>
  );
}
