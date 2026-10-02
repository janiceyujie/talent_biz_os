import type { ComponentProps, ReactNode } from "react";

export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300";

export const buttonClass =
  "w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

export const secondaryButtonClass =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function Field({ label, ...input }: { label: string } & ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input className={inputClass} {...input} />
    </label>
  );
}

export function FormMessage({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  const color =
    tone === "error"
      ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
      : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
  return <p className={`rounded-md px-3 py-2 text-sm ${color}`}>{children}</p>;
}

// Better Auth error codes → what the person sees.
const authErrors: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "電子郵件或密碼錯誤。",
  EMAIL_NOT_VERIFIED: "這個電子郵件還沒確認。我們剛重新寄出確認信，請查看信箱。",
  PASSWORD_TOO_SHORT: "密碼至少需要 8 個字元。",
  USER_ALREADY_EXISTS: "這個電子郵件已經註冊過了。",
  INVALID_TOKEN: "連結無效或已過期，請重新申請。",
};

export function authErrorMessage(error: { code?: string } | null | undefined) {
  return (error?.code && authErrors[error.code]) || "發生錯誤，請稍後再試。";
}
