// A contract or quote template's content (decision 0020): what the library previews and copies, and what the
// Word file is generated from. Pure; the content files are in assets/document-templates/content/.
import { createHash } from "node:crypto";
import { z } from "zod";
import { locales } from "../i18n/config"; // relative: drizzle-kit loads this through lib/db/schema.ts
import { roles } from "../roles";

export const templateKinds = ["contract", "quote"] as const;
export type TemplateKind = (typeof templateKinds)[number];

/**
 * One piece of a document, top to bottom. Kept to what contracts and quotes need, so an editor can
 * later offer the same few: a paragraph, a heading, a numbered list, lines kept together, a table,
 * and a signature block.
 */
const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string().min(1), align: z.literal("right").optional() }),
  z.object({ type: z.literal("heading"), text: z.string().min(1), pageBreak: z.boolean().optional() }), // a page break before it
  z.object({ type: z.literal("numbered"), items: z.array(z.string().min(1)).min(1) }), // numbered 1. 2. 3., restarting under each heading
  z.object({ type: z.literal("lines"), lines: z.array(z.string()).min(1), indent: z.boolean().optional() }), // one paragraph, a line each
  z.object({ type: z.literal("table"), columns: z.array(z.string().min(1)).min(1), rows: z.array(z.array(z.string())) }),
  z.object({ type: z.literal("signature"), party: z.string().min(1), fields: z.array(z.string()), signature: z.string(), date: z.string() }),
]);
export type TemplateBlock = z.infer<typeof block>;

export const templateContent = z.object({
  scenario: z.string().regex(/^[a-z][a-z-]*$/),
  role: z.enum(roles), // who it's written for, to filter the library by
  kind: z.enum(templateKinds),
  locale: z.enum(locales),
  title: z.string().min(1),
  blocks: z.array(block).min(1),
});
export type TemplateContent = z.infer<typeof templateContent>;

/**
 * The document as plain text, for the library's preview and Copy. Numbered items are numbered, a
 * table's rows are separated by tabs, so it pastes into an email or a spreadsheet as it reads.
 */
export function templateText(content: Pick<TemplateContent, "title" | "blocks">): string {
  const parts = content.blocks.map((b) => {
    switch (b.type) {
      case "paragraph":
      case "heading":
        return b.text;
      case "numbered":
        return b.items.map((item, i) => `${i + 1}. ${item}`).join("\n");
      case "lines":
        return b.lines.join("\n");
      case "table":
        return [b.columns, ...b.rows].map((row) => row.join("\t")).join("\n");
      case "signature":
        return [b.party, ...b.fields, `${b.signature} ______________________________`, b.date].join("\n");
    }
  });
  return [content.title, ...parts].join("\n\n");
}

/**
 * Bumped whenever the Word file's layout changes (lib/templates/docx.ts), so every template is
 * generated and published again on the next deploy.
 */
export const GENERATOR_VERSION = 1;

/** What a published version is checked against: its content, the note on top of its file, and the layout. */
export function contentHash(content: TemplateContent, notice: string) {
  return createHash("sha256").update(JSON.stringify([GENERATOR_VERSION, notice, content])).digest("hex");
}
