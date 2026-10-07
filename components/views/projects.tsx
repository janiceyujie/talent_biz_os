"use client";

import { Archive, ArrowDownUp, ArrowLeft, Ellipsis, Funnel, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useAppData } from "@/components/app/app-data";
import { InfoHint } from "@/components/app/info-hint";
import { PageHeader } from "@/components/app/page-header";
import { useProjectDetail, withDetail } from "@/components/app/project-detail";
import { useProjectPages } from "@/components/app/project-pages";
import { projectRecord, RecordEditor, type Editor } from "@/components/app/record-editor";
import { archiveProject, setProjectStage } from "@/lib/actions/projects";
import { dateInZone } from "@/lib/domain/dates";
import { daysBetween } from "@/lib/domain/insights";
import { useMoney } from "@/lib/i18n/format";
import { isSigned, mainStages, phaseOf, phases, type Phase } from "@/lib/domain/phases";
import { listSorts, type ListSort, type ListView } from "@/lib/domain/project-list";
import { projectQuoteTotal, projectSettlement } from "@/lib/domain/workflow";
import { calendarPoints } from "@/lib/calendar/points";
import { useLabels } from "@/lib/i18n/labels";
import { projectTypes } from "@/lib/project-types";
import type { ProjectSummary, Stage } from "@/lib/types";
import { useClosingChecks, ProjectWorkflowPanel } from "./project-workflow-panel";
import { ProjectOverview } from "./project-overview";
import { TravelItinerary } from "./travel-itinerary";
import { ContractVersions, ProjectTimeline } from "./project-timeline";

const NARROW = "(max-width: 1000px)"; // list and detail stack: show one at a time

// Where the list was, so coming back (e.g. from a draft) finds the same rows at the same place.
// One entry per tab session; stale or unreadable storage just means starting at the top.
const PLACE_KEY = "projects.list-place";
type Place = { list: string; rows: number; top: number };
function readPlace(list: string): Place | null {
  try {
    const place = JSON.parse(sessionStorage.getItem(PLACE_KEY) ?? "null") as Place | null;
    return place?.list === list ? place : null;
  } catch {
    return null;
  }
}
function writePlace(place: Place) {
  try {
    sessionStorage.setItem(PLACE_KEY, JSON.stringify(place));
  } catch {}
}

type Tab = "overview" | "timeline" | "money" | "travel" | "contract";
type Scope = "phase" | "all" | "archived";

/** "In 3 days", "Tomorrow", "2 days overdue", and how urgent that is, from a due date. */
function useDue() {
  const t = useTranslations("projects");
  const data = useAppData();
  const today = dateInZone(data.talent.timeZone);
  return (due: string | null | undefined) => {
    if (!due) return null;
    const days = daysBetween(today, due);
    if (days < 0) return { text: t("overdue", { days: -days }), tone: "overdue" };
    if (days === 0) return { text: t("dueToday"), tone: "soon" };
    if (days === 1) return { text: t("dueTomorrow"), tone: "soon" };
    return { text: t("dueIn", { days }), tone: days <= 3 ? "soon" : "" };
  };
}

/**
 * The list's view, filters, order, and open project come from the address and stay in it as they change:
 * `?id=` opens a project (and its phase), `?phase=` a phase tab (as Today's Deals by phase links) or `all`,
 * `?archived=1`, `?type=`, `?q=`, and `?sort=` the rest. Read from the live address, not the page's props:
 * the address changes in place (history.replaceState), so props cached for Back would be stale.
 */
