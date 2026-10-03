// The project type registry: one file per type. Adding a type is adding a
// file here, not a migration (docs/architecture.md, "Project types").
import type { FieldDefinition } from "@/lib/ai/extraction/fields";
import { brandDeal } from "./brand-deal";
import { gig } from "./gig";
import { licensing } from "./licensing";
import { other } from "./other";
import { sponsoredPost } from "./sponsored-post";

// Each type's label and "what to confirm" checklist are in the message
// catalogs (labels.projectType.<key>); behavior stays here.
export type ProjectTypeDefinition = {
  key: string;
  /** Full fields and AI extraction ship for this type in the MVP. */
  fullSupport: boolean;
  /** What the model is told about this type, and the fields it extracts for it (lib/ai/extraction). */
  extraction: { description: string; fields: readonly FieldDefinition[] };
};

export const projectTypes = [gig, brandDeal, sponsoredPost, licensing, other] as const;
export type ProjectType = (typeof projectTypes)[number]["key"];

export const projectTypeKeys = projectTypes.map((t) => t.key) as ProjectType[];

export function projectType(key: string): ProjectTypeDefinition {
  return projectTypes.find((t) => t.key === key) ?? other;
}

export const isProjectType = (value: unknown): value is ProjectType =>
  projectTypeKeys.includes(value as ProjectType);
