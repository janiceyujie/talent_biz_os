"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { authClient } from "@/lib/auth/client";
import { googleErrorKey } from "@/lib/auth/google-errors";

/**
 * Password and Google on one person (docs/decisions/0001). Connecting Google
 * here may use a different email — being signed in is the proof. The last
 * method can't be removed.
 */
export function SignInMethods() {
  const data = useAppData();
  const t = useTranslations("settings.signIn");
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const linkError = googleErrorKey(useSearchParams().get("error"));
  const { password, googleAccountId, googleAvailable } = data.signIn;
  const google = googleAccountId !== null;
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
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
      setNotice(t("passwordSent", { email: data.person.email }));
    });

  return (
    <div className="sign-in-methods">
      <h3>{t("title")}</h3>
      <dl>
        <div>
          <dt>{t("password")}</dt>
          <dd>
            {password ? t("passwordSet") : t("passwordNone")}
            {!password && (
              <button type="button" className="text-button" disabled={pending} onClick={sendPasswordLink}>
                {t("setPassword")}
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt>{t("google")}</dt>
          <dd>
            {google ? t("googleLinked") : t("googleNotLinked")}
            {google ? (
              <button type="button" className="text-button" disabled={pending || !password} onClick={disconnect}>
                {t("disconnect")}
              </button>
            ) : googleAvailable ? (
              <button type="button" className="text-button" disabled={pending} onClick={connect}>
                {t("connect")}
              </button>
            ) : (
              <small className="muted">{t("googleUnavailable")}</small>
            )}
          </dd>
        </div>
      </dl>
      {google && !password && <p className="muted">{t("lastMethod")}</p>}
      <p className="muted">{t("help")}</p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
