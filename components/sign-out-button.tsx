"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

/** Signs out, then goes to `to` (sign-in, by default). */
export function SignOutButton({ className = "sign-out", to = "/sign-in" }: { className?: string; to?: string }) {
  const t = useTranslations("shell");
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await authClient.signOut();
        router.push(to);
        router.refresh();
      }}
    >
      {t("signOut")}
    </button>
  );
}
