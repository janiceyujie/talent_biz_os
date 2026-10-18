"use client";

import { InboxReaderLayout } from "@/components/app/inbox-reader-layout";
import { InfoHint } from "@/components/app/info-hint";

import Link from "next/link";
import { PageLoader, useCursorPages } from "@/components/app/cursor-pages";
import { useInboxDetail } from "@/components/app/inbox-detail";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useAppData } from "@/components/app/app-data";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { MoreMenu } from "./more-menu";
import { ANALYSIS_POLL_MS, PasteDialog } from "@/components/app/paste-dialog";
import { FileText, TriangleAlert } from "lucide-react";
import { markNotWork, markSureWork } from "@/lib/actions/mail";
import { dismissMessage, reanalyzeMessage } from "@/lib/actions/messages";
import { useMoney } from "@/lib/i18n/format";
import { useLabels } from "@/lib/i18n/labels";
import { detailFieldKeys, type AssumptionTopic } from "@/lib/ai/analysis";
import { isFailureCode } from "@/lib/ai/errors";
import { weekdayMismatchOf } from "@/lib/ai/safety";
import { previewIntakeItems, previewIntakeTab, type PreviewIntakeTab } from "@/lib/domain/preview-intake";
import type { InboxMessage, InboxSummary } from "@/lib/types";
import { GmailMail, GmailSync, IntakeTabs, type IntakeTab } from "./gmail-intake";
import { MessageReview } from "./message-review";
import { UploadDialog } from "./upload-dialog";

// The review queue: messages the person sent in, each with the model's
// proposal. Nothing becomes a project or a to-do until the person confirms
// it here (docs/architecture.md, "Analysis"; the message is untrusted input).

const firstLine = (text: string) => text.trim().split("\n")[0]?.slice(0, 80) ?? "";

