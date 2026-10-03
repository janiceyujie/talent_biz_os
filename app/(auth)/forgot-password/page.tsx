"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { buttonClass, Field, FormMessage, useAuthErrorMessage } from "@/components/form";
import { authClient } from "@/lib/auth/client";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const authErrorMessage = useAuthErrorMessage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({
      email: String(form.get("email")),
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (error) setError(authErrorMessage(error));
    else setSent(true);
  }

  return (
    <div className="auth-stack">
      <h1>{t("forgotTitle")}</h1>
      {sent ? (
        // Same message whether or not the email has an account.
        <FormMessage tone="info">{t("resetSent")}</FormMessage>
      ) : (
        <form onSubmit={onSubmit}>
          <Field label={t("email")} name="email" type="email" autoComplete="email" required />
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <button type="submit" className={buttonClass} disabled={pending}>
            {pending ? t("sending") : t("sendReset")}
          </button>
        </form>
      )}
      <Link href="/sign-in" className="muted">
        {t("backToSignIn")}
      </Link>
    </div>
  );
}
