"use client";

// A project's messages and what each changed (docs/design/intake-to-project.md,
// screen 3), plus what messages filled in that the form doesn't show: the
// type's fields, dates kept before signing, and the to-confirm list.
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useAppData } from "@/components/app/app-data";
import type { ChangeRecord } from "@/lib/domain/intake";
import { projectField, keptFields } from "@/lib/domain/intake";
import { useMoney } from "@/lib/i18n/format";
import { TermDiff } from "./message-review";
import { useLabels } from "@/lib/i18n/labels";
import type { Project, ProjectDate } from "@/lib/types";

/** One line per change: "報價 $30,000 → $35,000". */
function useDescribe(project: Project) {
  const t = useTranslations("intake");
  const labels = useLabels();
  const money = useMoney();
  const data = useAppData();
  const when = (d: ProjectDate | null) => (d ? [d.what, d.date, d.time].filter(Boolean).join(" ") : "");
  const arrow = (from: string, to: string) => (from ? `${from} → ${to}` : to);
  return (c: ChangeRecord): string => {
    switch (c.kind) {
      case "fee":
        return `${t("change.fee")} ${arrow(c.from === null ? "" : money(c.from), money(c.to))}`;
      case "field":
        return `${labels.detailField(project.type, c.key)} ${arrow(c.from, c.to)}`;
      case "contractNotes":
        return t("change.contractNotes");
      case "date":
        return `${c.from ? t("change.date") : t("change.newDate")} ${arrow(c.from && when(c.from) !== when(c.to) ? when(c.from) : "", when(c.to))}`;
      case "stage":
        return `${t("change.stage")} ${arrow(labels.stage(c.from), labels.stage(c.to))}`;
      case "settlePayment":
        return `${t("change.settlePayment", { label: data.payments.find((p) => p.id === c.paymentId)?.label ?? "" })} ${t("received")} ${money(c.amount)}`;
      case "newPayment":
        return `${c.label === "received" ? t("change.newPaymentReceived") : t("change.newPaymentCancellationFee")} ${money(c.amount)}`;
      case "paymentNote":
        return t("change.paymentNote", { label: data.payments.find((p) => p.id === c.paymentId)?.label ?? "" });
      case "todo":
        return `${t(c.purpose === "reply" ? "change.todoReply" : c.purpose === "awaitContract" ? "change.todoAwaitContract" : "change.todoSendInvoice")} ${c.dueDate}`;
      case "toConfirm":
        return `${t("change.toConfirm")}：${c.items.join("、")}`;
      case "contractVersion":
        return t("change.contractVersion", { version: c.version }) + (c.status === "signed" ? ` · ${t("contractSigned")}` : "");
    }
  };
}

export function ProjectTimeline({ project }: { project: Project }) {
  const data = useAppData();
  const t = useTranslations("timeline");
  const format = useFormatter();
  const describe = useDescribe(project);
  const entries = data.timeline.filter((e) => e.projectId === project.id);

  return (
    <section className="project-timeline" aria-label={t("heading")}>
      <h3>{t("heading")}</h3>
      {!entries.length && <p className="muted">{t("empty")}</p>}
      <ol>
        {entries.map((e) => (
          <li key={e.messageId}>
            <time dateTime={e.receivedAt}>{format.dateTime(new Date(e.receivedAt), { dateStyle: "medium", timeStyle: "short" })}</time>
            <strong>{e.title}</strong>
            {e.summary && <p className="muted">{e.summary}</p>}
            {e.created && <p className="timeline-applied">{t("created")}</p>}
            {(e.applied.length > 0 || e.stage) && (
              <div className="timeline-applied">
                {t("applied")}
                <ul>
                  {[
                    // A ticked stage item is in `applied`; an answered stage question only in `stage`.
                    ...(e.stage && !e.applied.some((c) => c.kind === "stage") ? [describe({ id: "stage", kind: "stage", ticked: true, asStated: "", ...e.stage })] : []),
                    ...e.applied.map(describe),
                  ].map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            {e.left.length > 0 && (
              <div className="timeline-left">
                {t("left")}
                <ul>
                  {e.left.map((c, i) => (
                    <li key={i}>{describe(c)}</li>
                  ))}
                </ul>
              </div>
            )}
            {!e.recorded && <p className="muted">{t("filedOnly")}</p>}
            <Link href={`/inbox?message=${e.messageId}`}>{t("original")}</Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** What messages filled in on the project beyond the form: type fields, dates, the to-confirm list. */
export function ProjectFacts({ project }: { project: Project }) {
  const t = useTranslations("timeline");
  const labels = useLabels();
  const fields = keptFields(project.type)
    .filter((k) => !["deliverables", "usageRights", "travel"].includes(k)) // shown in the deal summary
    .map((k) => [labels.detailField(project.type, k), projectField(project, k)] as const)
    .filter(([, v]) => v);
  const dates = project.details.dates ?? [];
  const asks = project.details.toConfirm ?? [];
  if (!fields.length && !dates.length && !asks.length) return null;
  return (
    <section className="project-facts" aria-label={t("facts")}>
      {(fields.length > 0 || dates.length > 0) && (
        <dl>
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          {dates.map((d, i) => (
            <div key={`date-${i}`}>
              <dt>{d.what || t("date")}</dt>
              <dd>{[d.date, d.time].filter(Boolean).join(" ")}</dd>
            </div>
          ))}
        </dl>
      )}
      {asks.length > 0 && (
        <div>
          <h4>{t("toConfirm")}</h4>
          <ul>
            {asks.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** The project's contract versions, newest first, each with what changed. */
export function ContractVersions({ project }: { project: Project }) {
  const data = useAppData();
  const t = useTranslations("timeline");
  const format = useFormatter();
  const versions = data.contracts.filter((c) => c.projectId === project.id);
  if (!versions.length) return null;
  return (
    <section className="contract-versions" aria-label={t("contracts")}>
      <h3>{t("contracts")}</h3>
      <ol>
        {versions.map((c) => (
          <li key={c.id} className={c.status === "void" ? "void" : ""}>
            <strong>{t("version", { version: c.version })}</strong> · {t(`contractStatus.${c.status}`)} ·{" "}
            <time dateTime={c.createdAt}>{format.dateTime(new Date(c.createdAt), { dateStyle: "medium" })}</time>
            <TermDiff diff={c.diff} against={c.against} same={false} type={project.type} />
            {c.messageId && <Link href={`/inbox?message=${c.messageId}`}>{t("original")}</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}
