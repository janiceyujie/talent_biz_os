"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { Modal } from "@/components/app/modal";
import { calendarRecord } from "@/components/app/record-editor";
import { saveCalendarItem } from "@/lib/actions/calendar";
import { suggestProject } from "@/lib/calendar/google/two-way";
import { isSigned } from "@/lib/domain/phases";
import type { CalendarItem } from "@/lib/types";

/**
 * Add to a project, for an event without one (decision 0017): every project it may go on (signed,
 * not archived, decision 0004), the likely one first and marked Suggested when it's clear. No reason
 * is given; ignoring the suggestion is fine.
 */
export function ProjectPicker({ item, onClose, onDone }: { item: CalendarItem; onClose: () => void; onDone?: (message: string) => void }) {
  const data = useAppData();
  const t = useTranslations("projectPicker");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = data.projects.filter((p) => !p.archived && isSigned(p.stage));
  // Worked out when it came from Google (with who was invited); otherwise a name in its title.
  const suggested =
    (item.suggestedProjectId && open.some((p) => p.id === item.suggestedProjectId) ? item.suggestedProjectId : null) ??
    suggestProject({ title: item.title }, open.map((p) => ({ id: p.id, names: [p.title, p.counterparty] })));
  const q = query.trim().toLowerCase();
  const list = open
    .filter((p) => !q || `${p.title} ${p.counterparty}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.id === suggested) - Number(a.id === suggested));

  const pick = (projectId: string, title: string) =>
    startTransition(async () => {
      const failure = await saveCalendarItem({ ...calendarRecord(item), projectId });
      if (failure) return setError(failure);
      onDone?.(t("added", { project: title }));
      onClose();
    });

  return (
    <Modal title={t("title")} onClose={onClose} narrow>
      {open.length ? (
        <div className="project-picker">
          <input type="search" autoFocus placeholder={t("search")} aria-label={t("search")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul>
            {list.map((p) => (
              <li key={p.id}>
                <button className={p.id === suggested ? "is-suggested" : ""} disabled={pending} onClick={() => pick(p.id, p.title)}>
                  <span>
                    {p.title}
                    {p.counterparty && <small> · {p.counterparty}</small>}
                  </span>
                  {p.id === suggested && <em>{t("suggested")}</em>}
                </button>
              </li>
            ))}
          </ul>
          {!list.length && <p className="muted">{t("noMatch")}</p>}
        </div>
      ) : (
        <p className="muted">{t("none")}</p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
