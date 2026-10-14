"use client";

// Intake's Gmail parts (decision 0013): Sync now, and the Waiting and Filtered
// out lists. We store only ids and what was decided; the sender and subject
// shown here are read live from Gmail, through the worker, as the list opens.
import { RefreshCw } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { addSenderRule, markWasWork, syncGmail } from "@/lib/actions/mail";
import { domainOf } from "@/lib/mail/metadata";
import { isPersonalDomain } from "@/lib/mail/relevance/rules";
import type { GmailMailItem, GmailMailPage, GmailMailView } from "@/lib/types";

const POLL_MS = 3000; // while a sync runs, look again this often
const outcomeChip: Record<GmailMailItem["outcome"], string> = { work: "status-confirmed", unsure: "status-analyzed", pending: "", skipped: "", not_work: "" };

/** The header's Sync now, with when the last sync finished. */
export function GmailSync({ onNotice }: { onNotice: (text: string | null) => void }) {
  const { gmail } = useAppData();
  const t = useTranslations("gmail");
  const format = useFormatter();
  const router = useRouter();
  const now = useNow({ updateInterval: 30_000 });
  const [pending, startTransition] = useTransition();
  const c = gmail.connection;
  const syncing = !!c?.syncing;

  useEffect(() => {
    if (!syncing) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [syncing, router]);

  if (!c || (c.status !== "connected" && c.status !== "error")) return null;
  const status = syncing
    ? t("syncing")
    : c.status === "error"
      ? t("syncFailed")
      : c.lastSyncedAt
        ? t("syncedAt", {
            time: format.relativeTime(new Date(c.lastSyncedAt), now),
          })
        : t("neverSynced");
  return (
    <div className="gmail-sync">
      <span className={c.status === "error" && !syncing ? "gmail-sync-failed" : "muted"} role="status">
        {status}
      </span>
      <button
        className="secondary"
        disabled={pending || syncing}
        onClick={() =>
          startTransition(async () => {
            onNotice(await syncGmail());
          })
        }
      >
        <RefreshCw size={16} aria-hidden="true" className={syncing ? "spinning" : undefined} />
        {t("syncNow")}
      </button>
    </div>
  );
}

export type IntakeTab = "messages" | GmailMailView;

/** Messages · Waiting · Filtered out, shown once a mailbox is connected. */
export function IntakeTabs({ tab, onTab }: { tab: IntakeTab; onTab: (tab: IntakeTab) => void }) {
  const { gmail } = useAppData();
  const t = useTranslations("gmail");
  const counts = gmail.connection?.counts;
  if (!counts) return null;
  const tabs: [IntakeTab, string, number | null][] = [
    ["messages", t("tabMessages"), null],
    ["waiting", t("tabWaiting"), counts.waiting],
    ["skipped", t("tabSkipped"), counts.skipped],
  ];
  return (
    <div className="deal-tabs intake-tabs" role="tablist" aria-label={t("tabsLabel")}>
      {tabs.map(([key, label, n]) => (
        <button key={key} role="tab" id={`intake-tab-${key}`} aria-selected={tab === key} aria-controls="intake-panel" onClick={() => onTab(key)}>
          {label}
          {!!n && <span>{n}</span>}
        </button>
      ))}
    </div>
  );
}

/** One of the two lists, a page at a time, and the picked email beside it. */
export function GmailMail({ view, onNotice }: { view: GmailMailView; onNotice: (text: string | null) => void }) {
  const { gmail } = useAppData();
  const t = useTranslations("gmail");
  const tInbox = useTranslations("inbox");
  const format = useFormatter();
  const [items, setItems] = useState<GmailMailItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<GmailMailPage["error"]>(null);
  const [active, setActive] = useState("");
  const [loading, setLoading] = useState(false);
  const c = gmail.connection;
  // A finished sync or a moved email changes the counts: read the list again.
  const version = `${c?.lastSyncedAt}:${c?.syncing}:${c?.counts.waiting}:${c?.counts.skipped}`;
  const sorting = !!c?.syncing; // the lists show only what's sorted: wait for the last score

  // Only the latest request may fill the list: an older, slower one (a refresh racing it) is ignored.
  const latest = useRef(0);
  const load = useCallback(
    async (offset: number) => {
      const request = ++latest.current;
      setLoading(true);
      try {
        const res = await fetch(`/api/mail/decisions?${new URLSearchParams({ view, offset: String(offset) })}`, { cache: "no-store" });
        const page = res.ok ? ((await res.json()) as GmailMailPage) : { items: [], more: false, error: "unavailable" as const };
        if (request !== latest.current) return;
        setItems((prev) => (offset ? [...(prev ?? []), ...page.items] : page.items));
        setMore(page.more);
        setError(page.error);
      } finally {
        if (request === latest.current) setLoading(false);
      }
    },
    [view],
  );

  useEffect(() => {
    if (sorting) return;
    queueMicrotask(() => load(0));
  }, [load, version, sorting]);

  const picked = items?.find((i) => i.id === active) ?? items?.[0];
  const peekError = error === "reconnect" ? t("peekError.reconnect") : error === "gmail" || error === "unavailable" ? t("peekError.unavailable") : null;

  if (sorting)
    return (
      <div className="surface padded section-gap" id="intake-panel" role="tabpanel" aria-labelledby={`intake-tab-${view}`}>
        <p className="notice analyzing" role="status">
          {t("sorting")}
        </p>
      </div>
    );

  return (
    <div className="inbox-layout section-gap" id="intake-panel" role="tabpanel" aria-labelledby={`intake-tab-${view}`}>
      <section className="surface padded inbox-messages" aria-label={view === "waiting" ? t("tabWaiting") : t("tabSkipped")}>
        <p className="muted gmail-about">{view === "waiting" ? t("aboutWaiting") : t("aboutSkipped")}</p>
        {peekError && (
          <p className="notice error" role="alert">
            {peekError}
          </p>
        )}
        {items === null && <p className="muted">{t("loading")}</p>}
        {items?.length === 0 && (
          <div className="empty">
            <p>{c?.lastSyncedAt ? (view === "waiting" ? t("emptyWaiting") : t("emptySkipped")) : t("notSyncedYet")}</p>
          </div>
        )}
        {items?.map((m) => (
          <div className={`mail-item single ${picked?.id === m.id ? "is-active" : ""}`} key={m.id}>
            <button className={`mail-summary ${picked?.id === m.id ? "active" : ""}`} aria-pressed={picked?.id === m.id} onClick={() => setActive(m.id)}>
              <small>
                {view === "waiting" && (
                  <em className={`message-status ${outcomeChip[m.outcome]}`}>{t(`outcome.${m.outcome}`)}</em>
                )}{" "}
                {m.from ? m.from.name || m.from.address : ""}
              </small>
              <strong>{m.subject === null ? (error ? t("notLoaded") : t("unreadable")) : m.subject || t("noSubject")}</strong>
              <span className="mail-summary-meta">
                <time dateTime={m.receivedAt}>
                  {format.dateTime(new Date(m.receivedAt), {
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              </span>
            </button>
          </div>
        ))}
        {more && (
          <button className="secondary section-gap" disabled={loading} onClick={() => load(items?.length ?? 0)}>
            {loading ? t("loading") : t("showMore")}
          </button>
        )}
      </section>
      <section className="surface padded inbox-reader" aria-label={tInbox("readerLabel")}>
        {picked && c ? (
          <GmailMailDetail key={picked.id} item={picked} view={view} accountEmail={c.accountEmail} loadFailed={!!error} onNotice={onNotice} />
        ) : (
          <p className="empty">{tInbox("pick")}</p>
        )}
      </section>
    </div>
  );
}

function GmailMailDetail({
  item,
  view,
  accountEmail,
  loadFailed,
  onNotice,
}: {
  item: GmailMailItem;
  view: GmailMailView;
  accountEmail: string;
  loadFailed: boolean; // the live read failed, so a missing subject doesn't mean the email is gone
  onNotice: (text: string | null) => void;
}) {
  const timeZone = useAppData().talent.timeZone;
  const t = useTranslations("gmail");
  const format = useFormatter();
  const [pending, startTransition] = useTransition();
  const address = item.from?.address ?? "";
  const domain = domainOf(address);
  const [kind, setKind] = useState<"address" | "domain">("address");
  const verdict = view === "waiting" ? "never" : "always";
  const reason =
    item.decidedBy === "model" && item.kind
      ? t("byModel", { kind: t(`kind.${item.kind as "other"}`), score: format.number(item.score ?? 0, { maximumFractionDigits: 2 }) })
      : item.decidedBy
        ? t(`rule.${item.decidedBy as "pending"}`)
        : item.outcome === "pending"
          ? t("rule.pending")
          : null;
  const gmailUrl = `https://mail.google.com/mail/?${new URLSearchParams({ authuser: accountEmail })}#all/${item.gmailId}`;

  return (
    <>
      <h2>{item.subject === null ? (loadFailed ? t("notLoaded") : t("unreadable")) : item.subject || t("noSubject")}</h2>
      <dl className="mail-metadata">
        <div>
          <dt>{t("from")}</dt>
          <dd>{item.from ? (item.from.name ? `${item.from.name} <${item.from.address}>` : item.from.address) : "—"}</dd>
        </div>
        <div>
          <dt>{t("received")}</dt>
          <dd>
            <time dateTime={item.receivedAt}>
              {format.dateTime(new Date(item.receivedAt), {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone,
              })}
            </time>
          </dd>
        </div>
        {reason && (
          <div>
            <dt>{t("why")}</dt>
            <dd>{reason}</dd>
          </div>
        )}
      </dl>
      <div className="row-actions section-gap">
        {view === "skipped" && (
          <button
            className="primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                onNotice((await markWasWork(item.id)) ?? t("bringingIn"));
              })
            }
          >
            {t("wasWork")}
          </button>
        )}
        <a className="secondary" href={gmailUrl} target="_blank" rel="noopener noreferrer">
          {t("openInGmail")}
        </a>
      </div>
      {address && (
        <div className="gmail-rule section-gap">
          {domain && !isPersonalDomain(domain) && (
            <label>
              {t("ruleScope")}
              <select value={kind} onChange={(e) => setKind(e.target.value as "address" | "domain")}>
                <option value="address">{address}</option>
                <option value="domain">{t("scopeDomain", { domain })}</option>
              </select>
            </label>
          )}
          <button
            className="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const failure = await addSenderRule({
                  decisionId: item.id,
                  address,
                  kind,
                  verdict,
                });
                onNotice(failure ?? t("ruleSaved"));
              })
            }
          >
            {verdict === "always" ? t("alwaysFrom") : t("neverFrom")}
          </button>
        </div>
      )}
    </>
  );
}
