import type { ComponentProps, ReactNode } from "react";

// Auth and onboarding forms, styled by the app's global CSS (app/globals.css).
export const buttonClass = "primary full";
export const secondaryButtonClass = "secondary full";

export function Field({ label, ...input }: { label: string } & ComponentProps<"input">) {
  return (
    <label>
      {label}
      <input {...input} />
    </label>
  );
}

export function FormMessage({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <p className={tone === "error" ? "notice error" : "notice"} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
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