export function ProjectsView() {
  const address = useSearchParams();
  const [initial] = useState(() => ({
    selectedId: address.get("id") ?? "",
    phase: phases.find((p) => p === address.get("phase")),
    scope: (address.get("archived") === "1" ? "archived" : address.get("phase") === "all" ? "all" : "phase") as Scope,
    type: projectTypes.find((pt) => pt.key === address.get("type"))?.key ?? "all",
    q: (address.get("q") ?? "").slice(0, 200),
    sort: listSorts.find((s) => s === address.get("sort")) ?? "due",
  }));
  const { selectedId, phase: initialPhase } = initial;
  const data = useAppData();
  const money = useMoney();
  const due = useDue();
  const t = useTranslations("projects");
  const labels = useLabels();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState(initial.q);
  const [type, setType] = useState<string>(initial.type);
  // Which projects the list covers: one phase, every active project, or the archived ones.
  const [scope, setScope] = useState<Scope>(initial.scope);
  const archived = scope === "archived";
  // Typing a search widens one phase to every active project, since people search without knowing the stage;
  // clearing it goes back to that phase. A tab picked mid-search is the person's choice and stays.
  const widened = useRef(false);
  const searchFor = (text: string) => {
    setSearch(text);
    if (text.trim() && scope === "phase") {
      widened.current = true;
      setScope("all");
    } else if (!text.trim() && widened.current) {
      widened.current = false;
      setScope("phase");
    }
  };
  const showScope = (next: Scope, nextPhase?: Phase) => {
    widened.current = false;
    setScope(next);
    if (nextPhase) setPhase(nextPhase);
    setSelected("");
  };
  const [sort, setSort] = useState<ListSort>(initial.sort);
  const [selected, setSelected] = useState(selectedId);
  // On narrow screens the list and the detail take turns; a linked project opens straight to its detail.
  const [detailOpen, setDetailOpen] = useState(!!selectedId);
  const [phase, setPhase] = useState<Phase>(() => {
    const linked = data.projects.find((p) => p.id === selectedId);
    if (linked) return phaseOf(linked.stage);
    if (initialPhase) return initialPhase;
    // Signed work first; otherwise the first phase that has projects.
    const live = data.projects.filter((p) => !p.archived);
    const order: Phase[] = ["execution", "negotiation", "settlement", "ended"];
    return order.find((ph) => live.some((p) => phaseOf(p.stage) === ph)) ?? "execution";
  });
  // A page at a time from the server (decision 0011). Archived is its own view, not a filter on a phase.
  const view: ListView = scope === "phase" ? phase : scope;
  const listId = `${view}|${type}|${search.trim()}|${sort}`;
  const [arrival] = useState(() => (typeof window === "undefined" ? null : readPlace(listId)));
  const list = useProjectPages({ view, type, q: search, sort }, data.projects, arrival?.rows ?? 0);
  const visible = list.items;
  // A linked project shows even before its page has loaded (the layout's summary has it).
  const linked = selected ? visible.find((p) => p.id === selected) ?? data.projects.find((p) => p.id === selected && p.archived === archived) : undefined;
  const active = linked ?? visible[0];
  const quoteText = (p: ProjectSummary) => {
    const total = projectQuoteTotal(p);
    return total === null ? t("quoteNotSet") : money(total);
  };
  // Near the end of the list, the next page: watched in the list's own scroll area on wide screens, the page on narrow ones.
  const panel = useRef<HTMLElement>(null);
  const end = useRef<HTMLLIElement>(null);
  const { loadMore } = list;
  useEffect(() => {
    const target = end.current;
    if (!target) return;
    const root = window.matchMedia(NARROW).matches ? null : panel.current;
    const watch = new IntersectionObserver((seen) => seen.some((e) => e.isIntersecting) && loadMore(), { root, rootMargin: "600px 0px" });
    watch.observe(target);
    return () => watch.disconnect();
  }, [loadMore, list.hasMore]);

  // On a phone the tabs scroll sideways: keep the chosen one in sight (again once the counts widen the tabs).
  const tabsRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabsRow.current?.querySelector(".active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [scope, phase, list.counts]);
  // The right edge fades only while there are tabs past it.
  useEffect(() => {
    const row = tabsRow.current;
    if (!row) return;
    const mark = () => row.classList.toggle("has-more", row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
    mark();
    row.addEventListener("scroll", mark, { passive: true });
    window.addEventListener("resize", mark);
    return () => {
      row.removeEventListener("scroll", mark);
      window.removeEventListener("resize", mark);
    };
  }, [list.counts]);

  // The address follows the list (replacing, so filters don't pile up in Back).
  useEffect(() => {
    const params = new URLSearchParams(archived ? { archived: "1" } : { phase: scope === "all" ? "all" : phase });
    if (type !== "all") params.set("type", type);
    if (search.trim()) params.set("q", search.trim());
    if (sort !== "due") params.set("sort", sort);
    if (selected) params.set("id", selected);
    const next = `${window.location.pathname}?${params}`;
    if (next !== window.location.pathname + window.location.search) window.history.replaceState(null, "", next);
  }, [archived, scope, phase, type, search, sort, selected]);

  // The scroll area: the list panel on wide screens, the page on narrow ones.
  const scroller = () => (window.matchMedia(NARROW).matches ? document.scrollingElement : panel.current);
  // Remember the place on the way out; on arrival, go back to it once its rows are in.
  const place = useRef({ list: listId, rows: 0, top: arrival?.top ?? 0 });
  // While a phone shows a project instead of the list, the page's scroll is the project's, not the list's.
  const detailShown = useRef(false);
  useEffect(() => {
    detailShown.current = detailOpen && window.matchMedia(NARROW).matches;
  }, [detailOpen]);
  const backToList = () => {
    setDetailOpen(false);
    requestAnimationFrame(() => window.scrollTo({ top: place.current.top }));
  };
  useEffect(() => {
    place.current.list = listId;
    place.current.rows = visible.length;
  }, [listId, visible.length]);
  useEffect(() => {
    // Tracked as it changes: by the time this unmounts, the panel may already be gone.
    const area = panel.current;
    const track = () => {
      if (!detailShown.current) place.current.top = scroller()?.scrollTop ?? 0;
    };
    const save = () => writePlace(place.current);
    area?.addEventListener("scroll", track, { passive: true });
    window.addEventListener("scroll", track, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      area?.removeEventListener("scroll", track);
      window.removeEventListener("scroll", track);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, []); // reads the latest place through refs
  // A different list starts at its top.
  const shownList = useRef(listId);
  useEffect(() => {
    if (shownList.current === listId) return;
    shownList.current = listId;
    if (!window.matchMedia(NARROW).matches) panel.current?.scrollTo({ top: 0 });
  }, [listId]);
  const restored = useRef(!arrival);
  useEffect(() => {
    if (restored.current || !arrival || list.loading || list.total === null) return; // nothing in yet
    if (visible.length < arrival.rows && list.hasMore) return; // still loading back in
    restored.current = true;
    if (detailShown.current) return; // a phone came back to the project; "Back to list" restores the list's place
    requestAnimationFrame(() => scroller()?.scrollTo({ top: arrival.top }));
  }, [visible.length, list.hasMore, list.loading, list.total]); // eslint-disable-line react-hooks/exhaustive-deps -- once, when the rows are in

  return (
    <div className={`deals-workspace ${detailOpen && active ? "is-detail-open" : ""}`}>
      {/* Creating is the page's own action, beside the title as on Today and Intake; the controls below only shape the list. */}
      <PageHeader titleKey="projects">
        <button className="primary" onClick={() => setEditor({ kind: "project" })}>
          <Plus size={16} aria-hidden="true" />
          {t("newProject")}
        </button>
      </PageHeader>
      <section className="deal-controls">
        <div className="deal-phase-row">
          <div ref={tabsRow} className="phase-tabs" role="group" aria-label={t("phases")}>
            {/* Every active project, whatever its stage: where a search lands. */}
            <button aria-pressed={scope === "all"} className={scope === "all" ? "active" : ""} onClick={() => showScope("all")}>
              <strong>{t("allPhases")}</strong>
              <span>{list.counts?.all ?? "–"}</span>
            </button>
            {phases.map((p) => (
              <button
                key={p}
                aria-pressed={scope === "phase" && phase === p}
                className={scope === "phase" && phase === p ? "active" : ""}
                onClick={() => showScope("phase", p)}
              >
                <strong>{t(`phase.${p}`)}</strong>
                <span>{list.counts?.[p] ?? "–"}</span>
              </button>
            ))}
            {/* Set apart from the phases: a different place, not another step. */}
            <button
              aria-pressed={archived}
              className={`archive-tab ${archived ? "active" : ""}`}
              aria-label={`${t("archivedOnly")} ${list.counts?.archived ?? ""}`}
              onClick={() => showScope("archived")}
            >
              <Archive size={16} aria-hidden="true" />
              <strong>{t("archivedOnly")}</strong>
              <span>{list.counts?.archived ?? "–"}</span>
            </button>
          </div>
          {/* Above: opening downward would cover the list it explains. */}
          {!archived && <InfoHint above notes={[scope === "all" ? t("allCaption") : t(`phaseCaption.${phase}`)]} />}
        </div>
        <div className="toolbar">
          <input
            type="search"
            aria-label={t("search")}
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => searchFor(e.target.value)}
          />
          {/* A funnel says it narrows the list; it's highlighted while a type is chosen. */}
          <label className={`type-filter ${type !== "all" ? "active" : ""}`}>
            <Funnel size={16} aria-hidden="true" />
            <select aria-label={t("typeFilter")} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">{t("allTypes")}</option>
              {projectTypes.map((pt) => (
                <option key={pt.key} value={pt.key}>
                  {labels.projectType(pt.key)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      {archived && (
        <div className="archive-banner" role="status">
          <Archive size={18} aria-hidden="true" />
          <span>
            <strong>{t("archivedBanner")}</strong> {t("archivedBannerNote")}
          </span>
          <button className="text-button" onClick={() => showScope("phase")}>
            {t("archivedBack")}
          </button>
        </div>
      )}
      <div className="deals-layout">
        {/* A case folder: the list picks a project, the dossier is where work on it happens. */}
        <section ref={panel} className="surface deal-list-panel" aria-label={t("listLabel")} aria-busy={list.loading}>
          <div className="deal-list-header">
            <span aria-live="polite">{list.total === null ? t("loading") : t("count", { count: list.total })}</span>
            <label className="deal-sort">
              <ArrowDownUp size={14} aria-hidden="true" />
              <span className="sr-only">{t("sort")}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as ListSort)}>
                {listSorts.map((key) => (
                  <option key={key} value={key}>
                    {t(`sortBy.${key}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul className="deal-list">
            {visible.map((p) => {
              const d = p.archived ? null : due(p.nextAction?.dueDate); // nothing is due on archived work
              return (
                <li key={p.id}>
                  <button
                    className={`deal-list-item ${active?.id === p.id ? "is-selected" : ""}`}
                    aria-pressed={active?.id === p.id}
                    onClick={() => {
                      setSelected(p.id);
                      setDetailOpen(true);
                      // On a phone the project replaces the list: keep the list's place for the way back.
                      if (window.matchMedia(NARROW).matches) {
                        place.current.top = window.scrollY;
                        window.scrollTo({ top: 0 });
                      }
                    }}
                  >
                    <span className="deal-list-line">
                      <strong className="deal-list-title">{p.title}</strong>
                      <span className="deal-list-amount">{quoteText(p)}</span>
                    </span>
                    <span className="deal-list-line deal-list-meta">
                      <span className="deal-list-partner">
                        {p.counterparty} · {labels.stage(p.stage)}
                      </span>
                      {d && <span className={`due ${d.tone}`}>{d.text}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {list.hasMore && (
              // Also a button, for keyboards and if scrolling doesn't trigger it.
              <li ref={end} className="deal-list-more">
                <button className="text-button" disabled={list.loading} onClick={loadMore}>
                  {list.loading ? t("loading") : t("loadMore")}
                </button>
              </li>
            )}
          </ul>
          {list.failed && (
            <p className="notice error" role="alert">
              {t("listFailed")}{" "}
              <button className="text-button" onClick={list.retry}>
                {t("retry")}
              </button>
            </p>
          )}
          {!visible.length && !list.loading && !list.failed && <p className="empty">{t(archived ? "archivedEmpty" : search.trim() ? "noMatches" : "empty")}</p>}
        </section>
        {active && <ProjectDetail key={active.id} project={active} edit={setEditor} onBack={backToList} onMoved={(next) => scope === "phase" && setPhase(next)} />}
      </div>
      {editor && (
        <RecordEditor
          editor={editor}
          onClose={() => setEditor(null)}
          // Show a saved project under its phase tab.
          onSaved={(saved) => editor.kind === "project" && setPhase(phaseOf(saved.stage as Stage))}
        />
      )}
    </div>
  );
}

/** One project: who and what, its stage, the next step and money at a glance, then the rest in tabs. */
function ProjectDetail({
  project,
  edit,
  onBack,
  onMoved,
}: {
  project: ProjectSummary;
  edit: (e: Editor) => void;
  onBack: () => void;
  onMoved: (phase: Phase) => void;
}) {
  const data = useAppData();
  const money = useMoney();
  const due = useDue();
  const router = useRouter();
  const t = useTranslations("projects");
  const tWorkflow = useTranslations("workflow");
  const labels = useLabels();
  const [tab, setTab] = useState<Tab>("overview");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const { detail, loading, failed } = useProjectDetail(project);
  // The full project (details, notes) arrives with the detail; until then the summary shows.
  const full = detail ? withDetail(project, detail) : null;
  const checks = useClosingChecks(full);
  const settlement = projectSettlement(data, project);
  // New linked items need a live, signed project; the server enforces the same rule.
  const signed = !project.archived && isSigned(project.stage);
  const exited = project.stage === "declined" || project.stage === "cancelled";
  const next = due(project.nextAction?.dueDate);
  const counts: Record<Tab, number> = {
    overview: 0,
    timeline: detail?.timeline.length ?? 0,
    money: data.payments.filter((p) => p.projectId === project.id && !p.voided).length,
    travel: calendarPoints(
      data.calendar.filter((c) => c.projectId === project.id && !c.archived && ["travel", "accommodation", "performance"].includes(c.kind)),
    ).length,
    contract: data.contracts.filter((c) => c.projectId === project.id).length,
  };
  const tabs: Tab[] = ["overview", "timeline", "money", "travel", ...(counts.contract ? (["contract"] as const) : [])];

  useEffect(() => {
    if (window.matchMedia(NARROW).matches) heading.current?.focus({ preventScroll: true });
  }, []);

  const moveTo = (stage: Stage) =>
    startTransition(async () => {
      const failure = await setProjectStage(project.id, stage);
      setError(failure);
      // Follow the project to its new phase tab.
      if (!failure) onMoved(phaseOf(stage));
    });

  return (
    <article className="surface deal-detail deal-dossier">
      <button className="text-button deal-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t("back")}
      </button>
      <header className="deal-dossier-header">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {project.title}
          </h2>
          <p>
            {project.counterparty} · {labels.projectType(project.type)}
          </p>
        </div>
        <div className="deal-header-actions">
          {!project.archived && (
            <button className="secondary" onClick={() => router.push(`/drafts?project=${project.id}`)}>
              {t("draft")}
            </button>
          )}
          <button className="primary" disabled={!full} onClick={() => full && edit({ kind: "project", item: projectRecord(full) })}>
            {t("editFull")}
          </button>
          <MoreMenu label={t("more")}>
            {!exited && !project.archived && (
              <>
                <button role="menuitem" disabled={pending} onClick={() => moveTo("declined")}>
                  {t("markDeclined")}
                </button>
                <button role="menuitem" disabled={pending} onClick={() => moveTo("cancelled")}>
                  {t("markCancelled")}
                </button>
              </>
            )}
            <button
              role="menuitem"
              disabled={pending}
              onClick={() => startTransition(async () => setError(await archiveProject(project.id, !project.archived)))}
            >
              {project.archived ? t("restore") : t("archive")}
            </button>
          </MoreMenu>
        </div>
      </header>

      {/* One stage control: each step is a button that moves the project there. */}
      <ol className="stage-progress" aria-label={t("stageProgress")}>
        {exited && (
          <li className="exited" aria-current="step">
            <span>{labels.stage(project.stage)}</span>
          </li>
        )}
        {mainStages.map((stage, i) => {
          const at = mainStages.indexOf(project.stage); // -1 for declined / cancelled
          return (
            <li key={stage} aria-current={stage === project.stage ? "step" : undefined} className={at >= 0 && i < at ? "complete" : stage === project.stage ? "current" : ""}>
              <button disabled={pending || project.archived} onClick={() => stage !== project.stage && moveTo(stage)}>
                {labels.stage(stage)}
              </button>
            </li>
          );
        })}
        <li className="stage-hint">
          <InfoHint notes={[t(`stageNote.${project.stage}`), tWorkflow("stageNote")]} />
        </li>
      </ol>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!project.archived && phaseOf(project.stage) === "negotiation" && (
        <div className="deal-sign-prompt">
          <span>{t("signPrompt")}</span>
          <button className="secondary" disabled={pending} onClick={() => moveTo("signed")}>
            {t("markSigned")}
          </button>
        </div>
      )}

      <div className="deal-summary-strip">
        <div className="deal-next">
          <small>{t("nextStep")}</small>
          <strong>{project.nextAction?.title || t("noNextStep")}</strong>
          {next && <span className={`due ${next.tone}`}>{next.text}</span>}
          {signed && (
            <button
              className="text-button"
              onClick={() =>
                edit({ kind: "calendar", item: { projectId: project.id, title: project.nextAction?.title || project.title } })
              }
            >
              <Plus size={14} aria-hidden="true" />
              {t("addTodo")}
            </button>
          )}
        </div>
        <button className="deal-money" onClick={() => setTab("money")}>
          {/* Before signing, the quote is what matters; after, how much of it has come in. */}
          <small>{signed ? tWorkflow("payments") : tWorkflow("quoted")}</small>
          {settlement.quoted === null ? (
            <strong>{t("quoteNotSet")}</strong>
          ) : signed ? (
            <>
              <strong>{tWorkflow("receivedOf", { received: money(settlement.received), quoted: money(settlement.quoted) })}</strong>
              <span className="meter" aria-hidden="true">
                <span style={{ width: `${Math.min(100, settlement.quoted ? (settlement.received / settlement.quoted) * 100 : 0)}%` }} />
              </span>
            </>
          ) : (
            <strong>{money(settlement.quoted)}</strong>
          )}
        </button>
        {/* The closing check only means something once there's signed work to close. */}
        {isSigned(project.stage) && full && (
          <button className={`deal-check-chip ${checks.length ? "has-checks" : ""}`} onClick={() => setTab("money")}>
            {checks.length ? t("checks", { count: checks.length }) : t("allClear")}
          </button>
        )}
      </div>

      <div className="deal-tabs" role="tablist" aria-label={t("tabs")}>
        {tabs.map((key) => (
          <button
            key={key}
            role="tab"
            id={`deal-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`deal-panel-${key}`}
            onClick={() => setTab(key)}
          >
            {t(`tab.${key}`)}
            {counts[key] > 0 && <span>{counts[key]}</span>}
          </button>
        ))}
      </div>
      <div className="deal-tab-panel" role="tabpanel" id={`deal-panel-${tab}`} aria-labelledby={`deal-tab-${tab}`}>
        {failed && (tab === "overview" || tab === "timeline") && <p className="notice error">{t("detailFailed")}</p>}
        {(tab === "overview" || tab === "money") && !full && !failed && <p className="muted">{t("loading")}</p>}
        {tab === "overview" && full && <ProjectOverview project={full} offerText={detail!.offerText} edit={edit} />}
        {tab === "timeline" && (loading ? <p className="muted">{t("loading")}</p> : <ProjectTimeline project={project} entries={detail?.timeline ?? []} />)}
        {tab === "money" && full && <ProjectWorkflowPanel project={full} edit={edit} />}
        {tab === "travel" && <TravelItinerary project={project} edit={edit} />}
        {tab === "contract" && <ContractVersions project={project} />}
      </div>
    </article>
  );
}

/** A ⋯ button and its menu of less frequent actions. Escape or a click elsewhere closes it. */
function MoreMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div className="more-menu" ref={root} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button className="secondary icon-button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="more-menu-list" role="menu" aria-label={label} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
