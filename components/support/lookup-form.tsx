"use client";

import { useSupportTranslations } from "@/lib/i18n/use-support-translations";
import { useActionState } from "react";
import type { LookupState } from "@/app/support/actions";

/** The Support page's "Find an account": an exact email, opened on submit. */
export function LookupForm({ action }: { action: (state: LookupState, form: FormData) => Promise<LookupState> }) {
  const t = useSupportTranslations("support.lookup");
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
      <label>
        {t("email")}
        <input name="email" type="email" required autoComplete="off" spellCheck={false} />
      </label>
      <p className="muted">{t("help")}</p>
      {state.notFound && (
        <p className="notice error" role="alert">
          {t("notFound")}
        </p>
      )}
      <div className="support-row">
        <button className="primary" disabled={pending}>
          {t("submit")}
        </button>
      </div>
    </form>
  );
}
