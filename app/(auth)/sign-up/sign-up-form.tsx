"use client";

import { useState } from "react";
import { authErrorMessage, buttonClass, Field, FormMessage } from "@/components/form";
import { authClient } from "@/lib/auth/client";

export function SignUpForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")),
      email,
      password: String(form.get("password")),
      callbackURL: "/onboarding", // where the verification link lands
    });
    setPending(false);
    if (error) setError(authErrorMessage(error));
    else setSentTo(email);
  }

  if (sentTo) {
    return (
      <FormMessage tone="info">
        確認信已寄到 {sentTo}。請點擊信中的連結完成註冊。
      </FormMessage>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="你的名字" name="name" autoComplete="name" required />
      <Field label="電子郵件" name="email" type="email" autoComplete="email" required />
      <Field
        label="密碼（至少 8 個字元）"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "建立中…" : "建立帳號"}
      </button>
    </form>
  );
}
