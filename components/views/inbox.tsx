"use client";

import { InfoHint } from "@/components/app/info-hint";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type RefObject } from "react";
import { useAppData } from "@/components/app/app-data";
import { ANALYSIS_POLL_MS, PasteDialog } from "@/components/app/paste-dialog";
import { FileText } from "lucide-react";
import { dismissMessage, reanalyzeMessage } from "@/lib/actions/messages";
import { useMoney } from "@/lib/i18n/format";
import { useLabels } from "@/lib/i18n/labels";
import { detailFieldKeys, type AssumptionTopic } from "@/lib/ai/analysis";
import { isFailureCode } from "@/lib/ai/errors";
import { weekdayMismatchOf } from "@/lib/ai/safety";
import type { InboxMessage } from "@/lib/types";
import { MessageReview } from "./message-review";
import { UploadDialog } from "./upload-dialog";

// The review queue: messages the person sent in, each with the model's
// proposal. Nothing becomes a project or a to-do until the person confirms
// it here (docs/architecture.md, "Analysis"; the message is untrusted input).

const firstLine = (text: string) => text.trim().split("\n")[0]?.slice(0, 80) ?? "";

export function InboxView() {
  const data = useAppData();
  const t = useTranslations("inbox");
  const tEyebrow = useTranslations("eyebrow");
  const router = useRouter();
  const params = useSearchParams();
  const format = useFormatter();
  const [pasting, setPasting] = useState(params.get("paste") === "1");
  const [uploading, setUploading] = useState(params.get("upload") === "1");
  const [active, setActive] = useState(params.get("message") ?? ""); // ?message= from a project timeline
  const [showDismissed, setShowDismissed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const visible = data.inbox.filter((m) => showDismissed || m.status !== "dismissed");
  const message = data.inbox.find((m) => m.id === active) ?? visible[0];
  const analyzing = data.inbox.some((m) => m.status === "pending");
  const listHeading = useRef<HTMLHeadingElement>(null);
  const readerHeading = useRef<HTMLHeadingElement>(null);
  const lastMessageButton = useRef<HTMLButtonElement | null>(null);

  // ?paste=1 / ?upload=1 (the header's Import offer here, Today's Upload an offer) open a dialog —
  // also when already on this page, where the address changes without a reload —
  // then leave the address so a reload doesn't open it again.
  useEffect(() => {
    const paste = params.get("paste") === "1";
    const upload = params.get("upload") === "1";
    if (!paste && !upload) return;
    queueMicrotask(() => (paste ? setPasting(true) : setUploading(true)));
    router.replace("/inbox", { scroll: false });
  }, [params, router]);

  // Analysis runs in the background; refresh until it lands.
  useEffect(() => {
    if (!analyzing) return;
    const timer = setInterval(() => router.refresh(), ANALYSIS_POLL_MS);
    return () => clearInterval(timer);
  }, [analyzing, router]);

  return (
    <div className="inbox-workspace">
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>{tEyebrow("intake")}</span>
            <h2>{t("title")} <InfoHint label={t("title")} notes={[t("intro")]} /></h2>
          </div>
          <span className="mock-chip">{t("gmailSoon")}</span>
        </div>

        <p className={data.aiUsage.remaining === 0 ? "notice error" : "muted ai-usage"}>
          {data.aiUsage.remaining === 0 ? t("usageExhausted", { limit: data.aiUsage.limit }) : t("usageRemaining", data.aiUsage)}
        </p>
        <div className="row-actions">
          <button className="primary" disabled={data.preview} onClick={() => setPasting(true)}>
            {t("paste")}
          </button>
          <button className="secondary" disabled={data.preview} onClick={() => setUploading(true)}>
            {t("upload")}
          </button>
        </div>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </section>
      <div className="inbox-layout section-gap">
        <section className="surface padded inbox-messages" aria-label={t("listLabel")}>
          <div className="inbox-list-heading">
            <h2 ref={listHeading} tabIndex={-1}>
              {t("listHeading")}
            </h2>
            <span role="status">{t("listCount", { count: visible.length })}</span>
          </div>
          <label className="check-line">
            <input data-preview-safe="true" type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
            {t("showDismissed")}
          </label>
          {!visible.length && (
            <div className="empty">
              <h3>{t("emptyTitle")}</h3>
              <p>{t("emptyBody")}</p>
            </div>
          )}
          {visible.map((m) => (
            <div className={`mail-item single ${message?.id === m.id ? "is-active" : ""}`} key={m.id}>
              <button
                data-preview-safe="true"
                className={`mail-summary ${message?.id === m.id ? "active" : ""}`}
                aria-pressed={message?.id === m.id}
                onClick={(e) => {
                  lastMessageButton.current = e.currentTarget;
                  setActive(m.id);
                  // On narrow screens the message is below the list: take the reader there.
                  if (window.matchMedia("(max-width: 900px)").matches)
                    requestAnimationFrame(() => {
                      readerHeading.current?.focus({ preventScroll: true });
                      readerHeading.current?.scrollIntoView({ block: "start" });
                    });
                }}
              >
                <small>
                  <StatusChip status={m.status} />
                  {!!m.analysis?.flags.length && <em className="message-status status-flagged">{t("flagChip")}</em>} {t(`channel.${m.channel}`)}
                </small>
                <strong>{m.analysis?.title || fallbackTitle(m, t)}</strong>
                <span className="mail-snippet">{(m.analysis?.summary || m.body || m.files.map((f) => f.filename).join(", ")).slice(0, 110)}</span>
                <span className="mail-summary-meta">
                  <time dateTime={m.receivedAt}>{format.dateTime(new Date(m.receivedAt), { month: "short", day: "numeric" })}</time>
                  {m.status === "confirmed" && m.projectId && <span>{t("filedChip")}</span>}
                </span>
              </button>
            </div>
          ))}
        </section>
        <section className="surface padded inbox-reader" aria-label={t("readerLabel")}>
          {message ? (
            <>
              <button
                data-preview-safe="true"
                className="secondary inbox-back"
                onClick={() => {
                  const target = lastMessageButton.current?.isConnected ? lastMessageButton.current : listHeading.current;
                  target?.focus({ preventScroll: true });
                  target?.scrollIntoView({ block: "center" });
                }}
              >
                {t("backToList")}
              </button>
              <MessageDetail key={message.id} message={message} headingRef={readerHeading} />
            </>
          ) : (
            <p className="empty">{t("pick")}</p>
          )}
        </section>
      </div>
      {pasting && !data.preview && (
        <PasteDialog
          onClose={() => setPasting(false)}
          onSubmitted={(id, duplicate) => {
            setPasting(false);
            setActive(id);
            if (duplicate) setShowDismissed(true); // the earlier copy may have been dismissed
            setNotice(duplicate ? t("duplicate") : null);
          }}
        />
      )}
      {uploading && !data.preview && (
        <UploadDialog
          onClose={() => setUploading(false)}
          onSubmitted={(id, duplicate) => {
            setUploading(false);
            setActive(id);
            if (duplicate) setShowDismissed(true);
            setNotice(duplicate ? t("duplicate") : null);
          }}
        />
      )}
    </div>
  );
}

/** Why an analysis failed, in the person's language; older messages stored the provider's own words. */
function failureText(failure: string | null, t: ReturnType<typeof useTranslations<"inbox">>) {
  return isFailureCode(failure) ? t(`failure.${failure}`) : (failure ?? "");
}

/** A message's title before or without an analysis: its first line, or how many files it has. */
function fallbackTitle(m: InboxMessage, t: ReturnType<typeof useTranslations<"inbox">>) {
  return firstLine(m.body) || (m.files.length ? t("filesCount", { count: m.files.length }) : t("untitled"));
}

function StatusChip({ status }: { status: InboxMessage["status"] }) {
  const t = useTranslations("inbox.status");
  return <em className={`message-status status-${status}`}>{t(status)}</em>;
}


function MessageDetail({ message, headingRef }: { message: InboxMessage; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const t = useTranslations("inbox");
  const labels = useLabels();
  const format = useFormatter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<string | null>) => startTransition(async () => setError(await action()));
  const a = message.analysis;
  const preview = useTranslations("preview");
  const analyzed = !!a && message.status !== "pending";
  const data = useAppData();
  const filedOn = message.projectId ? data.projects.find((p) => p.id === message.projectId) : undefined;

  // Read, then decide (docs/design/intake-to-project.md, screen 1): a short summary and the files up
  // top, then which project it belongs to and what it changes; the AI's full reading and the original
  // text are one click away.
  return (
    <>
      <div className="mail-tags">
        <StatusChip status={message.status} />
        {analyzed && <em className="message-status intent-chip">{labels.intent(a.intent)}</em>}
      </div>
      <h2 ref={headingRef} tabIndex={-1}>
        {a?.title || fallbackTitle(message, t)}
      </h2>
      <dl className="mail-metadata">
        <div>
          <dt>{t("source")}</dt>
          <dd>{t(`channel.${message.channel}`)}</dd>
        </div>
        <div>
          <dt>{t("receivedAt")}</dt>
          <dd>
            <time dateTime={message.receivedAt}>
              {format.dateTime(new Date(message.receivedAt), { dateStyle: "medium", timeStyle: "short", timeZone: data.talent.timeZone })}
            </time>{" "}
            · {data.talent.timeZone}
          </dd>
        </div>
        {filedOn && (
          <div>
            <dt>{t("filedOn")}</dt>
            <dd>
              {filedOn.title} · {labels.stage(filedOn.stage)}
            </dd>
          </div>
        )}
      </dl>

      {message.status === "pending" && <p className="notice analyzing">{t("pendingBody")}</p>}
      {message.status === "error" && (
        <p className="notice error" role="alert">
          {t("failed", { reason: failureText(message.failure, t) })}
        </p>
      )}
      {a && message.status === "analyzed" && a.intent === "other" && a.confidence < 0.5 && (
        <p className="notice" role="note">
          {t("notWork")}
        </p>
      )}
      {analyzed && <Flags analysis={a} />}
      {analyzed && a.summary && <p className="message-summary">{a.summary}</p>}

      {message.files.length > 0 && (
        <div className="message-files" aria-label={t("files")}>
          {message.files.map((f) => (
            <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noopener" aria-label={t("openFile", { name: f.filename })}>
              {f.contentType.startsWith("image/") && !f.contentType.includes("hei") ? (
                // eslint-disable-next-line @next/next/no-img-element -- an authenticated, private file; next/image can't optimize it
                <img src={`/api/files/${f.id}`} alt={f.filename} loading="lazy" />
              ) : (
                <span className="file-tile">
                  <FileText size={26} aria-hidden="true" />
                  {f.filename}
                </span>
              )}
            </a>
          ))}
        </div>
      )}

      {data.preview&&<p className="notice">{preview("readOnly")}</p>}
      {!data.preview && message.status === "analyzed" && a && <MessageReview key={a.promptVersion + a.modelVersion} message={message} />}
      {message.status === "confirmed" && message.projectId && (
        <div className="row-actions section-gap">
          <Link className="primary" href={`/projects?id=${message.projectId}`}>
            {t("viewProject")}
          </Link>
        </div>
      )}

      <div className="message-more">
        {analyzed && (
          <details className="original-message">
            <summary>{data.preview ? preview("analysis") : a.assumptions.length ? t("factsWithAssumptions", { count: a.assumptions.length }) : t("facts")}</summary>
            <AnalysisView analysis={a} />
          </details>
        )}
        {a?.transcriptWithheld && <p className="muted">{t("transcriptWithheld")}</p>}
        {a?.transcript && (
          <details className="original-message">
            <summary>{t("transcript")}</summary>
            <p className="prewrap mail-body">{a.transcript}</p>
          </details>
        )}
        {message.body && (
          <details className="original-message" open={!a}>
            <summary>{t("original")}</summary>
            <p className="prewrap mail-body">{message.body}</p>
          </details>
        )}
      </div>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="row-actions section-gap">
        {(message.status === "analyzed" || message.status === "error") && (
          <button className="secondary" disabled={pending || data.preview} onClick={() => run(() => reanalyzeMessage(message.id))}>
            {t("reanalyze")}
          </button>
        )}
        {(message.status === "analyzed" || message.status === "error") && (
          <button className="text-button" disabled={pending || data.preview} onClick={() => run(() => dismissMessage(message.id, true))}>
            {t("dismiss")}
          </button>
        )}
        {message.status === "dismissed" && (
          <button className="secondary" disabled={pending || data.preview} onClick={() => run(() => dismissMessage(message.id, false))}>
            {t("restore")}
          </button>
        )}
      </div>
    </>
  );
}

/** Warnings stay at the top, above anything the person might act on (decision 0007). */
function Flags({ analysis: a }: { analysis: NonNullable<InboxMessage["analysis"]> }) {
  const t = useTranslations("inbox");
  const labels = useLabels();
  const format = useFormatter();
  if (!a.flags.length) return null;
  return (
    <div className="notice analysis-flags" role="alert">
      <strong>{t("flagsTitle")}</strong>
      <ul>
        {a.flags.map((f, i) => {
          // The weekday check knows exactly what's wrong; say it rather than the general label.
          const weekday = f.kind === "inconsistency" && f.source === "check" ? weekdayMismatchOf(a.dates, f.asStated) : null;
          const day = (n: number) => format.dateTime(new Date(Date.UTC(2026, 1, 1 + n, 12)), { weekday: "long", timeZone: "UTC" }); // 2026-02-01 is a Sunday
          return (
            <li key={i}>
              {weekday
                ? t("weekdayMismatch", {
                    date: format.dateTime(new Date(`${weekday.date}T12:00:00Z`), { month: "numeric", day: "numeric", timeZone: "UTC" }),
                    actual: day(weekday.actual),
                    stated: day(weekday.stated),
                  })
                : labels.flag(f.kind)}
              {f.note && <span className="flag-note"> {f.note}</span>}
              {f.asStated && <small className="muted stated">{t("statedAs", { text: f.asStated })}</small>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AnalysisView({ analysis: a }: { analysis: NonNullable<InboxMessage["analysis"]> }) {
  const t = useTranslations("inbox");
  const labels = useLabels();
  const money = useMoney();
  const fee =
    a.money.amount === null
      ? ""
      : `${a.money.currency === "TWD" || !a.money.currency ? money(a.money.amount) : `${a.money.currency} ${a.money.amount}`}${
          a.money.taxIncluded === null ? "" : ` (${a.money.taxIncluded ? t("taxIncluded") : t("taxExcluded")})`
        }`;
  // [label, value, the words it came from, which assumptions belong under it]
  const rows: [string, string, string, AssumptionTopic | null][] = [
    [t("field.intent"), labels.intent(a.intent), "", "intent"],
    [t("field.type"), labels.projectType(a.projectType), "", "projectType"],
    [t("field.counterparty"), [a.counterparty.name, a.counterparty.company].filter(Boolean).join(" · "), "", "counterparty"],
    [t("field.contact"), [a.counterparty.email, a.counterparty.phone].filter(Boolean).join(" · "), "", null],
    [t("field.money"), fee || a.money.asStated, fee ? a.money.asStated : "", "money"],
    [t("field.paymentTerms"), a.paymentTerms, "", null],
    [t("field.replyBy"), a.replyBy, a.replyByStated, "replyBy"],
    ...detailFieldKeys(a)
      .filter((key) => a.details[key])
      .map((key): [string, string, string, AssumptionTopic | null] => [
        labels.detailField(a.projectType, key),
        a.details[key].value,
        a.details[key].asStated,
        null,
      ]),
  ];
  // Assumptions show under the value they affect; the rest in their own list.
  const shown = new Set<AssumptionTopic>(rows.filter(([, value, , topic]) => value && topic).map(([, , , topic]) => topic!));
  if (a.dates.length) shown.add("dates");
  const assumed = (topic: AssumptionTopic) =>
    a.assumptions
      .filter((x) => x.about === topic)
      .map((x, i) => (
        <small key={i} className="assumed">
          {t("assumed", { note: x.note })}
        </small>
      ));
  const otherAssumptions = a.assumptions.filter((x) => !shown.has(x.about));
  return (
    <div className="message-analysis">
      <dl>
        {rows
          .filter(([, value]) => value)
          .map(([label, value, stated, topic]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {value}
                {stated && stated !== value && <small className="muted stated">{t("statedAs", { text: stated })}</small>}
                {topic && assumed(topic)}
              </dd>
            </div>
          ))}
        {a.dates.length > 0 && (
          <div>
            <dt>{t("field.dates")}</dt>
            <dd>
              <ul>
                {a.dates.map((d, i) => (
                  <li key={i}>
                    {d.what}: {[d.date, d.time, d.timeZone].filter(Boolean).join(" ") || d.asStated}
                    {d.date && d.asStated && <small className="muted stated">{t("statedAs", { text: d.asStated })}</small>}
                  </li>
                ))}
              </ul>
              {assumed("dates")}
            </dd>
          </div>
        )}
      </dl>
      {a.asks.length > 0 && (
        <>
          <h3>{t("asks")}</h3>
          <ul>
            {a.asks.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      )}
      {a.missing.length > 0 && (
        <>
          <h3>{t("missing")}</h3>
          <ul>
            {a.missing.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      )}
      {otherAssumptions.length > 0 && (
        <>
          <h3>{t("assumptions")}</h3>
          <ul className="assumption-list">
            {otherAssumptions.map((x, i) => (
              <li key={i}>{x.note}</li>
            ))}
          </ul>
        </>
      )}
      <p className="muted ai-note">{t("aiNote", { confidence: Math.round(a.confidence * 100), model: a.modelVersion })}</p>
    </div>
  );
}
