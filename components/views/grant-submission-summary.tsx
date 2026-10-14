"use client";
import { useTranslations } from "next-intl";
import { InfoHint } from "@/components/app/info-hint";
import { grantSubmissionTask } from "@/lib/grants/submission";
import type { GrantApplication } from "@/lib/grants/types";

export function GrantSubmissionSummary({application, compact = false, onSchedule}: {
  application: GrantApplication; compact?: boolean; onSchedule?: () => void;
}) {
  const t = useTranslations("grants");
  const task = grantSubmissionTask(application.tasks);
  const label = t(task?.status === "done" ? "submissionTaskDone" : "plannedSubmission");
  if (compact) return <span className="grant-submission-compact">
    <span>{label}</span>
    <span>{task ? <><time dateTime={`${task.date}${task.time ? `T${task.time}` : ""}`}>{task.date}{task.time && ` ${task.time}`}</time><span className="sr-only"> · {task.timeZone}</span></> : t("submissionNotScheduled")}</span>
  </span>;
  return <div className="grant-submission-summary" aria-label={label}>
    <div className="grant-section-title"><span>{label}</span><InfoHint label={label} notes={[t("submissionPlanHint")]}/></div>
    {task ? <div className="grant-submission-value"><time dateTime={`${task.date}${task.time ? `T${task.time}` : ""}`}>{task.date}{task.time && ` ${task.time}`}</time><InfoHint label={t("timeZone")} notes={[task.timeZone]}/></div>
      : <button type="button" className="text-button" onClick={onSchedule}>{t("scheduleSubmission")}</button>}
  </div>;
}
