"use client";

import { Pause, Play, RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { RolePortrait } from "@/components/role/role-portrait";
import { dateInZone } from "@/lib/domain/dates";
import { useAppData } from "./app-data";

// The role character walking in the top bar. Clicking it shows a pep talk
// from a fixed, reviewed list per role (messages: encouragement.lines) — no
// model call, no guessing at how the person feels. It greets once per role
// per local day on its own; both that and pausing the animation are browser
// preferences in localStorage, not synced across devices.

const lineKeys = ["0", "1", "2", "3", "4", "5"] as const; // six lines per role
const preferencesKey = "talent-companion-preferences-v1";
const greetingKey = "talent-companion-greetings-v1";

function stored(key: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
function store(key: string, value: object) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be off (private browsing); the page still works for this visit.
  }
}

/** Same line all day for a given day; "another one" steps through the rest. */
function lineKey(day: string, offset: number) {
  const seed = Array.from(day).reduce((n, c) => n + c.charCodeAt(0), 0);
  return lineKeys[(seed + offset) % lineKeys.length];
}

export function Companion({
  open,
  onOpenChange,
  blocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocked: boolean; // a menu, dialog, or search is open
}) {
  const data = useAppData();
  const t = useTranslations("encouragement");
  const tRoles = useTranslations("roles");
  const tEyebrow = useTranslations("eyebrow");
  const { role, appearance } = data.person;
  const timeZone = data.talent.timeZone;
  const [prefs, setPrefs] = useState({ loaded: false, paused: false, automatic: true });
  const [hidden, setHidden] = useState(false);
  const [offset, setOffset] = useState(0);
  const [day, setDay] = useState("");
  const shown = useRef(new Set<string>());
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const visible = open && !blocked && !hidden;

  useEffect(() => {
    const saved = stored(preferencesKey);
    queueMicrotask(() => setPrefs({ loaded: true, paused: saved.paused === true, automatic: saved.automatic !== false }));
    const visibility = () => {
      setHidden(document.hidden);
      if (!document.hidden) setDay(dateInZone(timeZone));
    };
    queueMicrotask(visibility);
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(() => setDay(dateInZone(timeZone)), 60_000); // a new day while the app stays open
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [timeZone]);

  // The daily greeting, a second after the workspace opens.
  useEffect(() => {
    if (!prefs.loaded || !prefs.automatic || blocked || hidden || !day) return;
    const key = `${role}:${day}`;
    if (shown.current.has(key) || stored(greetingKey)[role] === day) return;
    const timer = setTimeout(() => {
      if (document.hidden || document.querySelector("dialog[open]") || stored(greetingKey)[role] === day) return;
      shown.current.add(key);
      store(greetingKey, { ...stored(greetingKey), [role]: day });
      onOpenChange(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [prefs.loaded, prefs.automatic, blocked, hidden, day, role, onOpenChange]);

  useEffect(() => {
    if (!visible) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [visible, onOpenChange]);

  const updatePreference = (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    store(preferencesKey, { paused: next.paused, automatic: next.automatic });
  };
  const close = () => {
    onOpenChange(false);
    trigger.current?.focus();
  };
  const today = day || dateInZone(timeZone);

  return (
    <div
      ref={root}
      className={`assistant-companion ${visible ? "is-speaking" : ""} ${prefs.paused || blocked || hidden || !prefs.loaded ? "is-paused" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="companion-stage">
        <button
          ref={trigger}
          className="companion-character"
          type="button"
          aria-label={t("label")}
          aria-expanded={visible}
          aria-controls={panelId}
          onClick={() => {
            if (!open) {
              setOffset((n) => n + 1);
              // Opening it by hand counts as today's greeting.
              shown.current.add(`${role}:${today}`);
              store(greetingKey, { ...stored(greetingKey), [role]: today });
            }
            onOpenChange(!open);
          }}
        >
          <span className="companion-walker">
            <span className="companion-stride">
              <RolePortrait role={role} appearance={appearance} />
            </span>
          </span>
        </button>
        <span className="companion-ground" aria-hidden="true" />
      </div>
      <span className="companion-mobile-name">{tEyebrow("talentAssistant")}</span>
      <button
        type="button"
        className="companion-pause"
        aria-label={prefs.paused ? t("resume") : t("pause")}
        title={prefs.paused ? t("resume") : t("pause")}
        onClick={() => updatePreference({ paused: !prefs.paused })}
      >
        {prefs.paused ? <Play size={15} /> : <Pause size={15} />}
      </button>
      {visible && (
        <section id={panelId} className="companion-bubble" aria-label={t("messageLabel")}>
          <div className="companion-bubble-header">
            <span>
              {tEyebrow("talentAssistant")} <span>· {tRoles(`${role}.label`)}</span>
            </span>
            <button type="button" aria-label={t("close")} onClick={close}>
              <X size={18} />
            </button>
          </div>
          <p aria-live="polite" aria-atomic="true">
            {t(`lines.${role}.${lineKey(today, offset)}`)}
          </p>
          <div className="companion-bubble-actions">
            <button type="button" onClick={() => setOffset((n) => n + 1)}>
              <RefreshCw size={15} />
              {t("another")}
            </button>
            <label>
              <input type="checkbox" checked={prefs.automatic} onChange={(e) => updatePreference({ automatic: e.target.checked })} />
              {t("automatic")}
            </label>
          </div>
        </section>
      )}
    </div>
  );
}