export function InboxView() {
  const data = useAppData();
  return <InboxWorkspace key={`${data.talent.id}:${!!data.preview}`} />;
}
function InboxWorkspace() {
  const data = useAppData();
  const t = useTranslations("inbox");
  const tGmail = useTranslations("gmail");
  const tDemo = useTranslations("intakeDemo");
  const router = useRouter();
  const params = useSearchParams();
  const format = useFormatter();
  const [pasting, setPasting] = useState(params.get("paste") === "1");
  const [uploading, setUploading] = useState(params.get("upload") === "1");
  const [active, setActive] = useState(params.get("message") ?? ""); // ?message= from a project timeline
  const [tab, setTab] = useState<IntakeTab>("messages");
  const [showDismissed, setShowDismissed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pages = useCursorPages<InboxSummary>(`/api/inbox?dismissed=${showDismissed}`, data.talent.id, data.inboxOverview?.revision, !data.preview);
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, PreviewIntakeTab>>({});
  const demoItems = data.preview ? previewIntakeItems(data.inbox, tDemo) : [];
  const preview = demoItems.filter(item => previewIntakeTab(item, previewOverrides) === tab).map(item => item.message)
    .filter(m => showDismissed || m.status !== "dismissed");
  const previewCounts = { messages: 0, waiting: 0, skipped: 0 };
  for (const item of demoItems) {
    const category = previewIntakeTab(item, previewOverrides);
    if (category !== "messages" || ["analyzed", "error"].includes(item.message.status)) previewCounts[category]++;
  }
  const movePreview = (id: string, destination: PreviewIntakeTab) => {
    if (!data.preview || !demoItems.some(item => item.message.id === id)) return;
    setPreviewOverrides(current => ({ ...current, [id]: destination }));
    setTab(destination);
    setActive(id);
    setNotice(tDemo("moved", { tab: tGmail(destination === "messages" ? "tabMessages" : destination === "waiting" ? "tabWaiting" : "tabSkipped") }));
  };
  const visible: InboxSummary[] = data.preview ? preview.map(m => ({ ...m, title: m.analysis?.title || fallbackTitle(m, t),
    snippet: (m.analysis?.summary || m.body || m.files.map(f => f.filename).join(", ")).slice(0, 110), flagged: !!m.analysis?.flags.length, fileCount: m.files.length })) : pages.items;
  const selectedId = active;
  const detail = useInboxDetail(selectedId, data.talent.id, data.inboxOverview?.revision ?? "", !data.preview);
  const message = data.preview ? demoItems.find(item => item.message.id === selectedId)?.message : detail.message;
  const analyzing = data.inboxOverview ? data.inboxOverview.counts.pending > 0 : data.inbox.some(m => m.status === "pending");
  const tPage = useTranslations("pagination");
  const requestedId = params.get("message") ?? "";
  useEffect(() => { if (requestedId) queueMicrotask(() => {setActive(requestedId);setTab("messages");}); }, [requestedId]);

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
    if (data.preview || !analyzing) return;
    const timer = setInterval(() => router.refresh(), ANALYSIS_POLL_MS);
    return () => clearInterval(timer);
  }, [analyzing, data.preview, router]);

  const renderCard = (m: InboxSummary) => (
    <div className={`mail-item single ${selectedId === m.id ? "is-active" : ""}`} key={m.id}>
      <button
        data-preview-safe="true"
        className={`mail-summary ${selectedId === m.id ? "active" : ""}`}
        aria-pressed={selectedId === m.id}
        onClick={() => setActive(m.id)}
      >
        <small>
          {data.preview && tab !== "messages" ? <em className="message-status">{tGmail(tab === "waiting" ? "tabWaiting" : "tabSkipped")}</em> : <StatusChip status={m.status} />}
          {m.flagged && <em className="message-status status-flagged">{t("flagChip")}</em>} {t(`channel.${m.channel}`)}
        </small>
        <strong>{m.title || (m.fileCount ? t("filesCount", { count: m.fileCount }) : t("untitled"))}</strong>
        <span className="mail-snippet">{m.snippet}</span>
        <span className="mail-summary-meta">
          <time dateTime={m.receivedAt}>{format.dateTime(new Date(m.receivedAt), { month: "short", day: "numeric" })}</time>
          {m.status === "confirmed" && m.projectId && <span>{t("filedChip")}</span>}
        </span>
      </button>
    </div>
  );
  const selectedSummary = visible.find(m => m.id === selectedId) ?? (message ? {
    ...message,
    title: message.analysis?.title || fallbackTitle(message, t),
    snippet: (message.analysis?.summary || message.body || message.files.map(f => f.filename).join(", ")).slice(0, 110),
    flagged: !!message.analysis?.flags.length,
    fileCount: message.files.length,
  } : null);

  return (
    <div className="inbox-workspace">
      <section className="inbox-intake-toolbar">
        <div className="section-header">
          <div>
            <h2>{t("title")} <InfoHint label={t("title")} notes={[t("intro"),t("usageRemaining",data.aiUsage)]} /></h2>
          </div>
          {data.gmail.connection && !data.preview ? <GmailSync onNotice={setNotice} /> : <Link className="text-button" href="/settings">{tGmail("title")}</Link>}
        </div>

        {data.aiUsage.remaining===0&&<p className="notice error" role="status">{t("usageExhausted",{limit:data.aiUsage.limit})}</p>}
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
      <IntakeTabs tab={tab} onTab={next => { setTab(next); setActive(""); setNotice(null); }} previewCounts={data.preview ? previewCounts : undefined} />
      {data.preview && <div className="intake-demo-toolbar" data-preview-safe="true">
        <span>{tDemo("label")} <InfoHint label={tDemo("label")} notes={[tDemo("hint")]} /></span>
        <button className="text-button" onClick={() => { setPreviewOverrides({}); setActive(""); setTab("messages"); setNotice(tDemo("resetDone")); }}>{tDemo("reset")}</button>
      </div>}
      {!data.preview && !data.gmail.connection && <div className="notice intake-connect-notice" role="note">
        <span>{tDemo("connectHint")}</span><Link className="secondary" href="/settings">{tDemo("connect")}</Link>
      </div>}
      {!data.preview && tab !== "messages" ? (data.gmail.connection ? <GmailMail key={tab} view={tab} onNotice={setNotice} /> :
        <section id="intake-panel" role="tabpanel" aria-labelledby={`intake-tab-${tab}`} className="surface padded section-gap empty">
          <h2>{tGmail(tab === "waiting" ? "tabWaiting" : "tabSkipped")}</h2><p>{tDemo("connectEmpty")}</p>
        </section>) : (
      <div id="intake-panel" role="tabpanel" aria-labelledby={`intake-tab-${tab}`}>

      <InboxReaderLayout selectedId={selectedId} selectedCard={selectedSummary ? renderCard(selectedSummary) : <p role="status">{tPage("loading")}</p>} listLabel={t("listLabel")} list={<>
          <div className="inbox-list-heading">
            <h2>
              {tab === "messages" ? t("listHeading") : tGmail(tab === "waiting" ? "tabWaiting" : "tabSkipped")}
            </h2>
            <span role="status">{!data.preview && pages.total === null ? tPage("loading") : t("listCount", { count: data.preview ? visible.length : (pages.total ?? 0) })}</span>
          </div>
          {tab === "messages" && <label className="check-line">
            <input data-preview-safe="true" type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
            {t("showDismissed")}
          </label>}
          {!visible.length && (data.preview || (!pages.loading && !pages.failed)) && (
            <div className="empty">
              <h3>{tab === "messages" ? t("emptyTitle") : tGmail(tab === "waiting" ? "emptyWaiting" : "emptySkipped")}</h3>
              {tab === "messages" && <p>{t("emptyBody")}</p>}
            </div>
          )}
          {visible.map(renderCard)}
          {!data.preview && <PageLoader page={pages} />}
        </>}>
          {message ? (data.preview && tab !== "messages" ? <>
            <h2>{message.analysis?.title || fallbackTitle(message, t)}</h2>
            <p className="review-meta">{message.analysis?.counterparty.name}</p>
            <p className="prewrap">{message.body}</p>
            <PreviewClassification tab={tab} onMove={destination => movePreview(message.id, destination)} />
          </> : <MessageDetail key={message.id} message={message} previewActions={data.preview ?
            <PreviewClassification tab="messages" onMove={destination => movePreview(message.id, destination)} /> : undefined} />) : (
            !selectedId ? <p className="empty">{t("pick")}</p> : detail.failed ? <div role="alert"><p>{t("detailUnavailable")}</p><button className="secondary" onClick={detail.retry}>{tPage("retry")}</button></div> : <p className="empty" role="status">{tPage("loading")}</p>
          )}
      </InboxReaderLayout>
      </div>
      )}
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

/** These actions only update isolated display state, never server actions. */
function PreviewClassification({ tab, onMove }: { tab: IntakeTab; onMove: (tab: PreviewIntakeTab) => void }) {
  const t = useTranslations("intakeDemo");
  return <div className="row-actions section-gap" data-preview-safe="true">
    {tab !== "messages" && <button className="primary" onClick={() => onMove("messages")}>{t(tab === "waiting" ? "classifyWork" : "restoreWork")}</button>}
    {tab !== "skipped" && <button className="secondary" onClick={() => onMove("skipped")}>{t("filterOut")}</button>}
    {tab !== "waiting" && <button className="text-button" onClick={() => onMove("waiting")}>{t("backToWaiting")}</button>}
  </div>;
}

/** Why an analysis failed, in the person's language; older messages stored the provider's own words. */
function failureText(failure: string | null, t: ReturnType<typeof useTranslations<"inbox">>) {
  return isFailureCode(failure) ? t(`failure.${failure}`) : (failure ?? "");
}

/** A message's title before or without an analysis: its first line, or how many files it has. */
function fallbackTitle(m: InboxMessage, t: ReturnType<typeof useTranslations<"inbox">>) {
  return m.gmail?.subject || firstLine(m.body) || (m.files.length ? t("filesCount", { count: m.files.length }) : t("untitled"));
}

function StatusChip({ status }: { status: InboxMessage["status"] }) {
  const t = useTranslations("inbox.status");
  return <em className={`message-status status-${status}`}>{t(status)}</em>;
}


function MessageDetail({ message, previewActions }: { message: InboxMessage; previewActions?: ReactNode }) {
  const t = useTranslations("inbox");
  const labels = useLabels();
  const tGmail = useTranslations("gmail");
  const format = useFormatter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notWorkOpen, setNotWorkOpen] = useState(false);
  const [never, setNever] = useState(false); // also a "never" rule for the sender
  const run = (action: () => Promise<string | null>) => startTransition(async () => setError(await action()));
  const a = message.analysis;
  const preview = useTranslations("preview");
  const analyzed = !!a && message.status !== "pending";
  const data = useAppData();
  const filedOn = message.projectId ? data.projects.find((p) => p.id === message.projectId) : undefined;
  const gmailUrl =
    message.gmail && data.gmail.connection
      ? `https://mail.google.com/mail/?${new URLSearchParams({ authuser: data.gmail.connection.accountEmail })}#all/${message.gmail.gmailId}`
      : null;

  // The journey, top to bottom (docs/design/intake-to-project.md, screen 1): who and what (triage);
  // what they want and on what terms (understand); the original, a glance away; then the one decision,
  // where it's filed, with one primary button. Rare actions wait in the ⋯ menu.
  const long = message.body.length > SHORT_MESSAGE || message.files.length > 0 || !!a?.transcript;
  return (
    <>
      <header className="review-head">
        <h2>
          {a?.title || fallbackTitle(message, t)}
        </h2>
        <StatusChip status={message.status} />
        <p className="review-meta">
          {message.gmail?.sender && (
            <>
              <span title={message.gmail.sender}>{senderName(message.gmail.sender)}</span>
              {" · "}
            </>
          )}
          {t(`channel.${message.channel}`)}
          {" · "}
          {/* Date and time formatted apart and joined with a plain space: the separator Intl puts between
              them (a thin space in Node's locale data) differs from the browser's, which breaks hydration. */}
          <time dateTime={message.receivedAt} title={data.talent.timeZone}>
            {format.dateTime(new Date(message.receivedAt), { month: "numeric", day: "numeric", timeZone: data.talent.timeZone })}{" "}
            {format.dateTime(new Date(message.receivedAt), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: data.talent.timeZone })}
          </time>
          {filedOn && (
            <>
              {" · "}
              {t("filedOn")} {filedOn.title} · {labels.stage(filedOn.stage)}
            </>
          )}
        </p>
      </header>

      {analyzed && <Flags analysis={a} />}
      {message.gmail?.unsure && (
        <div className="notice gmail-unsure" role="note">
          <p>{tGmail("unsureNotice")}</p>
          <div className="row-actions">
            <button className="secondary" disabled={pending} onClick={() => run(() => markSureWork(message.id))}>
              {tGmail("itsWork")}
            </button>
            <button className="text-button" disabled={pending} onClick={() => setNotWorkOpen(true)}>
              {tGmail("notWork")}
            </button>
          </div>
        </div>
      )}
      {message.status === "pending" && <p className="notice analyzing">{t("pendingBody")}</p>}
      {message.status === "error" && (
        <div className="notice error" role="alert">
          <p>{t("failed", { reason: failureText(message.failure, t) })}</p>
          <button className="secondary" disabled={pending} onClick={() => run(() => reanalyzeMessage(message.id))}>
            {t("reanalyze")}
          </button>
        </div>
      )}
      {a && message.status === "analyzed" && a.intent === "other" && a.confidence < 0.5 && (
        <p className="notice" role="note">
          {t("notWork")}
        </p>
      )}

      {analyzed && long && a.summary && (
        <section className="review-section">
          <h3>{t("review.summary")}</h3>
          <p className="review-text">{a.summary}</p>
        </section>
      )}
      {analyzed && <Asks analysis={a} />}
      {analyzed && <Terms analysis={a} />}
      <Original message={message} />

      {data.preview && (previewActions ?? <p className="notice">{preview("readOnly")}</p>)}
      {!data.preview && message.status === "analyzed" && a && <MessageReview key={a.promptVersion + a.modelVersion} message={message} />}
      {message.status === "confirmed" && message.projectId && (
        <div className="row-actions section-gap">
          <Link className="primary" href={`/projects?id=${message.projectId}`}>
            {t("viewProject")}
          </Link>
        </div>
      )}

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <footer className="review-quiet">
        {gmailUrl && (
          <a href={gmailUrl} target="_blank" rel="noopener noreferrer">
            {tGmail("openInGmail")}
          </a>
        )}
        {message.status === "dismissed" && (
          <button className="text-button" disabled={pending} onClick={() => run(() => dismissMessage(message.id, false))}>
            {t("restore")}
          </button>
        )}
        {(analyzed || message.gmail) && message.status !== "confirmed" && (
          <MoreMenu label={t("review.more")}>
            {message.status === "analyzed" && (
              <button role="menuitem" disabled={pending} onClick={() => run(() => reanalyzeMessage(message.id))}>
                {t("reanalyze")}
              </button>
            )}
            {(message.status === "analyzed" || message.status === "error") && (
              <button role="menuitem" disabled={pending} onClick={() => run(() => dismissMessage(message.id, true))}>
                {t("dismiss")}
              </button>
            )}
            {message.gmail && (
              <button role="menuitem" disabled={pending} onClick={() => setNotWorkOpen(true)}>
                {tGmail("notWork")}
              </button>
            )}
          </MoreMenu>
        )}
      </footer>

      {analyzed && (
        <div className="message-more">
          <details className="original-message">
            <summary>{a.assumptions.length ? t("factsWithAssumptions", { count: a.assumptions.length }) : t("facts")}</summary>
            <AnalysisView analysis={a} />
          </details>
          {a.transcriptWithheld && <p className="muted">{t("transcriptWithheld")}</p>}
          {a.transcript && (
            <details className="original-message">
              <summary>{t("transcript")}</summary>
              <p className="prewrap mail-body">{a.transcript}</p>
            </details>
          )}
        </div>
      )}

      {notWorkOpen && message.gmail && (
        <ConfirmDialog
          title={tGmail("notWorkTitle")}
          confirmLabel={tGmail("notWork")}
          pending={pending}
          onClose={() => setNotWorkOpen(false)}
          onConfirm={() =>
            startTransition(async () => {
              const failure = await markNotWork(message.id, never);
              setError(failure);
              setNotWorkOpen(false);
            })
          }
        >
          <p>{tGmail("notWorkBody")}</p>
          {message.gmail.sender && (
            <label className="check-line">
              <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} />
              {tGmail("notWorkNeverFrom", { sender: message.gmail.sender })}
            </label>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

/** Over this many characters, or with files, a message is long: it gets a summary, and its original starts folded. */
const SHORT_MESSAGE = 1200;
/** The original shows this much before "Show all". */
const PREVIEW_CHARS = 280;

/** "Name <a@b.com>" → "Name"; a bare address stays. */
const senderName = (sender: string) => sender.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] ?? sender;

type Analysis = NonNullable<InboxMessage["analysis"]>;
const isoDay = (format: ReturnType<typeof useFormatter>, iso: string) =>
  format.dateTime(new Date(`${iso}T12:00:00Z`), { year: "numeric", month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" });

/** What the sender wants from the person, and by when. */
function Asks({ analysis: a }: { analysis: Analysis }) {
  const t = useTranslations("inbox.review");
  const format = useFormatter();
  const asks = a.asks.filter(Boolean).slice(0, 4);
  if (!asks.length && !a.replyBy) return null;
  return (
    <section className="review-section">
      <header>
        <h3>{t("asks")}</h3>
        {a.replyBy && <span className="review-deadline">{t("replyBy", { date: isoDay(format, a.replyBy) })}</span>}
      </header>
      {!!asks.length && (
        <ul className="review-asks">
          {asks.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Detail fields worth a row of their own, in this order, when the message states them.
const termKeys = ["deliverables", "workDescription", "platforms", "postingDate", "usageRights", "term", "exclusivity", "setLength"];

/** The terms to check, as aligned rows: dates, place, the work, fee; what isn't stated. Each value's exact words are on hover. */
function Terms({ analysis: a }: { analysis: Analysis }) {
  const t = useTranslations("inbox.review");
  const tInbox = useTranslations("inbox");
  const labels = useLabels();
  const format = useFormatter();
  const money = useMoney();
  const fee =
    a.money.amount && a.money.amount > 0
      ? `${a.money.currency === "TWD" || !a.money.currency ? money(a.money.amount) : `${a.money.currency} ${a.money.amount}`}${
          a.money.taxIncluded === null ? "" : ` (${a.money.taxIncluded ? tInbox("taxIncluded") : tInbox("taxExcluded")})`
        }`
      : a.money.asStated;
  // A fee matters for offers and deals; elsewhere a missing one isn't news.
  const feeMatters = ["inquiry", "negotiation", "confirmation", "contract"].includes(a.intent);
  const place = [a.details.city?.value, a.details.venue?.value].filter(Boolean).join(" · ");
  const rows: { key: string; label: string; value: string; note?: string; stated?: string; gap?: boolean }[] = [
    ...a.dates.slice(0, 3).map((d, i) => ({
      key: `date-${i}`,
      label: t("date"),
      value: [d.date ? isoDay(format, d.date) : d.asStated, d.time].filter(Boolean).join(" "),
      note: d.what,
      stated: d.asStated,
    })),
    ...(place ? [{ key: "place", label: t("place"), value: place, stated: a.details.venue?.asStated || a.details.city?.asStated }] : []),
    ...termKeys
      .filter((k) => a.details[k]?.value)
      .map((k) => ({ key: k, label: labels.detailField(a.projectType, k), value: a.details[k].value, stated: a.details[k].asStated })),
    ...(fee || feeMatters ? [{ key: "fee", label: t("fee"), value: fee || t("notGiven"), stated: a.money.asStated, gap: !fee }] : []),
    ...(a.paymentTerms ? [{ key: "payment", label: t("payment"), value: a.paymentTerms }] : []),
    ...(a.missing.length ? [{ key: "missing", label: t("notStated"), value: format.list(a.missing.slice(0, 4), { type: "conjunction" }) }] : []),
  ];
  if (!rows.length) return null;
  return (
    <section className="review-section">
      <h3>{t("terms")}</h3>
      <dl className="review-terms">
        {rows.map((r) => (
          <div key={r.key} title={r.stated ? `「${r.stated}」` : undefined}>
            <dt>{r.label}</dt>
            <dd className={r.gap ? "gap" : undefined}>
              {r.value}
              {r.note && <small> {r.note}</small>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The message itself: a few lines, the rest a click away; open in full when the person asks or there's no analysis. */
function Original({ message }: { message: InboxMessage }) {
  const t = useTranslations("inbox");
  const tGmail = useTranslations("gmail");
  const [all, setAll] = useState(!message.analysis);
  const clipped = !all && message.body.length > PREVIEW_CHARS;
  if (!message.body && !message.files.length) return null;
  return (
    <section className="review-section review-original">
      <header>
        <h3>{t("original")}</h3>
        {message.body.length > PREVIEW_CHARS && (
          <button className="link-button" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? t("review.showLess") : t("review.showAll")}
          </button>
        )}
      </header>
      {message.gmail?.subject && <p className="mail-subject">{message.gmail.subject}</p>}
      {message.body && <p className={clipped ? "prewrap mail-body clipped" : "prewrap mail-body"}>{message.body}</p>}
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
      {!!message.gmail?.skippedAttachments.length && (
        <p className="muted gmail-skipped">{tGmail("skippedAttachments", { names: message.gmail.skippedAttachments.map((f) => f.filename).join(", ") })}</p>
      )}
      {message.analysis?.filesNotRead && <p className="muted">{t("filesNotRead")}</p>}
    </section>
  );
}

/** Warnings stay at the top, above anything the person might act on (decision 0007): one line each. */
function Flags({ analysis: a }: { analysis: Analysis }) {
  const t = useTranslations("inbox");
  const labels = useLabels();
  const format = useFormatter();
  if (!a.flags.length) return null;
  return (
    <ul className="review-flags" role="alert" aria-label={t("flagsTitle")}>
      {a.flags.map((f, i) => {
        // The weekday check knows exactly what's wrong; say it rather than the general label.
        const weekday = f.kind === "inconsistency" && f.source === "check" ? weekdayMismatchOf(a.dates, f.asStated) : null;
        const day = (n: number) => format.dateTime(new Date(Date.UTC(2026, 1, 1 + n, 12)), { weekday: "long", timeZone: "UTC" }); // 2026-02-01 is a Sunday
        return (
          <li key={i}>
            <TriangleAlert size={14} aria-hidden="true" />
            <span>
              {weekday
                ? t("weekdayMismatch", {
                    date: format.dateTime(new Date(`${weekday.date}T12:00:00Z`), { month: "numeric", day: "numeric", timeZone: "UTC" }),
                    actual: day(weekday.actual),
                    stated: day(weekday.stated),
                  })
                : f.note || labels.flag(f.kind)}
              {f.asStated && !weekday && <span className="stated"> 「{f.asStated}」</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function AnalysisView({ analysis: a }: { analysis: Analysis }) {
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
