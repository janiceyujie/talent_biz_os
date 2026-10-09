import type { Locale } from "@/lib/i18n/config";
import type { DocumentKind } from "./documents";

/** Public-facing shape: storage keys and internal hashes never leave the server. */
export type CatalogDocument = {
  id: string;
  scenario: string;
  role: string;
  kind: DocumentKind;
  locale: Locale;
  version: number;
  title: string;
  text: string;
};
export const WORD_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
