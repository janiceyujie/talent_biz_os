import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import { toLocale } from "@/lib/i18n/config";
import { supportTranslator } from "@/lib/i18n/support-messages";
import { accountOf, recordView, searchTargets, supportViewsOf, TIMELINE_LIMIT, timelineOf, type TimelineEntry } from "@/lib/support";
import { CopyButton } from "@/components/support/copy-button";
import { CopyableId } from "@/components/support/copyable-id";
import { SearchLinks } from "@/components/support/error-code-lookup";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A stored code, shown as is; anything else (free text, should a column ever hold it) isn't shown.
const CODE = /^[A-Za-z0-9_.:-]{1,64}$/;
const code = (v: string | null | undefined) => (v && CODE.test(v) ? v : null);
const time = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", dateStyle: "short", timeStyle: "medium", hourCycle: "h23" }).format(d) : null;
/** An id, named for what it identifies ("Project id"): its first 8 characters, and a click copies the whole. */
const Id = ({ id, label }: { id: string | null; label?: string | null }) =>
  id ? (
    <span className="support-labeled-id">
      {label && <>{label} </>}
      <CopyableId id={id} />
    </span>
  ) : null;

type T = Awaited<ReturnType<typeof supportTranslator>>;
type Group = "idKey" | "action" | "target" | "task" | "aiStatus" | "failure" | "outcome" | "decider" | "kind" | "channel" | "messageKind" | "direction" | "messageStatus" | "relevance" | "job" | "connection" | "history" | "role" | "membership" | "vertical";

/**
 * A stored value in words (messages/support/, "values"), or the value itself when
 * it has none yet. The value stays on hover, for searching logs or code.
 */
function label(t: T, group: Group, value: string | null | undefined) {
  const safe = code(value);
  if (!safe) return null;
  const key = `values.${group}.${safe.replace(/\./g, "_")}`;
  const has = (t as unknown as { has: (k: string) => boolean }).has(key);
  return has ? (t as unknown as (k: string) => string)(key) : safe;
}

/** "Message id": the words for what an id names, from a value group. */
const idOf = (t: T, group: Group, value: string) => t("timeline.idOf", { what: label(t, group, value) ?? value });

/** A failure in words, followed by its code: the code is what logs and Sentry are searched by. */
function Failure({ t, value }: { t: T; value: string | null | undefined }) {
  const safe = code(value);
  if (!safe) return null;
  return (
    <>
      {label(t, "failure", safe)} <span className="support-id">{safe}</span>
    </>
  );
}

/**
 * One account for support (decision 0026): its workspaces, connections, and
 * timeline, metadata only (lib/support). Each opening is recorded in the
 * account's history.
 */
