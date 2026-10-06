"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { pipeline } from "@/lib/overview/pipeline";
import type { OverviewContext } from "../context";
import { Widget } from "../widget";

/** 合作案進度: live deals per phase (zeros included), each opening that tab of 合作案. */
export function PipelineWidget({ ctx: { data } }: { ctx: OverviewContext }) {
  const t = useTranslations("today");
  const tProjects = useTranslations("projects");
  const phases = pipeline(data.projects);
  return (
    <Widget id="pipeline" title={t("pipelineTitle")}>
      <div className="pipeline-phases">
        {phases.map(({ phase, count }) => (
          <Link key={phase} href={`/projects?phase=${phase}`}>
            <strong>{count}</strong>
            <span>{tProjects(`phase.${phase}`)}</span>
          </Link>
        ))}
      </div>
    </Widget>
  );
}
