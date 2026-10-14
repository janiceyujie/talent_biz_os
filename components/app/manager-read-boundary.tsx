"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LockKeyhole } from "lucide-react";
import { InfoHint } from "./info-hint";

/** Recheck active screens without AI. A failed check removes the protected subtree. */
export function ManagerReadBoundary({ ids, children }: { ids: string[]; children: ReactNode }) {
  const t = useTranslations("portfolio"), router = useRouter();
  const signature = JSON.stringify([...ids].sort());
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ signature: string; checking: boolean; error?: "plan" | "limit" | "access" | "failed" }>();
  useEffect(() => {
    let disposed = false;
    let request: AbortController | undefined;
    const check = async (foreground = false) => {
      if (document.visibilityState === "hidden" || request) return;
      const controller = new AbortController();
      request = controller;
      if (foreground) setState({ signature, checking: true });
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const params = new URLSearchParams();
        const selected = JSON.parse(signature) as string[];
        if (!selected.length) params.set("artist", "none");
        else selected.forEach(id => params.append("artist", id));
        const response = await fetch(`/api/manager/access?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error === "plan" ? "plan" : body.error === "limit" ? "limit" : response.status === 401 || response.status === 403 ? "access" : "failed");
        }
        if (!disposed) setState({ signature, checking: false });
      } catch (error) {
        if (!disposed) setState({ signature, checking: false, error: error instanceof Error && error.message === "plan" ? "plan" : error instanceof Error && error.message === "limit" ? "limit" : error instanceof Error && error.message === "access" ? "access" : "failed" });
      } finally {
        clearTimeout(timeout);
        request = undefined;
      }
    };
    const onFocus = () => void check(true);
    const onVisible = () => { if (document.visibilityState === "visible") void check(true); };
    void check(true);
    const timer = setInterval(() => void check(), 30000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; request?.abort(); clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisible); };
  }, [signature, attempt]);
  const current = state?.signature === signature ? state : undefined;
  const checking = !current || current.checking;
  return <>
    <div className="portfolio-read-only-label"><LockKeyhole size={14} aria-hidden="true"/><span>{t("readOnly")}</span><InfoHint label={t("readOnly")} notes={[t("readOnlyHint")]}/></div>
    {checking && <p role="status" aria-busy="true">{t("checkingAccess")}</p>}
    {current?.error && <div className="notice error" role="alert">{t(current.error)} <button className="secondary compact" onClick={() => { setState(undefined); setAttempt(value => value + 1); router.refresh(); }}>{t("retry")}</button></div>}
    {!current?.error && <div className="manager-read-content" hidden={checking} inert={checking}>{children}</div>}
  </>;
}
