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

const optionClass =
  "flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm has-checked:border-zinc-900 has-disabled:opacity-50 dark:border-zinc-700 dark:has-checked:border-zinc-300";

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createTalent, {});

  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">你是…</legend>
        {accountTypeOptions.map((option) => (
          <label key={option.value} className={optionClass}>
            <input
              type="radio"
              name="accountType"
              value={option.value}
              defaultChecked={option.value === "individual"}
              disabled={!option.available}
            />
            {option.label}
            {!option.available && <span className="ml-auto text-xs text-zinc-500">即將推出</span>}
          </label>
        ))}
      </fieldset>

      <Field label="藝名或品牌名稱" name="name" defaultValue={defaultName} required />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">類型</legend>
        <div className="grid grid-cols-2 gap-2">
          {verticalOptions.map((option) => (
            <label key={option.value} className={optionClass}>
              <input type="radio" name="vertical" value={option.value} required />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "建立中…" : "開始使用"}
      </button>
    </form>
  );
}
