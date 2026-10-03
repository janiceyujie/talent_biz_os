"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { buttonClass, Field, FormMessage, useAuthErrorMessage } from "@/components/form";
import { authClient } from "@/lib/auth/client";

export function SignUpForm() {
  const t = useTranslations("auth");
  const authErrorMessage = useAuthErrorMessage();
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
        {t("sentVerification", { email: sentTo })}
      </FormMessage>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label={t("yourName")} name="name" autoComplete="name" required />
      <Field label={t("email")} name="email" type="email" autoComplete="email" required />
      <Field
        label={t("newPasswordHint")}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? t("creating") : t("createAccount")}
      </button>
    </form>
  );
}
