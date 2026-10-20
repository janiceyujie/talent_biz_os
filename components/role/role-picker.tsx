"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { InfoHint } from "@/components/app/info-hint";
import { Modal } from "@/components/app/modal";
import { Field, FormMessage } from "@/components/form";
import { LocaleSwitch } from "@/components/locale-switch";
import { PRODUCT_MONOGRAM, PRODUCT_NAME } from "@/lib/brand";
import { roles, type Appearance, type Role } from "@/lib/roles";
import { AvatarChoices } from "./role-portrait";

export type RolePickerState = { error?: string };

/** A short, optional profile form. Occupation does not configure the workspace. */
export function RolePicker({ mode, initial, action, returnHref = "/" }: {
  returnHref?: string;
  mode: "onboarding" | "change";
  initial: { role: Role; profileRole: Role | null; appearance: Appearance; name?: string };
  action: (state: RolePickerState, formData: FormData) => Promise<RolePickerState>;
}) {
  const t = useTranslations("roles");
  const router = useRouter();
  const roleId = useId();
  const [state, formAction, pending] = useActionState(action, {});
  const [role, setRole] = useState<Role | "">(initial.profileRole ?? "");
  const [appearance, setAppearance] = useState<Appearance>(initial.appearance);
  const close = () => { if (!pending) router.replace(returnHref); };
  const form = <form action={formAction} className="profile-form" aria-busy={pending}>
    <input type="hidden" name="appearance" value={appearance} />
    <input type="hidden" name="returnTo" value={returnHref} />
    <fieldset disabled={pending} className="profile-fields">
      {mode === "onboarding" && <Field label={t("workspaceName")} name="name" defaultValue={initial.name} maxLength={200} required autoComplete="organization" />}
      <div className="profile-role-field">
        <span className="profile-label"><label htmlFor={roleId}>{t("optionalRole")}</label> <InfoHint label={t("optionalRole")} notes={[t("profileHelp"), t("managerAccessHelp")]} /></span>
        <select id={roleId} name="role" value={role} onChange={e => setRole(e.target.value as Role | "")}>
          <option value="">{t("notProvided")}</option>
          {roles.map(value => <option key={value} value={value}>{t(`${value}.label`)}</option>)}
        </select>
      </div>
      <details className="profile-appearance">
        <summary>{t("assistantLook")}</summary>
        <AvatarChoices role={initial.role} value={appearance} onChange={setAppearance} />
      </details>
    </fieldset>
    {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
    <div className="profile-actions">
      {mode === "onboarding"
        ? <button type="submit" name="intent" value="skip" className="secondary" disabled={pending}>{t("skipRole")}</button>
        : <button type="button" className="secondary" disabled={pending} onClick={close}>{t("cancelChange")}</button>}
      <button type="submit" name="intent" value="save" className="primary" disabled={pending}>
        {pending ? t("saving") : t(mode === "change" ? "save" : "start")}
      </button>
    </div>
  </form>;

  if (mode === "change") return <Modal narrow title={t("settingsTitle")} onClose={close}>{form}</Modal>;
  return <main className="onboarding profile-onboarding">
    <header className="onboarding-brand"><span className="monogram">{PRODUCT_MONOGRAM}</span><span>{PRODUCT_NAME}</span><LocaleSwitch compact /></header>
    <section className="profile-setup-card" aria-labelledby="profile-setup-title">
      <h1 id="profile-setup-title">{t("workspaceTitle")}</h1>
      {form}
    </section>
  </main>;
}
