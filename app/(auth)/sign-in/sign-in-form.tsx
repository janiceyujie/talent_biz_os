"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authErrorMessage, buttonClass, Field, FormMessage } from "@/components/form";
import { authClient } from "@/lib/auth/client";

export function SignInForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setError(authErrorMessage(error));
      setPending(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="電子郵件" name="email" type="email" autoComplete="email" required />
      <Field label="密碼" name="password" type="password" autoComplete="current-password" required />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "登入中…" : "登入"}
      </button>
    </form>
  );
}
