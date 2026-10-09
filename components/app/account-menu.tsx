"use client";

import { Check, LogOut, Palette, Settings } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { setLocale } from "@/lib/actions/locale";
import { authClient } from "@/lib/auth/client";
import { localeNames, locales } from "@/lib/i18n/config";
import { useAppData } from "./app-data";

const initials = (name: string) => name.trim().slice(0, 2).toUpperCase();

/**
 * The avatar at the top right and its menu: everything about the signed-in
 * person — settings, role and assistant, language, sign out — in one place.
 * Arrow keys move between items, Escape or a click elsewhere closes it.
 */
export function AccountMenu() {
  const data = useAppData();
  const t = useTranslations("shell");
  const tLocale = useTranslations("locale");
  const current = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = () => [...(root.current?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? [])];
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const onKey = (e: KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      list[(at + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      list[e.key === "Home" ? 0 : list.length - 1]?.focus();
    } else if (e.key === "Tab") close(false);
  };

  return (
    <div data-preview-safe="true" className="account-menu" ref={root} onKeyDown={open ? onKey : undefined}>
      <button
        ref={button}
        className="account-avatar"
        aria-label={t("accountMenu", { name: data.person.displayName })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {initials(data.person.displayName) || "?"}
      </button>
      {open && (
        <div id={menuId} className="account-menu-list" role="menu" aria-label={t("accountMenu", { name: data.person.displayName })}>
          <div className="account-menu-who">
            <strong>{data.person.displayName}</strong>
            <small>{data.person.email}</small>
          </div>
          <Link role="menuitem" href="/settings" onClick={() => close(false)}>
            <Settings size={16} aria-hidden="true" />
            {t("settings")}
          </Link>
          <Link role="menuitem" href="/role" onClick={() => close(false)}>
            <Palette size={16} aria-hidden="true" />
            {t("roleAndAssistant")}
          </Link>
          <div className="account-menu-group" role="group" aria-label={tLocale("label")}>
            <small>{tLocale("label")}</small>
            {locales.map((l) => (
              <button
                key={l}
                role="menuitemradio"
                aria-checked={l === current}
                disabled={pending}
                onClick={() => {
                  if (l !== current) startTransition(() => setLocale(l));
                  close();
                }}
              >
                <Check size={16} aria-hidden="true" className={l === current ? "" : "invisible"} />
                {localeNames[l]}
              </button>
            ))}
          </div>
          <button
            role="menuitem"
            className="account-menu-signout"
            onClick={async () => {
              await authClient.signOut();
              router.push("/sign-in");
              router.refresh();
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
