"use client";

import { ExternalLink, Plus, SlidersHorizontal } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DateTimeInput } from "@/components/app/date-time-input";
import { InfoHint } from "@/components/app/info-hint";
import { ListMore } from "@/components/app/list-more";
import { useListPages } from "@/components/app/list-pages";
import { Modal } from "@/components/app/modal";
import { TimeZonePicker } from "@/components/app/time-zone-picker";
import { Toast } from "@/components/app/toast";
import { setTodoDone } from "@/lib/actions/calendar";
import { addApplicationTask, followOpportunity, unfollowOpportunity, updateApplication, updateApplicationTask } from "@/lib/actions/opportunities";
import { savePreference } from "@/lib/actions/preferences";
import { dateInZone } from "@/lib/domain/dates";
import type { ListPage } from "@/lib/domain/list-page";
import { isOpenStage } from "@/lib/domain/phases";
import { areasOf, type Area } from "@/lib/opportunities/areas";
import { availability, daysUntil, listTabs, SOON_DAYS, WITHIN_DAYS, type ListTab, type OpportunityCall, type OpportunityGroup } from "@/lib/opportunities/list";
import { screen, type FitReason } from "@/lib/opportunities/screening";
import {
  applicantTypes,
  applicationStages,
  countries,
  disciplines,
  emptyProfile,
  opportunityKinds,
  opportunityRegions,
  ruleApplicantTypes,
  taskKinds,
  type Application,
  type ApplicationTask,
  type OpportunitiesWorkspace,
  type Opportunity,
  type ScreeningProfile,
} from "@/lib/opportunities/types";

type Run = (action: () => Promise<string | null>, success?: string) => void;
type T = ReturnType<typeof useTranslations<"opportunities">>;
type ListResult = ListPage<OpportunityGroup> & { counts: Record<ListTab, number> };

/**
 * Opportunities (decision 0024): public calls read from their sources each
 * day, screened against who you are, a program's rounds and forms together,
 * and the ones you follow, whose to-dos are ordinary to-dos on Today and the
 * Calendar.
 */
