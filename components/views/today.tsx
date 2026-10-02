"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { RecordEditor, type Editor } from "@/components/app/record-editor";
import { dateInZone } from "@/lib/domain/dates";
import { money } from "@/lib/domain/money";
import { isActiveProject, notifications, summarize } from "@/lib/domain/workflow";
import { openStages, stageLabels } from "@/lib/labels";
import { AssistantView } from "./assistant";
import { Metric, Revenue } from "./finance";

export function TodayView() {
  const data = useAppData();
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
          <h2>從第一個邀約開始。</h2>
          <p>建立合作案、保存你慣用的回覆，或上傳一封邀約讓系統幫你整理。</p>
          <div className="row-actions">
            <button className="primary" onClick={() => setEditor({ kind: "project" })}>
              建立第一個合作案
            </button>
            <Link className="secondary" href="/inbox">
              上傳邀約
            </Link>
          </div>
        </section>
      )}
      <section className="metrics-grid">
        <Metric label="待收款 · TWD" value={money(summary.receivable)} note="依已登錄的待收款計算" tone="dark" />
        <Metric label="進行中的合作案" value={String(live.filter(isActiveProject).length)} note="依保存的案件階段計算" />
        <Metric
          label="今日未完成事項"
          value={String(data.calendar.filter((c) => !c.archived && !c.done && c.date === today).length)}
          note={`${today} · ${data.talent.timeZone}`}
        />
        <Metric label="通知" value={String(alerts.length)} note="期限、待辦與逾期款項" tone="lime" />
      </section>
      <div className="dashboard-grid">
        <section className="surface action-list">
          <div className="section-header">
            <div>
              <span>Next actions</span>
              <h2>近期需要處理</h2>
            </div>
            <Link href="/calendar">查看行程</Link>
          </div>
          {alerts.slice(0, 5).map((n, i) => (
            <button className="action-row" key={n.id} onClick={() => router.push(n.href)}>
              <span className={`priority p-${i + 1}`}>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <strong>{n.title}</strong>
                <small>{n.detail}</small>
              </div>
            </button>
          ))}
          {!alerts.length && <p className="empty">目前沒有近期到期事項。新增待辦後會出現在這裡。</p>}
        </section>
        <AssistantView compact />
      </div>
      <div className="analytics-grid">
        <Revenue data={data} />
        <section className="surface pipeline-card">
          <div className="section-header">
            <div>
              <span>Deal pipeline</span>
              <h2>案件分布</h2>
            </div>
            <Link href="/projects">查看案件</Link>
          </div>
          <div className="pipeline-bars">
            {[...openStages, "closed" as const].map((stage) => {
              const count = live.filter((p) => p.stage === stage).length;
              return (
                <div key={stage}>
                  <span>{stageLabels[stage]}</span>
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
