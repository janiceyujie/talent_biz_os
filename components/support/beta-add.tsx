"use client";

import { useState, useTransition } from "react";
import { addPeople, checkBatch } from "@/app/support/beta/actions";
import { useSupportTranslations } from "@/lib/i18n/use-support-translations";

type Checked = Awaited<ReturnType<typeof checkBatch>>;

/**
 * Adding people to the beta list, admins only, in a dialog the list opens: paste
 * a batch, see what adding it would do, then add. Nobody is emailed here: the
 * list selects who was added, ready for their invitations (onAdded).
 */
export function BetaAdd({ locales, defaultLocale, onAdded }: { locales: { value: string; name: string }[]; defaultLocale: string; onAdded: (emails: string[]) => void }) {
  const t = useSupportTranslations("support.beta.add");
  const [pasted, setPasted] = useState("");
  const [note, setNote] = useState("");
  const [locale, setLocale] = useState(defaultLocale);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [pending, start] = useTransition();
  const adding = checked ? checked.add.length + checked.restore.length : 0;

  return (
    <div className="support-stack">
      <label>
        {t("emails")}
        <textarea
          rows={6}
          value={pasted}
          onChange={(e) => {
            setPasted(e.target.value);
            setChecked(null); // a changed batch is checked again
          }}
          spellCheck={false}
          autoFocus
        />
      </label>
      <p className="muted">{t("emailsHelp")}</p>
      <label>
        {t("note")}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("noteHelp")} maxLength={200} />
      </label>
      <label>
        {t("locale")}
        <select value={locale} onChange={(e) => setLocale(e.target.value)}>
          {locales.map((l) => (
            <option key={l.value} value={l.value}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <div className="support-row">
        <button type="button" className="secondary" disabled={!pasted.trim() || pending} onClick={() => start(async () => setChecked(await checkBatch(pasted)))}>
          {t("preview")}
        </button>
      </div>
      {checked && (
        <div className="support-stack">
          <ul className="support-list">
            {checked.add.length > 0 && (
              <li>
                {t("new", { count: checked.add.length })}: {checked.add.map((e) => (checked.names[e] ? `${checked.names[e]}, ${e}` : e)).join("; ")}
              </li>
            )}
            {checked.restore.length > 0 && (
              <li>
                {t("restore", { count: checked.restore.length })}: {checked.restore.join(", ")}
              </li>
            )}
            {checked.listed.length > 0 && <li className="muted">{t("listed", { count: checked.listed.length })}: {checked.listed.join(", ")}</li>}
            {checked.hasAccount.length > 0 && <li className="muted">{t("hasAccount", { count: checked.hasAccount.length })}: {checked.hasAccount.join(", ")}</li>}
            {checked.invalid.length > 0 && <li className="muted">{t("invalid", { count: checked.invalid.length })}: {checked.invalid.join(", ")}</li>}
          </ul>
          {adding > 0 ? (
            <div className="support-row">
              <button
                type="button"
                className="primary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await addPeople({ pasted, note, locale });
                    onAdded(result.emails);
                  })
                }
              >
                {t("confirm", { count: adding })}
              </button>
            </div>
          ) : (
            <p className="muted">{t("nothing")}</p>
          )}
        </div>
      )}
    </div>
  );
}
