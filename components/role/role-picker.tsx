"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Field, FormMessage } from "@/components/form";
import { LocaleSwitch } from "@/components/locale-switch";
import { PRODUCT_MONOGRAM, PRODUCT_NAME } from "@/lib/brand";
import { managedVerticals, roles, type Appearance, type Role, type Vertical } from "@/lib/roles";
import { RoleArt } from "./role-art";
import { AvatarChoices } from "./role-portrait";

export type RolePickerState = { error?: string };

/**
 * The two-step "what's your role?" flow: pick a role, then the assistant's
 * look (and, at onboarding, a name). Used for first-run onboarding and for
 * changing role later; the server action decides what gets saved.
 */
export function RolePicker({
  mode,
  initial,
  action,
}: {
  mode: "onboarding" | "change";
  initial: { role: Role; appearance: Appearance; vertical: Vertical; name?: string };
  action: (state: RolePickerState, formData: FormData) => Promise<RolePickerState>;
}) {
  const t = useTranslations("roles");
  const tEyebrow = useTranslations("eyebrow");
  const tVertical = useTranslations("labels.vertical");
  const [state, formAction, pending] = useActionState(action, {});
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<Role>(initial.role);
  const [appearance, setAppearance] = useState<Appearance>(initial.appearance);
  const [vertical, setVertical] = useState<Vertical>(initial.vertical);

  return (
    <main className="onboarding">
      <header className="onboarding-brand">
        <LocaleSwitch compact />
        <span className="monogram">{PRODUCT_MONOGRAM}</span>
        <span>{PRODUCT_NAME}</span>
      </header>
      <section className="onboarding-body">
        <div className="onboarding-kicker">
          {tEyebrow("yourWorkspace")} <span>{t("step", { step })}</span>
        </div>
        <h1>{step === 1 ? t(mode === "change" ? "changeTitle" : "chooseTitle") : t("workspaceTitle")}</h1>
        {step === 1 ? (
          <>
            <fieldset className="role-grid">
              <legend className="sr-only">{t("primaryRole")}</legend>
              {roles.map((r) => (
                <label key={r} className={`role-card ${role === r ? "selected" : ""}`}>
                  <input type="radio" name="role-choice" value={r} checked={role === r} onChange={() => setRole(r)} />
                  <RoleArt role={r} />
                  <strong>{t(`${r}.label`)}</strong>
                  <span>{t(`${r}.description`)}</span>
                </label>
              ))}
            </fieldset>
            <footer className="onboarding-actions">
              <span>{t("noLimit")}</span>
              <button type="button" className="primary" onClick={() => setStep(2)}>
                {t("continue")} <span aria-hidden="true">→</span>
              </button>
            </footer>
          </>
        ) : (
          <form action={formAction}>
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="appearance" value={appearance} />
            <input type="hidden" name="vertical" value={vertical} />
            <p className="onboarding-intro">{t("workspaceIntro")}</p>
            <div className="workspace-preview">
              <RoleArt role={role} />
              <div>
                <small>{t("primaryRole")}</small>
                <h2>{t(`${role}.label`)}</h2>
                <p>{t(role === "manager" ? "previewManager" : "previewTalent")}</p>
              </div>
            </div>
            {mode === "onboarding" && (
              <Field
                label={t(role === "manager" ? "managedName" : "name")}
                name="name"
                defaultValue={initial.name}
                required
              />
            )}
            {role === "manager" && (
              <fieldset className="choice-list two-up">
                <legend>{t("managedVertical")}</legend>
                {managedVerticals.map((v) => (
                  <label key={v} className="choice">
                    <input type="radio" name="vertical-choice" checked={vertical === v} onChange={() => setVertical(v)} />
                    {tVertical(v)}
                  </label>
                ))}
              </fieldset>
            )}
            {role === "manager" && <p className="muted">{t("managerNote")}</p>}
            <AvatarChoices role={role} value={appearance} onChange={setAppearance} />
            {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
            <div className="onboarding-choices">
              <button type="submit" className="primary" disabled={pending}>
                {pending ? t("saving") : t(mode === "change" ? "save" : "start")} →
              </button>
              <button type="button" className="text-button" disabled={pending} onClick={() => setStep(1)}>
                {t("back")}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
