"use client";

import { useActionState } from "react";
import { updateWorkspace, type SettingsState } from "@/app/(app)/settings/actions";
import { useAppData } from "@/components/app/app-data";
import { SignOutButton } from "@/components/sign-out-button";
import { LocaleSwitch } from "@/components/locale-switch";
import { useTranslations } from "next-intl";
import { CalendarFeedSettings } from "./calendar-feed-settings";

export function SettingsView() {
  const data = useAppData();
  const t = useTranslations("settings");
  const tEyebrow = useTranslations("eyebrow");
  const tLocale = useTranslations("locale");
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateWorkspace, {});

  return (
    <div className="settings-stack">
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>{tEyebrow("workspace")}</span>
            <h2>{t("workspace")}</h2>
          </div>
        </div>
        <form className="editor-form" action={action}>
          <div className="form-grid">
            <label>
              {t("name")}
              <input name="name" required defaultValue={data.talent.name} />
            </label>
            <label>
              {t("timeZone")}
              <input name="timeZone" required defaultValue={data.talent.timeZone} />
            </label>
          </div>
          <p className="muted">{t("timeZoneHelp")}</p>
          {state.error && (
            <p className="notice error" role="alert">
              {state.error}
            </p>
          )}
          {state.saved && !pending && <p className="notice">{t("saved")}</p>}
          <button className="primary" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </button>
        </form>
      </section>
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>{tEyebrow("language")}</span>
            <h2>{tLocale("heading")}</h2>
          </div>
        </div>
        <p className="muted">{tLocale("help")}</p>
        <div className="form-grid">
          <LocaleSwitch />
        </div>
      </section>
      <CalendarFeedSettings />
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>{tEyebrow("google")}</span>
            <h2>{t("gmailTitle")}</h2>
          </div>
          <span className="mock-chip">{t("comingSoon")}</span>
        </div>
        <p>
          {t("gmailBody")}
        </p>
      </section>
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>{tEyebrow("assistant")}</span>
            <h2>{t("aiTitle")}</h2>
          </div>
        </div>
        <p>
          {t("aiBody")}
        </p>
      </section>
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>{tEyebrow("account")}</span>
            <h2>{t("account")}</h2>
          </div>
        </div>
        <p>
          {data.person.displayName} · {data.person.email}
        </p>
        <SignOutButton />
      </section>
    </div>
  );
}