export function OpportunitiesView({ workspace }: { workspace: OpportunitiesWorkspace }) {
  const t = useTranslations("opportunities");
  const format = useFormatter();
  const data = useAppData();
  const profile = data.preferences["opportunities.profile"];
  const [filters, setFilters] = useState({ region: "all", kind: "all", within: "", tab: "canApply", q: "" });
  const set = (key: keyof typeof filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const list = useListPages<ListResult>("/api/opportunities", filters, data);
  const counts = list.page?.counts;
  const [selected, setSelected] = useState<{ group: OpportunityGroup; callId: string } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run: Run = (action, success = t("saved")) =>
    startTransition(async () => {
      setError(null);
      const failure = await action().catch(() => t("failed"));
      setError(failure);
      if (!failure) setStatus(success);
    });
  const applicationOf = (id: string) => workspace.applications.find((a) => a.opportunityId === id);
  const follow = (c: OpportunityCall) => {
    const date = c.closesOn && c.closesOn >= dateInZone(c.timeZone) ? c.closesOn : "";
    run(() => followOpportunity(c.id, date ? { date, time: "", timeZone: c.timeZone } : undefined), t(date ? "followedWithTask" : "followed"));
  };
  const active = [filters.region !== "all", filters.kind !== "all", !!filters.within, !!filters.q.trim()].filter(Boolean).length;
  const tab = filters.tab as ListTab;

  return (
    <section className="surface padded">
      <div className="section-header">
        <div>
          <h2>{t("title")}</h2>
        </div>
      </div>
      <p className="muted">
        {t("intro")} <InfoHint notes={[t("aboutSources"), t("aboutScreening"), t("aboutDates")]} />
      </p>
      {profile ? (
        <div className="opportunity-profile">
          <span className="muted">{t("profileBar")}</span>
          {profileChips(t, profile).map((chip) => (
            <span key={chip} className="opportunity-chip">
              {chip}
            </span>
          ))}
          <button className="secondary" onClick={() => setProfileOpen(true)}>
            {t("editProfile")}
          </button>
        </div>
      ) : (
        <p className="notice">
          {t("noProfile")}{" "}
          <button className="text-button" onClick={() => setProfileOpen(true)}>
            {t("profile.open")}
          </button>
        </p>
      )}
      <div className="deal-tabs opportunity-tabs" role="tablist" aria-label={t("tabsLabel")}>
        {listTabs.map((key) => (
          <button key={key} role="tab" aria-selected={tab === key} aria-controls="opportunity-panel" onClick={() => set("tab")(key)}>
            {t(`tabs.${key}`)}
            {counts && <span>{counts[key]}</span>}
          </button>
        ))}
      </div>
      <button type="button" className="secondary opportunity-filters-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
        <SlidersHorizontal size={16} aria-hidden="true" /> {active ? t("filtersActive", { count: active }) : t("filters")}
      </button>
      <div className={`toolbar wrap opportunity-filters ${filtersOpen ? "open" : ""}`}>
        <input aria-label={t("search")} placeholder={t("search")} value={filters.q} onChange={(e) => set("q")(e.target.value)} />
        <select aria-label={t("region")} value={filters.region} onChange={(e) => set("region")(e.target.value)}>
          <option value="all">{t("allRegions")}</option>
          {opportunityRegions.map((r) => (
            <option key={r} value={r}>
              {t(`regions.${r}`)}
            </option>
          ))}
        </select>
        <select aria-label={t("kind")} value={filters.kind} onChange={(e) => set("kind")(e.target.value)}>
          <option value="all">{t("allKinds")}</option>
          {opportunityKinds.map((k) => (
            <option key={k} value={k}>
              {t(`kinds.${k}`)}
            </option>
          ))}
        </select>
        <select aria-label={t("within")} value={filters.within} onChange={(e) => set("within")(e.target.value)}>
          <option value="">{t("anyDeadline")}</option>
          {WITHIN_DAYS.map((d) => (
            <option key={d} value={String(d)}>
              {t("withinDays", { days: d })}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div id="opportunity-panel" role="tabpanel">
        {list.items.map((g, i) => (
          <Fragment key={g.id}>
            {g.section !== list.items[i - 1]?.section && <h3 className="opportunity-section">{t(`sections.${g.section}`, { days: SOON_DAYS })}</h3>}
            <OpportunityCard
              group={g}
              profile={profile}
              application={applicationOf(g.calls[0].id)}
              pending={pending}
              onOpen={() => setSelected({ group: g, callId: g.calls[0].id })}
              onFollow={() => follow(g.calls[0])}
            />
          </Fragment>
        ))}
        <ListMore list={list} failedText={t("listFailed")} />
        {!list.items.length && !list.loading && !list.failed && <p className="empty">{t(tab === "following" ? "emptyFollowing" : "empty")}</p>}
      </div>
      <p className="muted opportunity-sources">
        <span>{t("sourcesTitle")}</span>
        {workspace.sources.map((s) => (
          <span key={s.id}>
            {t(`sources.${s.id}`)} ·{" "}
            {s.checkedAt ? (
              // The server's and the browser's time formats can differ by a space; the browser's wins.
              <time dateTime={s.checkedAt} suppressHydrationWarning>
                {t("checkedAt", { when: format.dateTime(new Date(s.checkedAt), { dateStyle: "short", timeStyle: "short" }) })}
              </time>
            ) : (
              t("notChecked")
            )}
          </span>
        ))}
      </p>
      {selected && (
        <OpportunityDialog
          key={selected.group.id}
          group={selected.group}
          callId={selected.callId}
          onPick={(callId) => setSelected({ ...selected, callId })}
          // The newest copy of a followed call: a save reloads the workspace, and a followed call is in it.
          fresh={(c) => ({ ...(workspace.followed.find((o) => o.id === c.id) ?? c), track: c.track })}
          profile={profile}
          applicationOf={applicationOf}
          pending={pending}
          run={run}
          onClose={() => setSelected(null)}
        />
      )}
      {profileOpen && <ProfileDialog profile={profile} pending={pending} run={run} onClose={() => setProfileOpen(false)} />}
      {status && <Toast message={status} onClose={() => setStatus("")} />}
    </section>
  );
}

function useToday(o: Opportunity) {
  return dateInZone(o.timeZone);
}

/** What the profile says, as the bar above the list shows it. */
function profileChips(t: T, p: ScreeningProfile) {
  return [
    p.applicantType && t(`applicantTypes.${p.applicantType}`),
    p.area ? t("profileArea", { area: t(`areas.${p.area}`) }) : p.country && t(`countries.${p.country}`),
    ...p.disciplines.map((d) => t(`disciplines.${d}`)),
  ].filter((chip): chip is string => !!chip);
}

const dimensions = ["applicantType", "country", "area", "discipline"] as const;
type Dimension = (typeof dimensions)[number];
const ruleOf = (o: Opportunity, d: Dimension) =>
  ({ applicantType: o.rules?.applicantTypes, country: o.rules?.countries, area: o.rules?.areas, discipline: o.rules?.disciplines })[d];
const passageKey: Record<Dimension, string> = { applicantType: "applicantTypes", country: "countries", area: "areas", discipline: "disciplines" };

function valueLabel(t: T, d: Dimension, v: string) {
  if (d === "applicantType") return t(`applicantTypes.${v as (typeof ruleApplicantTypes)[number]}`);
  if (d === "country") return t(`countries.${v as (typeof countries)[number]}`);
  if (d === "area") return t(`areas.${v as Area}`);
  return t(`disciplines.${v as (typeof disciplines)[number]}`);
}

/**
 * Each rule a call states, against the profile: one it matches (with what
 * of yours it matched), one that leaves you out (with what it asks for), and
 * the ones the source or the profile doesn't say.
 */
function fitRows(t: T, o: Opportunity, profile: ScreeningProfile | null) {
  const { reasons } = screen(o.rules, profile, o.checkedAt);
  const reasonOf = (d: Dimension) => reasons.find((r) => r.kind !== "stale" && r.dimension === d);
  const mine: Record<Dimension, readonly string[]> = {
    applicantType: profile?.applicantType ? [profile.applicantType] : [],
    country: profile?.country ? [profile.country] : [],
    area: profile?.area ? [profile.area] : [],
    discipline: profile?.disciplines ?? [],
  };
  const rows = dimensions.map((d) => {
    const rule = ruleOf(o, d);
    const reason = reasonOf(d);
    const listed = (values: readonly string[]) => values.map((v) => valueLabel(t, d, v)).join(t("listSeparator"));
    if (reason?.kind === "excludes" && Array.isArray(rule)) return { d, kind: "no" as const, text: listed(rule) };
    if (reason) return { d, kind: reason.kind };
    if (rule === "any") return { d, kind: "any" as const };
    return { d, kind: "yes" as const, text: listed(mine[d].filter((v) => (rule as readonly string[] | undefined)?.includes(v))) };
  });
  return { rows, stale: reasons.some((r) => r.kind === "stale") };
}

function OpportunityCard({
  group: g,
  profile,
  application,
  pending,
  onOpen,
  onFollow,
}: {
  group: OpportunityGroup;
  profile: ScreeningProfile | null;
  application?: Application;
  pending: boolean;
  onOpen: () => void;
  onFollow: () => void;
}) {
  const t = useTranslations("opportunities");
  const c = g.calls[0];
  const today = useToday(c);
  const state = availability(c, today);
  const { rows } = fitRows(t, c, profile);
  const chips = rows.filter((r) => (r.kind === "yes" && r.d !== "country") || r.kind === "no");
  const toCheck = rows.filter((r) => r.kind === "unknown" || r.kind === "missing").map((r) => t(`dimensions.${r.d}`));
  return (
    <article className={`opportunity-card ${g.section}`}>
      {c.closesOn && (
        <div className={`opportunity-deadline ${g.section}`}>
          <span>{t("closes")}</span>
          <strong>{c.closesOn.slice(5).replace("-", "/")}</strong>
          <span>{state === "closed" ? t("availability.closed") : t("daysLeft", { days: daysUntil(c.closesOn, today) })}</span>
        </div>
      )}
      <div className="opportunity-card-body">
        <span className="muted">
          {c.agency} · {t(`kinds.${c.kind}`)}
          {state === "upcoming" && c.opensOn && ` · ${t("opensFrom", { date: c.opensOn.slice(5).replace("-", "/") })}`}
        </span>
        <button type="button" className="opportunity-card-title" onClick={onOpen}>
          {g.program}
          {c.track && ` · ${c.track}`}
        </button>
        <span className="opportunity-chips">
          {chips.map((r) => (
            <span key={r.d} className={`opportunity-chip ${r.kind}`}>
              {r.kind === "yes" ? "✓ " : "✕ "}
              {r.kind === "no" ? t("onlyFor", { values: r.text ?? "" }) : r.text}
            </span>
          ))}
          {g.calls.length > 1 && <span className="opportunity-chip more">{t("moreTracks", { count: g.calls.length - 1 })}</span>}
          {!c.closesOn && <span className="muted">{t("standingHelp")}</span>}
          {g.fit === "check" && toCheck.length > 0 && <span className="muted">{t("toCheck", { list: toCheck.join(t("listSeparator")) })}</span>}
        </span>
      </div>
      {application ? (
        <span className="opportunity-following">{t(`stages.${application.stage}`)}</span>
      ) : (
        <button type="button" className={g.section === "soon" ? "primary" : "secondary"} disabled={pending} aria-label={t("followNamed", { title: g.program })} onClick={onFollow}>
          {t("follow")}
        </button>
      )}
    </article>
  );
}

function reasonText(t: T, r: FitReason) {
  return r.kind === "stale" ? t("reasons.stale") : t(`reasons.${r.kind}`, { dimension: t(`dimensions.${r.dimension}`) });
}

function OpportunityDialog({
  group: g,
  callId,
  onPick,
  fresh,
  profile,
  applicationOf,
  pending,
  run,
  onClose,
}: {
  group: OpportunityGroup;
  callId: string;
  onPick: (callId: string) => void;
  fresh: (c: OpportunityCall) => OpportunityCall;
  profile: ScreeningProfile | null;
  applicationOf: (id: string) => Application | undefined;
  pending: boolean;
  run: Run;
  onClose: () => void;
}) {
  const t = useTranslations("opportunities");
  const format = useFormatter();
  const o = fresh(g.calls.find((c) => c.id === callId) ?? g.calls[0]);
  const today = useToday(o);
  const application = applicationOf(o.id);
  const { rows, stale } = fitRows(t, o, profile);
  const named = (kind: string) => rows.filter((r) => r.kind === kind).map((r) => t(`dimensions.${r.d}`)).join(t("listSeparator"));
  const span = (c: Opportunity) => [c.opensOn, c.closesOn].map((d) => (d ? d.slice(5).replace("-", "/") : "?")).join(" – ");
  return (
    <Modal title={g.program} onClose={onClose}>
      <p className="muted">
        {t(`regions.${o.region}`)} · {o.agency} · {t(`kinds.${o.kind}`)}
      </p>
      {g.calls.length > 1 && (
        <fieldset className="opportunity-tracks">
          <legend>{t("tracksTitle")}</legend>
          {g.calls.map((c) => (
            <button key={c.id} type="button" aria-pressed={c.id === o.id} onClick={() => onPick(c.id)}>
              <strong>{c.track ?? g.program}</strong>
              <span className="muted">{span(c)}</span>
              {applicationOf(c.id) && <span className="opportunity-following">{t(`stages.${applicationOf(c.id)!.stage}`)}</span>}
            </button>
          ))}
        </fieldset>
      )}
      <dl className="opportunity-dates">
        <div>
          <dt>{t("opens")}</dt>
          <dd>{o.opensOn ?? t("unknown")}</dd>
        </div>
        <div>
          <dt>{t("closes")}</dt>
          <dd>
            {o.closesOn ?? t("unknown")}
            {o.closesOn && o.closesOn >= today && <span className="muted"> · {t("daysLeft", { days: daysUntil(o.closesOn, today) })}</span>}
          </dd>
        </div>
      </dl>
      <section className="opportunity-fit-rows" aria-label={t("fitTitle")}>
        <h3>{t("fitTitle")}</h3>
        <ul>
          {rows
            .filter((r) => r.kind === "yes" || r.kind === "no")
            .map((r) => (
              <li key={r.d} className={r.kind}>
                <span aria-hidden="true">{r.kind === "yes" ? "✓" : "✕"}</span>
                <div>
                  {t("fitRow", { dimension: t(`dimensions.${r.d}`), values: r.kind === "no" ? t("onlyFor", { values: r.text ?? "" }) : (r.text ?? "") })}
                  {o.passages?.[passageKey[r.d]] && <p className="muted">「{o.passages[passageKey[r.d]]}」</p>}
                </div>
              </li>
            ))}
          {named("unknown") && (
            <li className="unknown">
              <span aria-hidden="true">?</span>
              <div>{t("sourceSilent", { list: named("unknown") })}</div>
            </li>
          )}
          {named("missing") && (
            <li className="unknown">
              <span aria-hidden="true">?</span>
              <div>
                {t("profileSilent", { list: named("missing") })}
              </div>
            </li>
          )}
          {stale && (
            <li className="unknown">
              <span aria-hidden="true">?</span>
              <div>{reasonText(t, { kind: "stale" })}</div>
            </li>
          )}
        </ul>
        {o.rules?.evidence && !o.passages && <p className="muted">{t("evidence", { text: o.rules.evidence })}</p>}
        <p className="muted">{t("fitCaution")}</p>
      </section>
      <p className="opportunity-official">
        <a className="secondary button-link" href={o.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} aria-hidden="true" /> {t("official")}
        </a>
        <span className="muted">{t("asChecked", { when: format.dateTime(new Date(o.checkedAt), { dateStyle: "medium", timeStyle: "short" }) })}</span>
      </p>
      {application ? (
        <ApplicationPanel key={o.id} application={application} opportunity={o} pending={pending} run={run} />
      ) : (
        <FollowForm key={o.id} opportunity={o} label={o.track ? t("followTrack") : t("follow")} pending={pending} run={run} />
      )}
    </Modal>
  );
}

/** Follow in one press, with a Submit to-do on the closing date; its date, time, and zone can be changed first. */
function FollowForm({ opportunity: o, label, pending, run }: { opportunity: Opportunity; label: string; pending: boolean; run: Run }) {
  const t = useTranslations("opportunities");
  const today = useToday(o);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(o.closesOn && o.closesOn >= today ? o.closesOn : "");
  const [time, setTime] = useState("");
  const [zone, setZone] = useState(o.timeZone);
  return (
    <form
      className="editor-form section-gap"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => followOpportunity(o.id, date ? { date, time, timeZone: zone } : undefined), t(date ? "followedWithTask" : "followed"));
      }}
    >
      <p className="muted">
        {date ? t("followWithDate", { date }) : t(o.closesOn ? "followHelp" : "followHelpNoDate")}{" "}
        {!editing && (
          <button type="button" className="text-button" onClick={() => setEditing(true)}>
            {t(date ? "changeDate" : "addDate")}
          </button>
        )}
      </p>
      {editing && (
        <>
          <div className="form-grid">
            <DateTimeInput kind="date" label={t("submitBy")} value={date} onChange={setDate} today={dateInZone(zone)} />
            <DateTimeInput kind="time" label={t("time")} value={time} onChange={setTime} today={dateInZone(zone)} />
          </div>
          {date && <TimeZonePicker label={t("timeZone")} required value={zone} onChange={setZone} />}
          {date && o.closesOn && date > o.closesOn && <p className="notice">{t("afterDeadline")}</p>}
        </>
      )}
      <footer className="modal-actions">
        <button type="submit" className="primary" disabled={pending || (!date && !!time)}>
          {label}
        </button>
      </footer>
    </form>
  );
}

function ApplicationPanel({ application: a, opportunity: o, pending, run }: { application: Application; opportunity: Opportunity; pending: boolean; run: Run }) {
  const t = useTranslations("opportunities");
  const data = useAppData();
  const today = useToday(o);
  const [stage, setStage] = useState(a.stage);
  const [projectId, setProjectId] = useState(a.projectId ?? "");
  const [notes, setNotes] = useState(a.notes);
  const [editing, setEditing] = useState<ApplicationTask | "new" | null>(null);
  const [unfollowing, setUnfollowing] = useState(false);
  const open = a.tasks.filter((task) => task.status === "open");
  const done = a.tasks.filter((task) => task.status === "done");
  const projects = data.projects.filter((p) => (!p.archived && isOpenStage(p.stage)) || p.id === a.projectId);
  return (
    <div className="section-gap">
      <h3>{t("tasksTitle")}</h3>
      {!open.length && <p className="muted">{t("noOpenTasks")}</p>}
      <TaskList tasks={open} pending={pending} run={run} onEdit={setEditing} />
      {done.length > 0 && (
        <details>
          <summary>{t("doneTasks", { count: done.length })}</summary>
          <TaskList tasks={done} pending={pending} run={run} onEdit={setEditing} />
        </details>
      )}
      <div className="row-actions">
        <button type="button" className="secondary" onClick={() => setEditing("new")}>
          <Plus size={16} aria-hidden="true" /> {t("addTask")}
        </button>
        <Link href={open[0]?.date ? `/calendar?day=${open[0].date}` : "/calendar"}>{t("calendar")}</Link>
      </div>
      <form
        className="editor-form section-gap"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateApplication({ id: a.id, stage, projectId, notes }));
        }}
      >
        <h3>{t("application")}</h3>
        <div className="form-grid">
          <label>
            {t("stage")}
            <select value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}>
              {applicationStages.map((s) => (
                <option key={s} value={s}>
                  {t(`stages.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("project")}
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{t("noProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t("notes")}
          <textarea value={notes} maxLength={10000} rows={3} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <p className="muted">{t("applicationHelp")}</p>
        <footer className="modal-actions">
          {/* Past Preparing it's a record of applying: Closed, not unfollowed. */}
          {a.stage === "preparing" && (
            <button type="button" className="secondary danger-outline" disabled={pending} onClick={() => setUnfollowing(true)}>
              {t("unfollow")}
            </button>
          )}
          <button type="submit" className="primary" disabled={pending}>
            {t("save")}
          </button>
        </footer>
      </form>
      {unfollowing && (
        <ConfirmDialog
          title={t("unfollowTitle", { title: o.title })}
          confirmLabel={t("unfollow")}
          pending={pending}
          onClose={() => setUnfollowing(false)}
          onConfirm={() => run(() => unfollowOpportunity(a.id), t("unfollowed"))}
        >
          <p>{t("unfollowBody", { count: open.length })}</p>
        </ConfirmDialog>
      )}
      {editing && (
        <TaskDialog
          task={editing === "new" ? undefined : editing}
          applicationId={a.id}
          opportunityTitle={o.title}
          defaultDate={o.closesOn && o.closesOn >= today ? o.closesOn : today}
          defaultZone={o.timeZone}
          pending={pending}
          run={run}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TaskList({ tasks, pending, run, onEdit }: { tasks: ApplicationTask[]; pending: boolean; run: Run; onEdit: (task: ApplicationTask) => void }) {
  const t = useTranslations("opportunities");
  return (
    <ul className="opportunity-tasks">
      {tasks.map((task) => {
        const overdue = task.status === "open" && !!task.date && task.date < dateInZone(task.timeZone);
        return (
          <li key={task.id}>
            <label className="check-line">
              <input type="checkbox" checked={task.status === "done"} disabled={pending} onChange={(e) => run(() => setTodoDone(task.id, e.target.checked))} />
              <span className={task.status === "done" ? "struck" : ""}>{task.title}</span>
            </label>
            <button type="button" className={`text-button ${overdue ? "overdue" : ""}`} aria-label={t("editTaskNamed", { title: task.title })} onClick={() => onEdit(task)}>
              {overdue && `${t("overdue")} · `}
              {task.date}
              {task.time && ` ${task.time}`}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TaskDialog({
  task,
  applicationId,
  opportunityTitle,
  defaultDate,
  defaultZone,
  pending,
  run,
  onClose,
}: {
  task?: ApplicationTask;
  applicationId: string;
  opportunityTitle: string;
  defaultDate: string;
  defaultZone: string;
  pending: boolean;
  run: Run;
  onClose: () => void;
}) {
  const t = useTranslations("opportunities");
  const titleFor = (k: (typeof taskKinds)[number]) => `${t(`tasks.${k}`)} · ${opportunityTitle}`.slice(0, 200);
  const [kind, setKind] = useState(task?.kind ?? "submission");
  const [title, setTitle] = useState(task?.title ?? titleFor("submission"));
  const [date, setDate] = useState(task?.date ?? defaultDate);
  const [time, setTime] = useState(task?.time ?? "");
  const [zone, setZone] = useState(task?.timeZone ?? defaultZone);
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <Modal title={t(task ? "editTask" : "addTask")} onClose={onClose}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          const values = { applicationId, kind, title, date, time, timeZone: zone };
          run(async () => {
            const failure = task ? await updateApplicationTask({ ...values, taskId: task.id }) : await addApplicationTask({ ...values, requestId });
            if (!failure) onClose();
            return failure;
          });
        }}
      >
        <label>
          {t("taskKind")}
          <select
            value={kind}
            onChange={(e) => {
              const next = e.target.value as typeof kind;
              if (title === titleFor(kind)) setTitle(titleFor(next)); // still the suggested title: follow the kind
              setKind(next);
            }}
          >
            {taskKinds.map((k) => (
              <option key={k} value={k}>
                {t(`tasks.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("taskTitle")}
          <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="form-grid">
          <DateTimeInput kind="date" label={t("date")} required value={date} onChange={setDate} today={dateInZone(zone)} />
          <DateTimeInput kind="time" label={t("time")} value={time} onChange={setTime} today={dateInZone(zone)} />
        </div>
        <TimeZonePicker label={t("timeZone")} required value={zone} onChange={setZone} />
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="primary" disabled={pending}>
            {t("save")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function ProfileDialog({ profile, pending, run, onClose }: { profile: ScreeningProfile | null; pending: boolean; run: Run; onClose: () => void }) {
  const t = useTranslations("opportunities");
  const [value, setValue] = useState(profile ?? emptyProfile);
  const choices = areasOf(value.country);
  return (
    <Modal title={t("profile.title")} onClose={onClose}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const failure = await savePreference("opportunities.profile", value);
            if (!failure) onClose();
            return failure;
          });
        }}
      >
        <p className="muted">{t("profile.help")}</p>
        <div className="form-grid">
          <label>
            {t("dimensions.applicantType")}
            <select value={value.applicantType ?? ""} onChange={(e) => setValue({ ...value, applicantType: (e.target.value || null) as ScreeningProfile["applicantType"] })}>
              <option value="">{t("profile.notSaying")}</option>
              {applicantTypes.map((k) => (
                <option key={k} value={k}>
                  {t(`applicantTypes.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("dimensions.country")}
            <select
              value={value.country ?? ""}
              onChange={(e) => {
                const country = (e.target.value || null) as ScreeningProfile["country"];
                setValue({ ...value, country, area: value.area && areasOf(country).includes(value.area) ? value.area : null });
              }}
            >
              <option value="">{t("profile.notSaying")}</option>
              {countries.map((k) => (
                <option key={k} value={k}>
                  {t(`countries.${k}`)}
                </option>
              ))}
            </select>
          </label>
          {choices.length > 0 && (
            <label>
              {t("dimensions.area")}
              <select value={value.area ?? ""} onChange={(e) => setValue({ ...value, area: (e.target.value || null) as ScreeningProfile["area"] })}>
                <option value="">{t("profile.notSaying")}</option>
                {choices.map((k) => (
                  <option key={k} value={k}>
                    {t(`areas.${k}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <fieldset className="form-section">
          <legend>{t("dimensions.discipline")}</legend>
          {disciplines.map((d) => (
            <label key={d} className="check-line">
              <input
                type="checkbox"
                checked={value.disciplines.includes(d)}
                onChange={(e) => setValue({ ...value, disciplines: e.target.checked ? [...value.disciplines, d] : value.disciplines.filter((x) => x !== d) })}
              />
              {t(`disciplines.${d}`)}
            </label>
          ))}
        </fieldset>
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="primary" disabled={pending}>
            {t("save")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
