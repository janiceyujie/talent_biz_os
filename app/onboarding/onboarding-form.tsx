"use client";

import { useActionState } from "react";
import { buttonClass, Field, FormMessage } from "@/components/form";
import { createTalent, type OnboardingState } from "./actions";

const verticalOptions = [
  { value: "music", label: "音樂人" },
  { value: "influencer", label: "網紅・創作者" },
  { value: "model", label: "模特兒" },
  { value: "other", label: "其他" },
];

const accountTypeOptions = [
  { value: "individual", label: "經營自己的事業", available: true },
  { value: "manager", label: "經紀人，管理多位藝人", available: false },
  { value: "agency", label: "經紀公司", available: false },
];

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createTalent, {});

  return (
    <form action={action}>
      <fieldset className="choice-list">
        <legend>你是…</legend>
        {accountTypeOptions.map((option) => (
          <label key={option.value} className="choice">
            <input
              type="radio"
              name="accountType"
              value={option.value}
              defaultChecked={option.value === "individual"}
              disabled={!option.available}
            />
            {option.label}
            {!option.available && <small>即將推出</small>}
          </label>
        ))}
      </fieldset>

      <Field label="藝名或品牌名稱" name="name" defaultValue={defaultName} required />

      <fieldset className="choice-list two-up">
        <legend>類型</legend>
        {verticalOptions.map((option) => (
          <label key={option.value} className="choice">
            <input type="radio" name="vertical" value={option.value} required />
            {option.label}
          </label>
        ))}
      </fieldset>

      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "建立中…" : "開始使用"}
      </button>
    </form>
  );
}