export default async function SupportPersonPage({ params }: PageProps<"/support/people/[id]">) {
  const viewer = await requireStaff();
  const t = await supportTranslator(toLocale(viewer.locale));
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const found = await accountOf(id);
  if (!found) notFound();
  const { account, workspaces, mailboxes, calendars } = found;
  const talentIds = workspaces.map((w) => w.talentId);
  const views = await supportViewsOf(account.id); // before this look is recorded
  await recordView(account.id, talentIds);
  const timeline = await timelineOf(talentIds);
  const never = t("never");

  return (
    <>
      <div className="support-row">
        <Link href="/support">← {t("account.back")}</Link>
        <span className="muted">{t("account.viewed")}</span>
      </div>
      <section className="surface padded support-stack">
        <h2>{account.displayName}</h2>
        <dl className="support-facts">
          <dt>{t("account.email")}</dt>
          <dd>{account.email}</dd>
          <dt>{t("account.id")}</dt>
          <dd className="support-row">
            <span className="support-id">{account.id}</span>
            <CopyButton text={account.id} />
          </dd>
          <dt>{t("account.created")}</dt>
          <dd>{time(account.createdAt)}</dd>
          <dt>{t("account.language")}</dt>
          <dd>{account.locale}</dd>
          <dt>{t("account.views")}</dt>
          <dd>
            {views ? t("account.viewsSummary", { date: time(views.at) ?? "", id: views.by?.slice(0, 8) ?? "", count: views.count }) : t("account.viewsNone")}
          </dd>
        </dl>
        <h3>{t("account.find")}</h3>
        <SearchLinks sentryQuery={`person_id:${account.id}`} targets={searchTargets()} renderHelp={t("account.renderHelpId")} />
      </section>

      <section className="surface padded">
        <h2>{t("account.workspaces")}</h2>
        {workspaces.length === 0 && <p className="muted">{t("account.noWorkspaces")}</p>}
        {workspaces.map((w) => (
          <p key={w.talentId}>
            <strong>{w.name}</strong> <Id id={w.talentId} label={idOf(t, "idKey", "talentId")} /> · {label(t, "vertical", w.vertical)} ·{" "}
            {t("account.role", { role: label(t, "role", w.role) ?? "", status: label(t, "membership", w.status) ?? "", date: time(w.joinedAt) ?? "" })}
          </p>
        ))}
      </section>

      <section className="surface padded">
        <h2>{t("gmail.heading")}</h2>
        {mailboxes.length === 0 && <p className="muted">{t("gmail.none")}</p>}
        {mailboxes.map((m) => (
          <dl className="support-facts" key={m.id}>
            <dt>{t("account.email")}</dt>
            <dd>
              {m.accountEmail} <Id id={m.id} label={idOf(t, "idKey", "connectionId")} />
            </dd>
            <dt>{t("gmail.status")}</dt>
            <dd>{label(t, "connection", m.status)}</dd>
            <dt>{t("gmail.failure")}</dt>
            <dd>{m.failure ? <Failure t={t} value={m.failure} /> : t("none")}</dd>
            <dt>{t("gmail.lastSynced")}</dt>
            <dd>{time(m.lastSyncedAt) ?? never}</dd>
            <dt>{t("gmail.syncRequested")}</dt>
            <dd>{time(m.syncRequestedAt) ?? never}</dd>
            <dt>{t("gmail.history")}</dt>
            <dd>{m.historyDoneAt ? t("gmail.historyDone", { mode: label(t, "history", m.historyMode) ?? "", date: time(m.historyDoneAt) ?? "" }) : t("gmail.historyRunning", { mode: label(t, "history", m.historyMode) ?? "" })}</dd>
            <dt>{t("gmail.watch")}</dt>
            <dd>{time(m.watchExpiresAt) ?? t("none")}</dd>
          </dl>
        ))}
      </section>

      <section className="surface padded">
        <h2>{t("calendar.heading")}</h2>
        {calendars.length === 0 && <p className="muted">{t("calendar.none")}</p>}
        {calendars.map((c) => (
          <dl className="support-facts" key={c.id}>
            <dt>{t("calendar.status")}</dt>
            <dd>
              {label(t, "connection", c.status)} <Id id={c.id} label={idOf(t, "idKey", "connectionId")} />
            </dd>
            <dt>{t("calendar.error")}</dt>
            <dd>{c.lastError ? <Failure t={t} value={c.lastError} /> : t("none")}</dd>
            <dt>{t("calendar.lastSynced")}</dt>
            <dd>{time(c.lastSyncedAt) ?? never}</dd>
          </dl>
        ))}
      </section>

      <section className="surface padded">
        <h2>{t("timeline.heading")}</h2>
        <p className="muted">{t("timeline.help", { limit: TIMELINE_LIMIT })}</p>
        {timeline.length === 0 ? (
          <p className="muted">{t("timeline.empty")}</p>
        ) : (
          <div className="support-table">
            <table>
              <thead>
                <tr>
                  <th>{t("timeline.when")}</th>
                  <th>{t("timeline.what")}</th>
                  <th>{t("timeline.detail")}</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((e) => (
                  <tr key={`${e.type}-${e.id}`}>
                    <td>{time(e.at)}</td>
                    <td>{t(`timeline.${e.type}`)}</td>
                    <td>
                      <Detail entry={e} t={t} personId={account.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/** One timeline entry in words, with its ids (and codes, where they're what's searched). */
function Detail({ entry: e, t, personId }: { entry: TimelineEntry; t: T; personId: string }) {
  const join = (...p: (string | null | false | undefined)[]) => p.filter(Boolean).join(" · ");
  switch (e.type) {
    case "audit":
      return (
        <>
          {label(t, "action", e.action)}{" "}
          <span className="muted">
            <Id id={e.targetId} label={idOf(t, "target", e.targetType)} />
            {e.actorPersonId && e.actorPersonId !== personId && (
              <>
                {" · "}
                <Id id={e.actorPersonId} label={t("timeline.actorId")} />
              </>
            )}
          </span>
        </>
      );
    case "ai":
      return (
        <>
          {t("timeline.pair", { a: label(t, "task", e.task) ?? "", b: label(t, "aiStatus", e.status) ?? "" })}
          {e.failureCode && (
            <>
              {" · "}
              <Failure t={t} value={e.failureCode} />
            </>
          )}
          <br />
          <span className="muted">{join(code(e.model), t("timeline.latency", { ms: e.latencyMs }), ...(e.flags ?? []).map(code))}</span>
        </>
      );
    case "mail":
      return (
        <>
          {e.decidedBy ? t("timeline.paren", { a: label(t, "outcome", e.outcome) ?? "", b: label(t, "decider", e.decidedBy) ?? "" }) : label(t, "outcome", e.outcome)}
          <br />
          <span className="muted">
            {join(e.kind && t("timeline.looksLike", { kind: label(t, "kind", e.kind) ?? "" }), e.score !== null && t("timeline.score", { score: e.score }), e.fetchFailure && t("timeline.fetchFailed", { code: code(e.fetchFailure) ?? "" }))}{" "}
            <Id id={e.messageId} label={idOf(t, "idKey", "messageId")} />
          </span>
        </>
      );
    case "message":
      return (
        <>
          {t("timeline.pair", { a: join(label(t, "direction", e.direction), label(t, "messageKind", e.kind), label(t, "channel", e.channel)), b: label(t, "messageStatus", e.status) ?? "" })}
          {e.failure && (
            <>
              {" · "}
              <Failure t={t} value={e.failure} />
            </>
          )}
          <br />
          <span className="muted">
            {label(t, "relevance", e.relevance)} <Id id={e.id} label={idOf(t, "idKey", "messageId")} />
          </span>
        </>
      );
    case "job":
      return (
        <>
          {t("timeline.pair", { a: label(t, "job", e.job) ?? "", b: t("timeline.attempts", { attempts: e.attempts, max: e.maxAttempts }) })}
          <br />
          <span className="muted">
            {code(e.job)}{" "}
            {Object.entries(e.ids).map(([key, id]) => (
              <Id key={key} id={id} label={idOf(t, "idKey", key)} />
            ))}
          </span>
        </>
      );
  }
}
