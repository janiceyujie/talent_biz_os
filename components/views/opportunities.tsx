"use client";

import { CalendarDays, ExternalLink, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { DateTimeInput } from "@/components/app/date-time-input";
import { InfoHint } from "@/components/app/info-hint";
import { ListMore } from "@/components/app/list-more";
import { useListPages } from "@/components/app/list-pages";
import { Modal } from "@/components/app/modal";
import { TimeZonePicker } from "@/components/app/time-zone-picker";
import { Toast } from "@/components/app/toast";
import { setTodoDone } from "@/lib/actions/calendar";
import { addApplicationTask, followOpportunity, updateApplication, updateApplicationTask } from "@/lib/actions/opportunities";
import { savePreference } from "@/lib/actions/preferences";
import { dateInZone } from "@/lib/domain/dates";
import type { ListPage } from "@/lib/domain/list-page";
import { isOpenStage } from "@/lib/domain/phases";
import { areasOf } from "@/lib/opportunities/areas";
import { availability, WITHIN_DAYS } from "@/lib/opportunities/list";
import { screen, type FitReason } from "@/lib/opportunities/screening";
import {
  applicantTypes,
  applicationStages,
  countries,
  disciplines,
  emptyProfile,
  opportunityKinds,
  opportunityRegions,
  taskKinds,
  type Application,
  type ApplicationTask,
  type OpportunitiesWorkspace,
  type Opportunity,
  type ScreeningProfile,
} from "@/lib/opportunities/types";

type Run = (action: () => Promise<string | null>, success?: string) => void;

/**
 * Opportunities (decision 0024): public calls read from their sources each
 * day, screened against who you are, and the ones you follow, whose to-dos
 * are ordinary to-dos on Today and the Calendar.
 */
export function OpportunitiesView({ workspace }: { workspace: OpportunitiesWorkspace }) {
  const t = useTranslations("opportunities");
  const format = useFormatter();
  const data = useAppData();
  const profile = data.preferences["opportunities.profile"];
  const [filters, setFilters] = useState({ region: "all", kind: "all", within: "", following: "", show: "fitting", q: "" });
  const set = (key: keyof typeof filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const list = useListPages<ListPage<Opportunity>>("/api/opportunities", filters, data);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
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
  // The newest copy of the one open: a save reloads the workspace, and a followed call is in it.
  const current = selected && (workspace.followed.find((o) => o.id === selected.id) ?? selected);

  return (
    <section className="surface padded">
      <div className="section-header">
        <div>
          <h2>{t("title")}</h2>
        </div>
        <button className="secondary" onClick={() => setProfileOpen(true)}>
          {t("profile.open")}
        </button>
      </div>
      <p className="muted">
        {t("intro")} <InfoHint notes={[t("aboutSources"), t("aboutScreening"), t("aboutDates")]} />
      </p>
      <div className="toolbar wrap">
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
        <label className="check-line">
          <input type="checkbox" checked={!!filters.following} onChange={(e) => set("following")(e.target.checked ? "1" : "")} />
          {t("followingOnly")}
        </label>
        <label className="check-line">
          <input type="checkbox" checked={filters.show === "all"} onChange={(e) => set("show")(e.target.checked ? "all" : "fitting")} />
          {t("showAll")}
        </label>
      </div>
      <p className="muted opportunity-sources">
        {list.total !== null && <span role="status">{t("count", { count: list.total })}</span>}
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
      {!profile && (
        <p className="notice">
          {t("noProfile")}{" "}
          <button className="text-button" onClick={() => setProfileOpen(true)}>
            {t("profile.open")}
          </button>
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <ul className="opportunity-list">
        {list.items.map((o) => (
          <li key={o.id}>
            <OpportunityCard opportunity={o} profile={profile} application={applicationOf(o.id)} onOpen={() => setSelected(o)} />
          </li>
        ))}
      </ul>
      <ListMore list={list} failedText={t("listFailed")} />
      {!list.items.length && !list.loading && !list.failed && <p className="empty">{t(filters.following ? "emptyFollowing" : "empty")}</p>}
      {current && (
        <OpportunityDialog key={current.id} opportunity={current} profile={profile} application={applicationOf(current.id)} pending={pending} run={run} onClose={() => setSelected(null)} />
      )}
      {profileOpen && <ProfileDialog profile={profile} pending={pending} run={run} onClose={() => setProfileOpen(false)} />}
      {status && <Toast message={status} onClose={() => setStatus("")} />}
    </section>
  );
}

function useToday(o: Opportunity) {
  return dateInZone(o.timeZone);
}

function OpportunityCard({ opportunity: o, profile, application, onOpen }: { opportunity: Opportunity; profile: ScreeningProfile | null; application?: Application; onOpen: () => void }) {
  const t = useTranslations("opportunities");
  const state = availability(o, useToday(o));
  const { fit } = screen(o.rules, profile, o.checkedAt);
  return (
    <button type="button" className="opportunity-card" onClick={onOpen}>
      <span className="opportunity-card-top">
        <span className="muted">
          {t(`regions.${o.region}`)} · {o.agency}
        </span>
        <span className={`opportunity-state ${state}`}>{t(`availability.${state}`)}</span>
      </span>
      <strong>{o.title}</strong>
      <span className="opportunity-card-bottom">
        <span className={`opportunity-fit ${fit}`}>{t(`fit.${fit}`)}</span>
        <span className="muted">
          <CalendarDays size={14} aria-hidden="true" /> {o.closesOn ? t("closesOn", { date: o.closesOn }) : t("noDeadline")}
        </span>
        {application && <span className="opportunity-following">{t(`stages.${application.stage}`)}</span>}
      </span>
    </button>
  );
}

function reasonText(t: ReturnType<typeof useTranslations<"opportunities">>, r: FitReason) {
  return r.kind === "stale" ? t("reasons.stale") : t(`reasons.${r.kind}`, { dimension: t(`dimensions.${r.dimension}`) });
}

function OpportunityDialog({
  opportunity: o,
  profile,
  application,
  pending,
  run,
  onClose,
}: {
  opportunity: Opportunity;
  profile: ScreeningProfile | null;
  application?: Application;
  pending: boolean;
  run: Run;
  onClose: () => void;
}) {
  const t = useTranslations("opportunities");
  const format = useFormatter();
  const { fit, reasons } = screen(o.rules, profile, o.checkedAt);
  return (
    <Modal title={o.title} onClose={onClose}>
      <p className="muted">
        {t(`regions.${o.region}`)} · {o.agency} · {t(`kinds.${o.kind}`)}
      </p>
      <dl className="opportunity-dates">
        <div>
          <dt>{t("opens")}</dt>
          <dd>{o.opensOn ?? t("unknown")}</dd>
        </div>
        <div>
          <dt>{t("closes")}</dt>
          <dd>{o.closesOn ?? t("unknown")}</dd>
        </div>
      </dl>
      <p className="muted">{t("asChecked", { when: format.dateTime(new Date(o.checkedAt), { dateStyle: "medium", timeStyle: "short" }) })}</p>
      <p>
        <a className="secondary button-link" href={o.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} aria-hidden="true" /> {t("official")}
        </a>
      </p>
      <details className="opportunity-fit-details">
        <summary>
          {t("fitTitle")} <span className={`opportunity-fit ${fit}`}>{t(`fit.${fit}`)}</span>
        </summary>
        {reasons.length > 0 && (
          <ul>
            {reasons.map((r, i) => (
              <li key={i}>{reasonText(t, r)}</li>
            ))}
          </ul>
        )}
        {o.rules?.evidence && <p className="muted">{t("evidence", { text: o.rules.evidence })}</p>}
        <p className="muted">{t("fitCaution")}</p>
      </details>
      {application ? <ApplicationPanel application={application} opportunity={o} pending={pending} run={run} /> : <FollowForm opportunity={o} pending={pending} run={run} />}
    </Modal>
  );
}

/** Follow, with a Submit to-do on the closing date unless you change or clear it. */
function FollowForm({ opportunity: o, pending, run }: { opportunity: Opportunity; pending: boolean; run: Run }) {
  const t = useTranslations("opportunities");
  const today = useToday(o);
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
      <h3>{t("follow")}</h3>
      <p className="muted">{t(o.closesOn ? "followHelp" : "followHelpNoDate")}</p>
      <div className="form-grid">
        <DateTimeInput kind="date" label={t("submitBy")} value={date} onChange={setDate} today={dateInZone(zone)} />
        <DateTimeInput kind="time" label={t("time")} value={time} onChange={setTime} today={dateInZone(zone)} />
      </div>
      {date && <TimeZonePicker label={t("timeZone")} required value={zone} onChange={setZone} />}
      {date && o.closesOn && date > o.closesOn && <p className="notice">{t("afterDeadline")}</p>}
      <footer className="modal-actions">
        <button type="submit" className="primary" disabled={pending || (!date && !!time)}>
          {t(date ? "followAndAdd" : "follow")}
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
          <button type="submit" className="primary" disabled={pending}>
            {t("save")}
          </button>
        </footer>
      </form>
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
