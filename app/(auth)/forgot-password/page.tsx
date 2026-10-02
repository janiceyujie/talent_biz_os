"use client";

import Link from "next/link";
import { useState } from "react";
import { authErrorMessage, buttonClass, Field, FormMessage } from "@/components/form";
import { authClient } from "@/lib/auth/client";

export default function ForgotPasswordPage() {
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
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">忘記密碼</h1>
      {sent ? (
        // Same message whether or not the email has an account.
        <FormMessage tone="info">如果這個電子郵件有註冊，重設密碼的連結已經寄出。</FormMessage>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="電子郵件" name="email" type="email" autoComplete="email" required />
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <button type="submit" className={buttonClass} disabled={pending}>
            {pending ? "寄送中…" : "寄送重設連結"}
          </button>
        </form>
      )}
      <Link href="/sign-in" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
        回到登入
      </Link>
    </div>
  );
}
