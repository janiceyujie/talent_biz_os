"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { projectRecord, RecordEditor, type Editor } from "@/components/app/record-editor";
import { archiveProject, setProjectStage } from "@/lib/actions/projects";
import { useMoney } from "@/lib/i18n/format";
import { isSigned, mainStages, phaseOf, phases, type Phase } from "@/lib/domain/phases";
import { projectQuoteTotal, projectSettlement } from "@/lib/domain/workflow";
import { useLabels } from "@/lib/i18n/labels";
import { projectTypes } from "@/lib/project-types";
import { stages, type Stage } from "@/lib/types";
import { ProjectWorkflowPanel } from "./project-workflow-panel";
import { TravelItinerary } from "./travel-itinerary";
import { ContractVersions, ProjectFacts, ProjectTimeline } from "./project-timeline";

/** `selectedId` opens that project (and its phase); `initialPhase` opens a phase tab (from 今日總覽's 合作案進度). */
export function ProjectsView({ selectedId = "", initialPhase }: { selectedId?: string; initialPhase?: Phase }) {
  const data = useAppData();
  const money = useMoney();
  const router = useRouter();
  const t = useTranslations("projects");
  const labels = useLabels();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState(selectedId);
  const [phase, setPhase] = useState<Phase>(() => {
    const linked = data.projects.find((p) => p.id === selectedId);
    if (linked) return phaseOf(linked.stage);
    if (initialPhase) return initialPhase;
    // Signed work first; otherwise the first phase that has projects.
    const live = data.projects.filter((p) => !p.archived);
    const order: Phase[] = ["execution", "negotiation", "settlement", "ended"];
    return order.find((ph) => live.some((p) => phaseOf(p.stage) === ph)) ?? "execution";
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<string | null>) =>
    startTransition(async () => setError(await action()));
  const inView = data.projects.filter((p) => p.archived === archived);
  const visible = inView.filter(
    (p) =>
      phaseOf(p.stage) === phase &&
      (type === "all" || p.type === type) &&
      `${p.title} ${p.counterparty} ${p.artist}`.toLowerCase().includes(search.toLowerCase()),
  );
  const active = visible.find((p) => p.id === selected) || visible[0];
  const detailHeading = useRef<HTMLHeadingElement>(null);
  // New linked items need a live, signed project; the server enforces the same rule.
  const signed = !!active && !active.archived && isSigned(active.stage);
  const compose = (id: string) => router.push(`/drafts?project=${id}`);
  const quoteText = (p: (typeof data.projects)[number]) => {
    const total = projectQuoteTotal(p);
    return total === null ? t("quoteNotSet") : money(total);
  };

  return (
    <div className="deals-workspace">
      <section className="deal-controls">
        <div className="phase-tabs" role="group" aria-label={t("phases")}>
          {phases.map((p) => (
            <button
              key={p}
              aria-pressed={phase === p}
              className={phase === p ? "active" : ""}
              onClick={() => {
                setPhase(p);
                setSelected("");
              }}
            >
              <strong>{t(`phase.${p}`)}</strong>
              <span>{inView.filter((x) => phaseOf(x.stage) === p).length}</span>
            </button>
          ))}
        </div>
        <p className="phase-caption">{t(`phaseCaption.${phase}`)}</p>
        <div className="toolbar wrap">
          <input aria-label={t("search")} placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label={t("typeFilter")} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">{t("all")}</option>
            {projectTypes.map((pt) => (
              <option key={pt.key} value={pt.key}>
                {labels.projectType(pt.key)}
              </option>
            ))}
          </select>
          <label className="check-line">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            {t("archivedOnly")}
          </label>
          <button className="primary" onClick={() => setEditor({ kind: "project" })}>
            {t("newProject")}
          </button>
        </div>
      </section>
      <div className="deals-layout">
        {/* A case folder: the list picks a project, the dossier is where work on it happens. */}
        <section className="surface deal-list-panel" aria-label={t("listLabel")}>
          <ul className="deal-list">
            {visible.map((p) => (
              <li key={p.id}>
                <button
                  className={`deal-list-item ${active?.id === p.id ? "is-selected" : ""}`}
                  aria-pressed={active?.id === p.id}
                  onClick={() => {
                    setSelected(p.id);
                    // On narrow screens the dossier is below the list: take the reader there.
                    if (window.matchMedia("(max-width: 1000px)").matches) {
                      detailHeading.current?.focus({ preventScroll: true });
                      detailHeading.current?.scrollIntoView({ block: "start" });
                    }
                  }}
                >
                  <span className="deal-list-status">
                    <span>{labels.projectType(p.type)}</span>
                    <span className="deal-status">{labels.stage(p.stage)}</span>
                  </span>
                  <strong className="deal-list-title">{p.title}</strong>
                  <span className="deal-list-partner">
                    {p.counterparty} · {p.artist}
                  </span>
                  <span className="deal-list-facts">
                    <span>
                      <small>{t("colQuote")}</small>
                      <strong>{quoteText(p)}</strong>
                    </span>
                    <span>
                      <small>{t("colDue")}</small>
                      <span>{p.nextAction?.dueDate || t("notSet")}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!visible.length && <p className="empty">{t("empty")}</p>}
        </section>
        {active && (
          <aside className="surface deal-detail deal-dossier">
            <header className="deal-dossier-header">
              <div>
                <span className={`category c-${active.type}`}>{labels.projectType(active.type)}</span>
                <h2 ref={detailHeading} tabIndex={-1}>
                  {active.title}
                </h2>
                <p>
                  {active.counterparty} · {active.artist}
                </p>
              </div>
              <button className="primary" onClick={() => setEditor({ kind: "project", item: projectRecord(active) })}>
                {t("editFull")}
              </button>
            </header>
            <div className="detail-next">
              <small>{t("nextStep", { due: active.nextAction?.dueDate || t("noDue") })}</small>
              <strong>{active.nextAction?.title || t("noNextStep")}</strong>
            </div>
            <div className="deal-stage-section">
              <label>
                {t("stage")}
                <select
                  value={active.stage}
                  disabled={pending || active.archived}
                  onChange={(e) => {
                    const stage = e.target.value as Stage;
                    run(async () => {
                      const failure = await setProjectStage(active.id, stage);
                      // Follow the project to its new phase tab.
                      if (!failure) {
                        setPhase(phaseOf(stage));
                        setSelected(active.id);
                      }
                      return failure;
                    });
                  }}
                >
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {labels.stage(s)}
                    </option>
                  ))}
                </select>
              </label>
              <ol className="stage-progress" aria-label={t("stageProgress")}>
                {mainStages.map((stage, i) => {
                  const at = mainStages.indexOf(active.stage); // -1 for declined / cancelled
                  return (
                    <li
                      key={stage}
                      aria-current={stage === active.stage ? "step" : undefined}
                      className={at >= 0 && i < at ? "complete" : stage === active.stage ? "current" : ""}
                    >
                      {labels.stage(stage)}
                    </li>
                  );
                })}
              </ol>
              <p className="stage-note">{t(`stageNote.${active.stage}`)}</p>
            </div>
            <div className="stack-buttons deal-primary-actions">
              <button
                className="secondary"
                disabled={!signed}
                onClick={() =>
                  setEditor({
                    kind: "calendar",
                    item: { projectId: active.id, title: active.nextAction?.title || active.title },
                  })
                }
              >
                {t("addTodo")}
              </button>
              <button
                className="secondary"
                disabled={!signed}
                onClick={() =>
                  setEditor({
                    kind: "payment",
                    item: {
                      projectId: active.id,
                      label: t("paymentLabel", { title: active.title.slice(0, 190) }),
                      amount: active.quotedAmount === null ? "" : Math.max(0, projectSettlement(data, active).unbilled),
                      taxRate: active.taxRate,
                      taxIncluded: true,
                    },
                  })
                }
              >
                {t("addPayment")}
              </button>
              {!signed && phaseOf(active.stage) === "negotiation" && <p className="muted stage-action-note">{t("notSignedNote")}</p>}
              <button className="text-button" disabled={pending} onClick={() => run(() => archiveProject(active.id, !active.archived))}>
                {active.archived ? t("restore") : t("archive")}
              </button>
            </div>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            {/* What messages brought in, ahead of the money panel so it isn't buried. */}
            <ProjectFacts project={active} />
            <ContractVersions project={active} />
            <ProjectTimeline project={active} />
            <ProjectWorkflowPanel key={active.id} project={active} edit={setEditor} compose={compose} />
            <TravelItinerary project={active} edit={setEditor} />
            <div className="deal-summary">
              {(
                [
                  [t("detail.offer"), active.offerText],
                  [t("detail.contract"), active.details.contractNotes],
                  [t("detail.deliverables"), active.details.deliverables],
                  [t("detail.rights"), active.details.rights],
                  [t("detail.travel"), active.details.travel],
                ] as [string, string | undefined][]
              ).map(([label, value]) => (
                <details key={label}>
                  <summary>{value ? t("filled", { label }) : t("missing", { label })}</summary>
                  <p className="prewrap">{value || t("notFilled")}</p>
                </details>
              ))}
            </div>
          </aside>
        )}
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
