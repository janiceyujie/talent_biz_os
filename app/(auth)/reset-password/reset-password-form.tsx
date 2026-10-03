"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { buttonClass, Field, FormMessage, useAuthErrorMessage } from "@/components/form";
import { authClient } from "@/lib/auth/client";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const authErrorMessage = useAuthErrorMessage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({
      token,
      newPassword: String(form.get("password")),
    });
    setPending(false);
    if (error) setError(authErrorMessage(error));
    else setDone(true);
  }

  if (done) {
    return (
      <>
        <FormMessage tone="info">{t("passwordUpdated")}</FormMessage>
        <Link href="/sign-in">
          {t("goToSignIn")}
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <Field
        label={t("newPassword")}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? t("updating") : t("updatePassword")}
      </button>
    </form>
  );
}
