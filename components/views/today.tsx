"use client";

// Today: a welcome for a new workspace, then the overview's widgets
// (components/overview). The date sits beside the page title.
import Link from "next/link";
import { InfoHint } from "@/components/app/info-hint";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { RecordEditor, type Editor } from "@/components/app/record-editor";
import { Overview } from "@/components/overview/overview";
import { dateInZone } from "@/lib/domain/dates";

/** The date for the page title, in the talent's zone. */
export function TodayDate() {
  const data = useAppData();
  const format = useFormatter();
  const today = data.previewDate ?? dateInZone(data.talent.timeZone);
  return (
    <span className="page-subtitle">
      {format.dateTime(new Date(`${today}T12:00:00Z`), { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" })}
    </span>
  );
}

export function TodayView() {
  const data = useAppData();
  const t = useTranslations("today");
  const tEyebrow = useTranslations("eyebrow");
  const [editor, setEditor] = useState<Editor | null>(null);

  return (
    <>
      {!data.projects.length && !data.contacts.length && (
        <section className="surface welcome-card">
          <span>{tEyebrow("welcome")}</span>
          <h2>{t("welcomeTitle")} <InfoHint label={t("welcomeTitle")} notes={[t("welcomeBody")]} /></h2>
          <div className="row-actions">
            <button className="primary" onClick={() => setEditor({ kind: "project" })}>
              {t("createFirstProject")}
            </button>
            <Link className="secondary" href="/inbox?upload=1">
              {t("uploadOffer")}
            </Link>
          </div>
        </section>
      )}
      <Overview />
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
