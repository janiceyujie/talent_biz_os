"use client";

// A project's messages and what each changed (docs/design/intake-to-project.md,
// screen 3), and its contract versions.
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useAppData } from "@/components/app/app-data";
import type { ChangeRecord } from "@/lib/domain/intake";
import { useMoney } from "@/lib/i18n/format";
import { TermDiff } from "./message-review";
import { useLabels } from "@/lib/i18n/labels";
import type { ProjectDate, ProjectSummary, TimelineEntry } from "@/lib/types";

/** One line per change: the label, then old → new (e.g. the fee "$30,000 → $35,000"). */
function useDescribe(project: ProjectSummary) {
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

/** The project's messages, newest first, as fetched with its detail (components/app/project-detail.ts). */
export function ProjectTimeline({ project, entries }: { project: ProjectSummary; entries: TimelineEntry[] }) {
  const t = useTranslations("timeline");
  const format = useFormatter();
  const describe = useDescribe(project);

  return (
    <section className="project-timeline" aria-label={t("heading")}>
      {!entries.length && <p className="muted">{t("empty")}</p>}
      <ol>
        {entries.map((e) => {
          const applied = [
            // A ticked stage item is in `applied`; an answered stage question only in `stage`.
            ...(e.stage && !e.applied.some((c) => c.kind === "stage") ? [describe({ id: "stage", kind: "stage", ticked: true, asStated: "", ...e.stage })] : []),
            ...e.applied.map(describe),
          ];
          // One line per message; what it changed opens on demand.
          return (
            <li key={e.messageId}>
              <details>
                <summary>
                  <time dateTime={e.receivedAt}>{format.dateTime(new Date(e.receivedAt), { dateStyle: "medium" })}</time>
                  <strong>{e.title}</strong>
                  {applied.length > 0 && <span className="tag">{t("changes", { count: applied.length })}</span>}
                </summary>
                {e.summary && <p className="muted">{e.summary}</p>}
                {e.created && <p className="timeline-applied">{t("created")}</p>}
                {applied.length > 0 && (
                  <div className="timeline-applied">
                    {t("applied")}
                    <ul>
                      {applied.map((line, i) => (
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
                <Link href={`/inbox?message=${e.messageId}`}>{t("original")}</Link>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The project's contract versions, newest first, each with what changed. */
export function ContractVersions({ project }: { project: ProjectSummary }) {
  const data = useAppData();
  const t = useTranslations("timeline");
  const format = useFormatter();
  const versions = data.contracts.filter((c) => c.projectId === project.id);
  if (!versions.length) return null;
  return (
    <section className="contract-versions" aria-label={t("contracts")}>
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
