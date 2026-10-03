"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { buttonClass, Field, FormMessage } from "@/components/form";
import { createTalent, type OnboardingState } from "./actions";

const verticalOptions = ["music", "influencer", "model", "other"] as const;

const accountTypeOptions = [
  { value: "individual", available: true },
  { value: "manager", available: false },
  { value: "agency", available: false },
] as const;

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const t = useTranslations("onboarding");
  const tVertical = useTranslations("labels.vertical");
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createTalent, {});

  return (
    <form action={action}>
      <fieldset className="choice-list">
        <legend>{t("youAre")}</legend>
        {accountTypeOptions.map((option) => (
          <label key={option.value} className="choice">
            <input
              type="radio"
              name="accountType"
              value={option.value}
              defaultChecked={option.value === "individual"}
              disabled={!option.available}
            />
            {t(`account.${option.value}`)}
            {!option.available && <small>{t("comingSoon")}</small>}
          </label>
        ))}
      </fieldset>

      <Field label={t("name")} name="name" defaultValue={defaultName} required />

      <fieldset className="choice-list two-up">
        <legend>{t("type")}</legend>
        {verticalOptions.map((vertical) => (
          <label key={vertical} className="choice">
            <input type="radio" name="vertical" value={vertical} required />
            {tVertical(vertical)}
          </label>
        ))}
      </fieldset>

      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? t("creating") : t("start")}
      </button>
    </form>
  );
}
