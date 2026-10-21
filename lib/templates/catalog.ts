// The template library's shapes, shared by its endpoints and the library on screen (decision 0020).
import type { Locale } from "@/lib/i18n/config";
import type { Role } from "@/lib/roles";
import type { TemplateContent, TemplateKind } from "./content";

export const WORD_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** A published template as the library lists it: never its Storage key. */
export type CatalogTemplate = {
  id: string;
  scenario: string;
  role: Role;
  kind: TemplateKind;
  locale: Locale;
  version: number;
  title: string;
  text: string; // the whole document as plain text, for the preview and Copy
};

/** Where a version's Word file is stored: the hash makes every version's key its own. */
export const templateStorageKey = (c: Pick<TemplateContent, "scenario" | "kind" | "locale">, hash: string) =>
  `document-templates/${c.scenario}-${c.kind}-${c.locale}-${hash.slice(0, 16)}.docx`;

/** The name a download is saved under. */
export const templateFilename = (c: Pick<TemplateContent, "scenario" | "kind" | "locale">) => `taloox-${c.scenario}-${c.kind}-${c.locale}.docx`;
