"use client";

import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { updateWorkspace } from "@/app/(app)/settings/actions";
import { useAppData } from "@/components/app/app-data";
import { TimeZonePicker } from "@/components/app/time-zone-picker";
import { Toast } from "@/components/app/toast";
import { LocaleSwitch } from "@/components/locale-switch";
import { RolePortrait } from "@/components/role/role-portrait";
import { SignOutButton } from "@/components/sign-out-button";
import { setReplyWithinDays } from "@/lib/actions/intake";
import { CalendarFeedSettings } from "./calendar-feed-settings";
import { GoogleCalendarSettings } from "./google-calendar-settings";
import { SettingsGroup, SettingsRow } from "./settings-row";
import { SignInMethods } from "./sign-in-methods";

const REPLY_SAVE_DELAY_MS = 600; // the days field saves once typing or stepping pauses
const MAX_REPLY_DAYS = 30; // as setReplyWithinDays allows

/**
 * Settings, grouped by whose they are: your account, your preferences, the
 * workspace (shared), and connected services. Every setting saves as it
 * changes; a toast confirms.
 */
export function SettingsView() {
  const data = useAppData();
  const t = useTranslations("settings");
  const tLocale = useTranslations("locale");
  const tRoles = useTranslations("roles");
  const [toast, setToast] = useState<string | null>(null);
  const saved = () => setToast(t("saved"));

  return (
    <div className="settings-page">
      <SettingsGroup title={t("groupAccount")}>
        <div className="settings-row settings-account">
          <RolePortrait role={data.person.role} appearance={data.person.appearance} />
          <div className="settings-row-label">
            <strong>{data.person.displayName}</strong>
            <small>{data.person.email}</small>
          </div>
          <div className="settings-row-control">
            <SignOutButton className="secondary" />
          </div>
        </div>
        <SignInMethods onNotice={setToast} />
      </SettingsGroup>

      <SettingsGroup title={t("groupPreferences")}>
        <SettingsRow label={tLocale("heading")} hint={[tLocale("help")]}>
          <LocaleSwitch bare className="settings-select" />
        </SettingsRow>
        <SettingsRow label={tRoles("settingsTitle")} hint={[tRoles("settingsBody")]}>
          <span>{tRoles(`${data.person.role}.label`)}</span>
          <Link className="secondary" href="/role?returnTo=%2Fsettings">
            {tRoles("change")}
          </Link>
        </SettingsRow>
        <ReplyDays onSaved={saved} />
      </SettingsGroup>

      <SettingsGroup title={t("groupWorkspace")}>
        <Workspace onSaved={saved} />
      </SettingsGroup>

      <SettingsGroup title={t("groupServices")}>
        <GoogleCalendarSettings onNotice={setToast} />
        <CalendarFeedSettings />
        <SettingsRow icon={<Mail size={20} />} label={t("gmailTitle")} hint={[t("gmailBody")]}>
          <span className="mock-chip">{t("comingSoon")}</span>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t("aiTitle")} hint={[t("aiBody")]}>
        <p className="settings-note">{t("aiShort")}</p>
      </SettingsGroup>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/** The workspace's name and zone: owners change them (each saves on its own); others see them. */
function Workspace({ onSaved }: { onSaved: () => void }) {
  const data = useAppData();
  const t = useTranslations("settings");
  const nameId = useId();
  const [timeZone, setTimeZone] = useState(data.talent.timeZone);
  const [error, setError] = useState<{ field: "name" | "timeZone"; text: string } | null>(null);
  const save = async (change: { name: string } | { timeZone: string }) => {
    const failure = await updateWorkspace(change);
    const field = "name" in change ? "name" : "timeZone";
    setError(failure ? { field, text: failure } : null);
    if (!failure) onSaved();
  };

  if (!data.person.workspaceOwner)
    return (
      <>
        <SettingsRow label={t("name")} description={t("ownerOnly")}>
          <span>{data.talent.name}</span>
        </SettingsRow>
        <SettingsRow label={t("timeZone")} description={t("timeZoneHelp")}>
          <span>{data.talent.timeZone}</span>
        </SettingsRow>
      </>
    );
  return (
    <>
      <SettingsRow label={t("name")} htmlFor={nameId} error={error?.field === "name" ? error.text : null}>
        <input
          id={nameId}
          className="settings-input"
          defaultValue={data.talent.name}
          maxLength={200}
          // Saves on leaving the field (or Enter), when it changed.
          onBlur={(e) => {
            const name = e.currentTarget.value.trim();
            if (name !== data.talent.name) void save({ name });
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </SettingsRow>
      <SettingsRow label={t("timeZone")} description={t("timeZoneHelp")} error={error?.field === "timeZone" ? error.text : null}>
        <div className="settings-input">
          <TimeZonePicker
            label={t("timeZone")}
            hideLabel
            required
            value={timeZone}
            onChange={(zone) => {
              setTimeZone(zone);
              if (zone !== data.talent.timeZone) void save({ timeZone: zone });
            }}
          />
        </div>
      </SettingsRow>
    </>
  );
}

/** The reply-by default for messages that state none: "[n] days after receiving", saved once the number settles. */
function ReplyDays({ onSaved }: { onSaved: () => void }) {
  const data = useAppData();
  const t = useTranslations("settings");
  const [days, setDays] = useState(String(data.person.replyWithinDays));
  const [error, setError] = useState<string | null>(null);
  const savedValue = useRef(data.person.replyWithinDays);
  const n = Number(days);
  const valid = days !== "" && Number.isInteger(n) && n >= 0 && n <= MAX_REPLY_DAYS;
  useEffect(() => {
    if (!valid || n === savedValue.current) return;
    const timer = setTimeout(async () => {
      const failure = await setReplyWithinDays(n);
      setError(failure);
      if (!failure) {
        savedValue.current = n;
        onSaved();
      }
    }, REPLY_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [valid, n, onSaved]);
  return (
    <SettingsRow label={t("replyTitle")} hint={[t("replyBody")]} error={valid ? error : t("replyInvalid", { max: MAX_REPLY_DAYS })}>
      <span className="settings-inline-field">
        {t.rich("replyDays", {
          field: () => (
            <input
              className="settings-number"
              type="number"
              aria-label={t("replyTitle")}
              min={0}
              max={MAX_REPLY_DAYS}
              step={1}
              required
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          ),
        })}
      </span>
    </SettingsRow>
  );
}
