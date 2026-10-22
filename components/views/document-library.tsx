"use client";

import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { localeNames, locales, toLocale, type Locale } from "@/lib/i18n/config";
import { roles, type Role } from "@/lib/roles";
import type { CatalogTemplate } from "@/lib/templates/catalog";
import { templateKinds, type TemplateKind } from "@/lib/templates/content";

// Where the wording of the templates comes from: read before relying on any of it.
const sources = [
  ["commonPaper", "https://commonpaper.com/standards/professional-services-agreement/"],
  ["freelancersUnion", "https://blog.freelancersunion.org/2013/09/11/8-contract-provisions-every-freelancer-should-know-2/"],
  ["mu", "https://musiciansunion.org.uk/legal-money/contracts-and-agreements/standard-contracts"],
  ["artsLaw", "https://www.artslaw.com.au/wp-content/uploads/2024/06/02_Booking_Agreement_Checklist.pdf"],
  ["ftc", "https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews"],
] as const;

/**
 * Contract and quote templates (decision 0020), folded until opened: nothing loads before. Filter by
 * role (the person's own to start), language, and kind; preview, copy, or download a Word file.
 * They're templates, not legal advice: it says so under the heading, and in every file.
 */
export function DocumentLibrary() {
  const t = useTranslations("documentLibrary");
  const tRoles = useTranslations("roles");
  const own = useAppData().person.role;
  const panel = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role | "all">(own);
  const [language, setLanguage] = useState<Locale>(toLocale(useLocale()));
  const [kind, setKind] = useState<TemplateKind>("contract");
  const [retry, setRetry] = useState(0);
  const [copied, setCopied] = useState<string | null>(null); // what Copy said, for the status line
  const key = `${language}:${kind}:${retry}`;
  const [result, setResult] = useState<{ key: string; templates: CatalogTemplate[]; failed: boolean }>({ key: "", templates: [], failed: false });

  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    fetch(`/api/document-templates?${new URLSearchParams({ locale: language, kind })}`, { signal: abort.signal })
      .then((r) => (r.ok ? (r.json() as Promise<CatalogTemplate[]>) : Promise.reject(r.status)))
      .then((templates) => setResult({ key, templates, failed: false }))
      .catch(() => !abort.signal.aborted && setResult({ key, templates: [], failed: true }));
    return () => abort.abort();
  }, [open, key]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` stands for language, kind, and retry

  const current = result.key === key;
  const loading = open && !current;
  const templates = current ? result.templates : [];
  const shown = templates.filter((d) => role === "all" || d.role === role);
  const copy = async (d: CatalogTemplate) => {
    try {
      await navigator.clipboard.writeText(d.text);
      setCopied(t("copied", { title: d.title }));
    } catch {
      setCopied(t("copyFailed"));
    }
  };
  const close = () => {
    setOpen(false);
    toggle.current?.focus({ preventScroll: true });
    toggle.current?.scrollIntoView({ block: "nearest" });
  };

  return (
    <section className="surface document-library" aria-label={t("title")}>
      <h2 className="document-library-title">
        <button ref={toggle} type="button" className="document-library-toggle" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
          <span className="document-library-identity">
            <FileText size={22} aria-hidden="true" />
            <span>{t("title")}</span>
          </span>
          <span className="document-library-toggle-label">
            {t(open ? "collapse" : "expand")}
            {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
          </span>
        </button>
      </h2>
      <div id={panel} hidden={!open} className="document-library-body">
        <p className="notice document-library-disclaimer">{t("disclaimer")}</p>
        <div className="toolbar wrap document-toolbar">
          <label>
            {t("role")}
            <select value={role} onChange={(e) => setRole(e.target.value as Role | "all")}>
              <option value="all">{t("allRoles")}</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {tRoles(`${r}.label`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("language")}
            <select value={language} onChange={(e) => setLanguage(e.target.value as Locale)}>
              {locales.map((l) => (
                <option key={l} value={l}>
                  {localeNames[l]}
                </option>
              ))}
            </select>
          </label>
          <div className="row-actions" role="group" aria-label={t("kind")}>
            {templateKinds.map((k) => (
              <button type="button" key={k} className={kind === k ? "primary" : "secondary"} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {t(k)}
              </button>
            ))}
          </div>
        </div>
        {copied && <p role="status">{copied}</p>}
        {loading && <p role="status">{t("loading")}</p>}
        {current && result.failed && (
          <p className="notice error" role="alert">
            {t("loadFailed")}{" "}
            <button type="button" className="text-button" onClick={() => setRetry((n) => n + 1)}>
              {t("retry")}
            </button>
          </p>
        )}
        {current && !result.failed && !templates.length && <p className="empty">{t("empty")}</p>}
        {!!templates.length && !shown.length && (
          <p role="status">
            {t("noMatch")}{" "}
            <button type="button" className="text-button" onClick={() => setRole("all")}>
              {t("allRoles")}
            </button>
          </p>
        )}
        <div className="document-grid" aria-busy={loading}>
          {shown.map((d) => (
            <article key={d.id} className="document-card">
              <h3>{d.title}</h3>
              <details name={`${panel}-preview`}>
                <summary>{t("preview")}</summary>
                <div className="document-preview" role="region" aria-label={d.title} tabIndex={0}>
                  {d.text}
                </div>
              </details>
              <div className="row-actions">
                <a className="secondary" href={`/api/document-templates/${d.id}/download`} download>
                  {t("download")}
                </a>
                <button type="button" className="text-button" onClick={() => copy(d)}>
                  {t("copy")}
                </button>
              </div>
            </article>
          ))}
        </div>
        <details className="section-gap">
          <summary>{t("sources")}</summary>
          <ul>
            {sources.map(([name, href]) => (
              <li key={name}>
                <a href={href} target="_blank" rel="noreferrer">
                  {t(`source.${name}`)}
                </a>
              </li>
            ))}
          </ul>
        </details>
        <div className="document-library-footer">
          <button type="button" className="text-button" onClick={close}>
            {t("collapse")}
          </button>
        </div>
      </div>
    </section>
  );
}
