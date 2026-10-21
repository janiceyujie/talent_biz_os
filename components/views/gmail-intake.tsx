"use client";

// Intake's Gmail parts (decision 0013): when mail was last checked, and the Waiting and Filtered
// out lists. We store only ids and what was decided; the sender and subject
// shown here are read live from Gmail, through the worker, as the list opens.
import { RefreshCw } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { InboxReaderLayout } from "@/components/app/inbox-reader-layout";
import { InfoHint } from "@/components/app/info-hint";
import { addSenderRule, markWasWork, syncGmail } from "@/lib/actions/mail";
import { domainOf } from "@/lib/mail/metadata";
import { isPersonalDomain } from "@/lib/mail/relevance/rules";
import type { GmailMailItem, GmailMailPage, GmailMailView } from "@/lib/types";

const POLL_MS = 3000; // while a sync runs, look again this often
const outcomeChip: Record<GmailMailItem["outcome"], string> = { work: "status-confirmed", unsure: "status-analyzed", pending: "", skipped: "", not_work: "" };

/** The header's "Checked 2 min ago", with Check now. */
export function GmailSync({ onNotice }: { onNotice: (text: string | null) => void }) {
  const { gmail } = useAppData();
  const t = useTranslations("gmail");
  const format = useFormatter();
  const router = useRouter();
  const now = useNow({ updateInterval: 30_000 });
  const [pending, startTransition] = useTransition();
  const c = gmail.connection;
  const syncing = !!c?.syncing;
  const sorting = c?.sorting ?? 0;

  // While a check runs or emails are sorted, look again often (not while the tab is hidden).
  // Otherwise the app-wide check catches the worker's own checks (components/app/live-refresh.tsx).
  useEffect(() => {
    if (!syncing && !sorting) return;
    const timer = setInterval(() => document.visibilityState === "visible" && router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [syncing, sorting, router]);

  if (!c || (c.status !== "connected" && c.status !== "error")) return null;
  const status = syncing
    ? t("syncing")
    : c.status === "error"
      ? t("syncFailed")
      : c.lastSyncedAt
        ? // Under a minute reads as just now: the clock here ticks every 30 s, so a check that just
          // landed can be newer than it ("in 6 seconds"), as in Google Calendar's settings.
          now.getTime() - new Date(c.lastSyncedAt).getTime() < 60_000
          ? t("syncedJustNow")
          : t("syncedAt", {
              time: format.relativeTime(new Date(c.lastSyncedAt), now),
            })
        : t("neverSynced");
  // Mail arrives on its own (decision 0013): when it was last checked, and a quiet way to check now.
  return (
    <div className="gmail-sync">
      <span className={c.status === "error" && !syncing ? "gmail-sync-failed" : "muted"} role="status">
        {(syncing || sorting > 0) && <RefreshCw size={14} aria-hidden="true" className="spinning" />}
        {status}
        {!syncing && sorting > 0 && ` · ${t("sortingCount", { count: sorting })}`}
      </span>
      <InfoHint notes={[t("autoInfo")]} />
      <button
        className="link-button"
        disabled={pending || syncing}
        onClick={() =>
          startTransition(async () => {
            onNotice(await syncGmail());
          })
        }
      >
        {t("syncNow")}
      </button>
    </div>
  );
}

export type IntakeTab = "messages" | GmailMailView;

/** Messages · Waiting · Filtered out; before a mailbox is connected, the two Gmail lists count 0. */
export function IntakeTabs({ tab, onTab }: { tab: IntakeTab; onTab: (tab: IntakeTab) => void }) {
  const { gmail, inbox } = useAppData();
  const t = useTranslations("gmail");
  const counts = gmail.connection?.counts ?? { waiting: 0, skipped: 0 };
  // Messages counts what's waiting for review, as the Intake badge in the menu does (app-shell).
  const toReview = inbox.counts.analyzed + inbox.counts.error;
  // Every tab shows its count, 0 too: a missing number reads as "nothing here" when that isn't known.
  const tabs: [IntakeTab, string, number][] = [
    ["messages", t("tabMessages"), toReview],
    ["waiting", t("tabWaiting"), counts.waiting],
    ["skipped", t("tabSkipped"), counts.skipped],
  ];
  return (
    <div className="deal-tabs intake-tabs" role="tablist" aria-label={t("tabsLabel")}>
      {tabs.map(([key, label, n]) => (
        <button key={key} role="tab" id={`intake-tab-${key}`} aria-selected={tab === key} aria-controls="intake-panel" onClick={() => onTab(key)}>
          {label}
          <span>{n}</span>
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
  const version = `${c?.lastSyncedAt}:${c?.syncing}:${c?.sorting}:${c?.counts.waiting}:${c?.counts.skipped}`;
  const sorting = !!c?.syncing; // while a check runs, wait for it; emails still being scored show as Not decided yet

  // Only the latest request may fill the list: a newer one cancels an older, slower one (a refresh racing it).
  const latest = useRef<AbortController | null>(null);
  const load = useCallback(
    async (offset: number) => {
      latest.current?.abort();
      const request = new AbortController();
      latest.current = request;
      setLoading(true);
      try {
        const res = await fetch(`/api/mail/decisions?${new URLSearchParams({ view, offset: String(offset) })}`, { cache: "no-store", signal: request.signal });
        const page = res.ok ? ((await res.json()) as GmailMailPage) : { items: [], more: false, error: "unavailable" as const };
        if (request.signal.aborted) return;
        // An email can move between pages while they load: keep each once.
        setItems((prev) => [...new Map((offset ? [...(prev ?? []), ...page.items] : page.items).map((i) => [i.id, i])).values()]);
        setMore(page.more);
        setError(page.error);
      } catch {
        if (!request.signal.aborted) setError("unavailable"); // offline, or the server didn't answer
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    },
    [view],
  );

  useEffect(() => {
    if (sorting) return;
    queueMicrotask(() => load(0));
    return () => latest.current?.abort();
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
    <div id="intake-panel" role="tabpanel" aria-labelledby={`intake-tab-${view}`}>
      <InboxReaderLayout
        selectedId={picked?.id ?? ""}
        listLabel={view === "waiting" ? t("tabWaiting") : t("tabSkipped")}
        list={
          <>
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
          </>
        }
      >
        {picked && c ? (
          <GmailMailDetail key={picked.id} item={picked} view={view} accountEmail={c.accountEmail} loadFailed={!!error} onNotice={onNotice} />
        ) : (
          <p className="empty">{tInbox("pick")}</p>
        )}
      </InboxReaderLayout>
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
      <h2 tabIndex={-1}>{item.subject === null ? (loadFailed ? t("notLoaded") : t("unreadable")) : item.subject || t("noSubject")}</h2>
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
        {/* One too large to bring in would only be refused again: the reason says to paste what matters instead. */}
        {view === "skipped" && item.decidedBy !== "too_large" && (
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
