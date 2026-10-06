"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { SettingsRow } from "./settings-row";
import { authClient } from "@/lib/auth/client";
import { googleErrorKey } from "@/lib/auth/google-errors";

/**
 * Password and Google on one person (docs/decisions/0001). Connecting Google
 * here may use a different email — being signed in is the proof. The last
 * method can't be removed. Two rows of the settings page's account group.
 */
export function SignInMethods({ onNotice }: { onNotice: (text: string) => void }) {
  const data = useAppData();
  const t = useTranslations("settings.signIn");
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const linkError = googleErrorKey(useSearchParams().get("error"));
  const { password, googleAccountId, googleAvailable } = data.signIn;
  const google = googleAccountId !== null;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(linkError && tAuth(`googleError.${linkError}`));

  const connect = () =>
    startTransition(async () => {
      await authClient.linkSocial({ provider: "google", callbackURL: "/settings", errorCallbackURL: "/settings" });
    });
  const disconnect = () =>
    startTransition(async () => {
      const { error } = await authClient.unlinkAccount({ accountId: googleAccountId! });
      if (error) setError(t("lastMethod"));
      else router.refresh();
    });
  const sendPasswordLink = () =>
    startTransition(async () => {
      await authClient.requestPasswordReset({ email: data.person.email, redirectTo: "/reset-password" });
      onNotice(t("passwordSent", { email: data.person.email }));
    });

  return (
    <>
      <SettingsRow label={t("password")} error={error && !google ? error : null}>
        <span>{password ? t("passwordSet") : t("passwordNone")}</span>
        {!password && (
          <button type="button" className="secondary" disabled={pending} onClick={sendPasswordLink}>
            {t("setPassword")}
          </button>
        )}
      </SettingsRow>
      <SettingsRow
        label={t("google")}
        hint={[t("help")]}
        description={google && !password ? t("lastMethod") : !google && !googleAvailable ? t("googleUnavailable") : undefined}
        error={error && google ? error : null}
      >
        <span>{google ? t("googleLinked") : t("googleNotLinked")}</span>
        {google ? (
          <button type="button" className="secondary" disabled={pending || !password} onClick={disconnect}>
            {t("disconnect")}
          </button>
        ) : (
          googleAvailable && (
            <button type="button" className="secondary" disabled={pending} onClick={connect}>
              {t("connect")}
            </button>
          )
        )}
      </SettingsRow>
    </>
  );
}
