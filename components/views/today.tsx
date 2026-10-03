"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { RecordEditor, type Editor } from "@/components/app/record-editor";
import { dateInZone } from "@/lib/domain/dates";
import { useMoney } from "@/lib/i18n/format";
import { isActiveProject, notifications, summarize } from "@/lib/domain/workflow";
import { useLabels } from "@/lib/i18n/labels";
import { openStages } from "@/lib/labels";
import { useNotificationText } from "@/components/app/notification-text";
import { AssistantView } from "./assistant";
import { Metric, Revenue } from "./finance";

export function TodayView() {
  const data = useAppData();
  const t = useTranslations("today");
  const labels = useLabels();
  const money = useMoney();
  const notificationText = useNotificationText();
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const summary = summarize(data);
  const alerts = notifications(data);
  const today = dateInZone(data.talent.timeZone);
  const live = data.projects.filter((p) => !p.archived);

  return (
    <>
      {!data.projects.length && !data.contacts.length && (
        <section className="surface welcome-card">
          <span>WELCOME TO YOUR WORKSPACE</span>
          <h2>{t("welcomeTitle")}</h2>
          <p>{t("welcomeBody")}</p>
          <div className="row-actions">
            <button className="primary" onClick={() => setEditor({ kind: "project" })}>
              {t("createFirstProject")}
            </button>
            <Link className="secondary" href="/inbox">
              {t("uploadOffer")}
            </Link>
          </div>
        </section>
      )}
      <section className="metrics-grid">
        <Metric label={t("metricReceivable")} value={money(summary.receivable)} note={t("metricReceivableNote")} tone="dark" />
        <Metric label={t("metricActive")} value={String(live.filter(isActiveProject).length)} note={t("metricActiveNote")} />
        <Metric
          label={t("metricToday")}
          value={String(data.calendar.filter((c) => !c.archived && !c.done && c.date === today).length)}
          note={`${today} · ${data.talent.timeZone}`}
        />
        <Metric label={t("metricNotices")} value={String(alerts.length)} note={t("metricNoticesNote")} tone="lime" />
      </section>
      <div className="dashboard-grid">
        <section className="surface action-list">
          <div className="section-header">
            <div>
              <span>Next actions</span>
              <h2>{t("nextActions")}</h2>
            </div>
            <Link href="/calendar">{t("viewCalendar")}</Link>
          </div>
          {alerts.slice(0, 5).map((n, i) => {
            const text = notificationText(n);
            return (
              <button className="action-row" key={n.id} onClick={() => router.push(n.href)}>
                <span className={`priority p-${i + 1}`}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{text.title}</strong>
                  <small>{text.detail}</small>
                </div>
              </button>
            );
          })}
          {!alerts.length && <p className="empty">{t("nextActionsEmpty")}</p>}
        </section>
        <AssistantView compact />
      </div>
      <div className="analytics-grid">
        <Revenue data={data} />
        <section className="surface pipeline-card">
          <div className="section-header">
            <div>
              <span>Deal pipeline</span>
              <h2>{t("pipeline")}</h2>
            </div>
            <Link href="/projects">{t("viewProjects")}</Link>
          </div>
          <div className="pipeline-bars">
            {[...openStages, "closed" as const].map((stage) => {
              const count = live.filter((p) => p.stage === stage).length;
              return (
                <div key={stage}>
                  <span>{labels.stage(stage)}</span>
                  <div>
                    <i style={{ width: `${(count / Math.max(1, live.length)) * 100}%` }} />
                  </div>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
