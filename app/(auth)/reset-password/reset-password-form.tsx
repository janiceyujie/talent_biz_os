"use client";

import Link from "next/link";
import { useState } from "react";
import { authErrorMessage, buttonClass, Field, FormMessage } from "@/components/form";
import { authClient } from "@/lib/auth/client";

export function ResetPasswordForm({ token }: { token: string }) {
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
        <FormMessage tone="info">密碼已更新，其他裝置上的登入也已登出。</FormMessage>
        <Link href="/sign-in" className="text-sm hover:underline">
          前往登入
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        label="新密碼（至少 8 個字元）"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "更新中…" : "更新密碼"}
      </button>
    </form>
  );
}
