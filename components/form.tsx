"use client";

import { useTranslations } from "next-intl";
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

// Better Auth error codes → messages in the active language.
const authErrorCodes = [
  "INVALID_EMAIL_OR_PASSWORD",
  "EMAIL_NOT_VERIFIED",
  "PASSWORD_TOO_SHORT",
  "USER_ALREADY_EXISTS",
  "INVALID_TOKEN",
] as const;
type AuthErrorCode = (typeof authErrorCodes)[number];

export function useAuthErrorMessage() {
  const t = useTranslations("auth.errors");
  return (error: { code?: string } | null | undefined) =>
    authErrorCodes.includes(error?.code as AuthErrorCode) ? t(error!.code as AuthErrorCode) : t("unknown");
}
