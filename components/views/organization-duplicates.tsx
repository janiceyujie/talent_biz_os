"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { Modal } from "@/components/app/modal";
import { markOrganizationsDistinct, mergeOrganizations, unmarkOrganizationsDistinct } from "@/lib/actions/organizations";
import { duplicateSuggestions, type DuplicateSuggestion } from "@/lib/domain/organizations";
import type { Organization } from "@/lib/types";

const SHOWN = 3; // suggestions before "show all"

/**
 * Organisations that may be one entered twice (decision 0012), strong matches
 * first: merge them, or say they're different so they aren't suggested again.
 */
export function OrganizationDuplicates() {
  const data = useAppData();
  const t = useTranslations("organizations.duplicates");
  const [all, setAll] = useState(false);
  const [merging, setMerging] = useState<DuplicateSuggestion | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const suggestions = duplicateSuggestions(data.organizations, data.contacts, new Set(data.distinctOrganizations));
  if (!suggestions.length) return null;
  const shown = all ? suggestions : suggestions.slice(0, SHOWN);

  return (
    <section className="surface dup-panel" aria-label={t("title")}>
      <header>
        <h2>{t("title", { count: suggestions.length })}</h2>
        <p className="muted">{t("intro")}</p>
      </header>
      <ul>
        {shown.map((s) => (
          <li key={`${s.a.id}|${s.b.id}`}>
            <div className="dup-names">
              <span className={`person-role ${s.strong ? "warn" : ""}`}>{t(s.strong ? "strong" : "possible")}</span>
              <Link href={`/contacts/organizations/${s.a.id}`}>{s.a.name}</Link>
              <span aria-hidden="true">·</span>
              <Link href={`/contacts/organizations/${s.b.id}`}>{s.b.name}</Link>
              <small className="muted">{t(`reason.${s.reason}`, { domain: s.domain ?? "" })}</small>
            </div>
            <div className="dup-actions">
              <button className="secondary" onClick={() => setMerging(s)}>
                {t("merge")}
              </button>
              <button
                className="text-button"
                disabled={pending}
                onClick={() => startTransition(async () => setError(await markOrganizationsDistinct(s.a.id, s.b.id)))}
              >
                {t("notSame")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {suggestions.length > SHOWN && (
        <button className="text-button" onClick={() => setAll(!all)}>
          {all ? t("showFewer") : t("showAll", { count: suggestions.length })}
        </button>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {merging && <MergeDialog suggestion={merging} onDone={() => setMerging(null)} />}
    </section>
  );
}

/** Choose which to keep and its final name; the other's people and projects move to it, and it's deleted. */
function MergeDialog({ suggestion, onDone }: { suggestion: DuplicateSuggestion; onDone: () => void }) {
  const data = useAppData();
  const t = useTranslations("organizations.duplicates");
  const peopleAt = (o: Organization) => data.contacts.filter((c) => c.organizationId === o.id).length;
  // Keep the one with more people by default: fewer links to move.
  const [keep, setKeep] = useState<Organization>(peopleAt(suggestion.b) > peopleAt(suggestion.a) ? suggestion.b : suggestion.a);
  const [name, setName] = useState(keep.name);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const remove = keep.id === suggestion.a.id ? suggestion.b : suggestion.a;

  return (
    <Modal title={t("mergeTitle")} onClose={onDone}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const failure = await mergeOrganizations(keep.id, remove.id, name);
            setError(failure);
            if (!failure) onDone();
          });
        }}
      >
        <fieldset className="choice-list">
          <legend>{t("keepWhich")}</legend>
          {[suggestion.a, suggestion.b].map((o) => (
            <label key={o.id} className="choice">
              <input
                type="radio"
                name="keep"
                checked={keep.id === o.id}
                onChange={() => {
                  setKeep(o);
                  setName(o.name);
                }}
              />
              {o.name} <small className="muted">{t("peopleCount", { count: peopleAt(o) })}</small>
            </label>
          ))}
        </fieldset>
        <label>
          {t("finalName")}
          <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="notice">{t("mergeNote", { remove: remove.name, keep: name.trim() || keep.name, count: peopleAt(remove) })}</p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={onDone}>
            {t("cancel")}
          </button>
          <button type="submit" className="primary" disabled={pending || !name.trim()}>
            {t("mergeButton")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

/** On an organisation's page: the ones it was marked different from, each with an undo. */
export function DistinctFrom({ organizationId }: { organizationId: string }) {
  const data = useAppData();
  const t = useTranslations("organizations.duplicates");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const others = data.distinctOrganizations
    .map((key) => key.split("|"))
    .filter((ids) => ids.includes(organizationId))
    .flatMap((ids) => data.organizations.filter((o) => o.id === ids.find((id) => id !== organizationId)));
  if (!others.length) return null;
  return (
    <section className="distinct-from">
      <h3>{t("distinctTitle")}</h3>
      <ul>
        {others.map((o) => (
          <li key={o.id}>
            <Link href={`/contacts/organizations/${o.id}`}>{o.name}</Link>
            <button
              className="text-button"
              disabled={pending}
              onClick={() => startTransition(async () => setError(await unmarkOrganizationsDistinct(organizationId, o.id)))}
            >
              {t("undo")}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
