"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { DataNotice } from "./data-notice";
import { Modal } from "@/components/app/modal";
import { RecordEditor, type Editor, type RecordData } from "@/components/app/record-editor";
import { FileText } from "lucide-react";
import { dismissMessage, linkMessageToProject, reanalyzeMessage, submitPastedMessage } from "@/lib/actions/messages";
import { useMoney } from "@/lib/i18n/format";
import { useLabels } from "@/lib/i18n/labels";
import { detailFieldKeys, type AssumptionTopic } from "@/lib/ai/analysis";
import { isFailureCode } from "@/lib/ai/errors";
import type { Contact, InboxMessage } from "@/lib/types";
import { UploadDialog } from "./upload-dialog";

// The review queue: messages the person sent in, each with the model's
// proposal. Nothing becomes a project or a to-do until the person confirms
// it here (docs/architecture.md, "Analysis"; the message is untrusted input).

const POLL_MS = 2500;
const firstLine = (text: string) => text.trim().split("\n")[0]?.slice(0, 80) ?? "";

export function InboxView() {
  const data = useAppData();
  const t = useTranslations("inbox");
  const tEyebrow = useTranslations("eyebrow");
  const router = useRouter();
  const params = useSearchParams();
  const format = useFormatter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pasting, setPasting] = useState(params.get("paste") === "1");
  const [uploading, setUploading] = useState(params.get("upload") === "1");
  const [active, setActive] = useState("");
  const [showDismissed, setShowDismissed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const visible = data.inbox.filter((m) => showDismissed || m.status !== "dismissed");
  const message = data.inbox.find((m) => m.id === active) ?? visible[0];
  const analyzing = data.inbox.some((m) => m.status === "pending");

  // ?paste=1 / ?upload=1 (from the header and Today) open a dialog once; drop
  // them from the address so a reload doesn't open it again.
  useEffect(() => {
    if (params.get("paste") || params.get("upload")) router.replace("/inbox", { scroll: false });
  }, [params, router]);

  // Analysis runs in the background; refresh until it lands.
  useEffect(() => {
    if (!analyzing) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [analyzing, router]);

  return (
    <>
      <section className="surface padded">
        <div className="section-header">
          <div>
            <span>{tEyebrow("intake")}</span>
            <h2>{t("title")}</h2>
          </div>
          <span className="mock-chip">{t("gmailSoon")}</span>
        </div>
        <p className="muted">{t("intro")}</p>
        <div className="row-actions">
          <button className="primary" onClick={() => setPasting(true)}>
            {t("paste")}
          </button>
          <button className="secondary" onClick={() => setUploading(true)}>
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
        <section className="surface padded">
          <label className="check-line">
            <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
            {t("showDismissed")}
          </label>
          {!visible.length && (
            <div className="empty">
              <h3>{t("emptyTitle")}</h3>
              <p>{t("emptyBody")}</p>
            </div>
          )}
          {visible.map((m) => (
            <div className="mail-item single" key={m.id}>
              <button className={`mail-summary ${message?.id === m.id ? "active" : ""}`} onClick={() => setActive(m.id)}>
                <small>
                  <StatusChip status={m.status} />
                  {!!m.analysis?.flags.length && <em className="message-status status-flagged">{t("flagChip")}</em>}{" "}
                  {t(`channel.${m.channel}`)} ·{" "}
                  {format.dateTime(new Date(m.receivedAt), { dateStyle: "medium", timeStyle: "short" })}
                </small>
                <strong>{m.analysis?.title || fallbackTitle(m, t)}</strong>
                <span>{(m.analysis?.summary || m.body || m.files.map((f) => f.filename).join(", ")).slice(0, 110)}</span>
              </button>
            </div>
          ))}
        </section>
        <section className="surface padded">
          {message ? (
            <MessageDetail key={message.id} message={message} edit={setEditor} />
          ) : (
            <p className="empty">{t("pick")}</p>
          )}
        </section>
      </div>
      {pasting && (
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
      {uploading && (
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
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
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

function PasteDialog({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: (id: string, duplicate: boolean) => void }) {
  const t = useTranslations("inbox");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={t("pasteTitle")} onClose={() => !pending && onClose()}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await submitPastedMessage(text);
            if ("error" in result) setError(result.error);
            else onSubmitted(result.id, result.duplicate);
          });
        }}
      >
        <label>
          {t("pasteLabel")}
          <textarea
            aria-label={t("pasteLabel")}
            rows={12}
            required
            autoFocus
            maxLength={50_000}
            placeholder={t("pastePlaceholder")}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <p className="muted">{t("pasteHint")}</p>
        <DataNotice />
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary" disabled={pending} onClick={onClose}>
            {t("dismiss")}
          </button>
          <button type="submit" className="primary" disabled={pending || !text.trim()}>
            {pending ? t("submitting") : t("analyze")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function MessageDetail({ message, edit }: { message: InboxMessage; edit: (e: Editor) => void }) {
  const data = useAppData();
  const t = useTranslations("inbox");
  const format = useFormatter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [linkTo, setLinkTo] = useState("");
  const [replyBy, setReplyBy] = useState(message.analysis?.replyBy ?? "");
  const run = (action: () => Promise<string | null>) => startTransition(async () => setError(await action()));
  const prefill = useProjectPrefill();
  const a = message.analysis;
  const liveProjects = data.projects.filter((p) => !p.archived);

  return (
    <>
      <div className="mail-tags">
        <StatusChip status={message.status} />
      </div>
      <h2>{a?.title || fallbackTitle(message, t)}</h2>
      <p className="muted">
        {t(`channel.${message.channel}`)} · {format.dateTime(new Date(message.receivedAt), { dateStyle: "medium", timeStyle: "short" })}
      </p>

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
      {a && message.status !== "pending" && <AnalysisView analysis={a} />}

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

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="row-actions section-gap">
        {message.status === "analyzed" && a && (
          <button className="primary" disabled={pending} onClick={() => edit({ kind: "project", item: prefill(message) })}>
            {t("createProject")}
          </button>
        )}
        {message.status === "confirmed" && message.projectId && (
          <Link className="primary" href={`/projects?id=${message.projectId}`}>
            {t("viewProject")}
          </Link>
        )}
        {(message.status === "analyzed" || message.status === "error") && (
          <button className="secondary" disabled={pending} onClick={() => run(() => reanalyzeMessage(message.id))}>
            {t("reanalyze")}
          </button>
        )}
        {(message.status === "analyzed" || message.status === "error") && (
          <button className="text-button" disabled={pending} onClick={() => run(() => dismissMessage(message.id, true))}>
            {t("dismiss")}
          </button>
        )}
        {message.status === "dismissed" && (
          <button className="secondary" disabled={pending} onClick={() => run(() => dismissMessage(message.id, false))}>
            {t("restore")}
          </button>
        )}
      </div>
      {message.status === "analyzed" && liveProjects.length > 0 && (
        <div className="link-project">
          <label>
            {t("linkProject")}
            <select aria-label={t("pickProject")} value={linkTo} onChange={(e) => setLinkTo(e.target.value)}>
              <option value="">{t("pickProject")}</option>
              {liveProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("field.replyBy")}
            <input type="date" aria-label={t("field.replyBy")} value={replyBy} onChange={(e) => setReplyBy(e.target.value)} />
          </label>
          <button
            className="secondary"
            disabled={pending || !linkTo}
            onClick={() => run(() => linkMessageToProject(message.id, linkTo, replyBy))}
          >
            {t("link")}
          </button>
        </div>
      )}
    </>
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
      {a.flags.length > 0 && (
        <div className="notice analysis-flags" role="alert">
          <strong>{t("flagsTitle")}</strong>
          <ul>
            {a.flags.map((f, i) => (
              <li key={i}>
                {labels.flag(f.kind)}
                {f.note && <span className="flag-note"> {f.note}</span>}
                {f.asStated && <small className="muted stated">{t("statedAs", { text: f.asStated })}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <h3>{t("summary")}</h3>
      <p>{a.summary}</p>
      <h3>{t("facts")}</h3>
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

/** The project form, filled from a message's analysis — every field still editable before saving. */
function useProjectPrefill() {
  const data = useAppData();
  const t = useTranslations("inbox");
  const labels = useLabels();
  return (m: InboxMessage): RecordData => {
    const a = m.analysis!;
    const contact = matchContact(data.contacts, a.counterparty);
    const twd = a.money.amount !== null && (a.money.currency === "TWD" || !a.money.currency);
    const detail = (key: string) => a.details[key]?.value ?? "";
    // Fields with a home on the project go there; the rest are listed in the notes.
    const placed = new Set(["deliverables", "usageRights", "travel"]);
    const notes = [
      t("notesHeading"),
      a.summary,
      a.dates.length ? `${t("field.dates")}: ${a.dates.map((d) => `${d.what} ${[d.date, d.time].filter(Boolean).join(" ") || d.asStated}`).join("; ")}` : "",
      a.paymentTerms && `${t("field.paymentTerms")}: ${a.paymentTerms}`,
      a.replyBy && `${t("field.replyBy")}: ${a.replyBy}`,
      ...detailFieldKeys(a)
        .filter((key) => !placed.has(key) && detail(key))
        .map((key) => `${labels.detailField(a.projectType, key)}: ${detail(key)}`),
      [a.counterparty.email, a.counterparty.phone].some(Boolean) &&
        `${t("field.contact")}: ${[a.counterparty.name, a.counterparty.email, a.counterparty.phone].filter(Boolean).join(" · ")}`,
      !twd && a.money.amount !== null && t("foreignCurrency", { amount: `${a.money.currency} ${a.money.amount}` }),
    ]
      .filter(Boolean)
      .join("\n");
    return {
      messageId: m.id,
      replyBy: a.replyBy, // shown in the form to confirm or change; becomes the reply to-do
      title: (a.title || firstLine(m.body) || m.files[0]?.filename || "").slice(0, 200),
      counterparty: contact?.name ?? (a.counterparty.company || a.counterparty.name),
      counterpartyId: contact?.id ?? "",
      type: a.projectType,
      stage: "offer",
      quotedAmount: twd ? a.money.amount! : "",
      taxIncluded: a.money.taxIncluded ?? false,
      deliverables: detail("deliverables"),
      rights: detail("usageRights"),
      travel: detail("travel"),
      notes: notes.slice(0, 10_000),
    };
  };
}

/** A proposed contact: same email first, then the same company or name. Never assumed — the form shows the link and it can be cleared. */
function matchContact(contacts: Contact[], who: { name: string; company: string; email: string }) {
  const live = contacts.filter((c) => !c.archived);
  const same = (x: string, y: string) => !!x && !!y && x.trim().toLowerCase() === y.trim().toLowerCase();
  return (
    live.find((c) => same(c.email, who.email)) ??
    live.find((c) => same(c.company, who.company) || same(c.name, who.company)) ??
    live.find((c) => same(c.name, who.name))
  );
}
