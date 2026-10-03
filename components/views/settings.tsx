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
  const t = useTranslations("locale");
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateWorkspace, {});

  return (
    <div className="settings-stack">
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>Workspace</span>
            <h2>工作區設定</h2>
          </div>
        </div>
        <form className="editor-form" action={action}>
          <div className="form-grid">
            <label>
              藝名或品牌名稱
              <input name="name" required defaultValue={data.talent.name} />
            </label>
            <label>
              工作區時區
              <input name="timeZone" required defaultValue={data.talent.timeZone} />
            </label>
          </div>
          <p className="muted">時區決定「今天」的計算方式，以及新行程的預設時區。</p>
          {state.error && (
            <p className="notice error" role="alert">
              {state.error}
            </p>
          )}
          {state.saved && !pending && <p className="notice">設定已儲存。</p>}
          <button className="primary" disabled={pending}>
            {pending ? "儲存中…" : "儲存設定"}
          </button>
        </form>
      </section>
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>Language</span>
            <h2>{t("heading")}</h2>
          </div>
        </div>
        <p className="muted">{t("help")}</p>
        <div className="form-grid">
          <LocaleSwitch />
        </div>
      </section>
      <CalendarFeedSettings />
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>Google & Gmail</span>
            <h2>Gmail 外掛</h2>
          </div>
          <span className="mock-chip">即將推出</span>
        </div>
        <p>
          安裝 Gmail 外掛後，打開一封邀約信按一下就能送進系統。外掛只會讀取你送出的那一封信，不會讀取整個信箱。
        </p>
      </section>
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>Assistant</span>
            <h2>AI 分析與擬稿</h2>
          </div>
        </div>
        <p>
          邀約分析與擬稿由系統提供的 AI 服務處理，你不需要自行設定金鑰。送給模型的內容不會被用來訓練模型；所有結果都要經過你確認才會保存。
        </p>
      </section>
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>Account</span>
            <h2>帳號</h2>
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
