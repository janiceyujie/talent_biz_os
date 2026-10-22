// A template's Word file, generated from its content (decision 0020). Pure; publishing uploads what it
// returns (scripts/publish-templates.mts), and the online editor will use it the same way. Layout
// changes bump GENERATOR_VERSION (./content.ts) so every published file is generated again.
import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip as mm,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { TemplateContent } from "./content";

// Traditional Chinese contracts are set in DFKai-SB (the standard Kai typeface in Taiwan's Word), Latin text in Times New Roman.
const font = { ascii: "Times New Roman", hAnsi: "Times New Roman", cs: "Times New Roman", eastAsia: "DFKai-SB" };
// Each numbered list is its own Word list, so it restarts at 1 under its heading.
const listRef = (n: number) => `numbered-${n}`;

/** Line breaks inside one paragraph: lines that belong together, like an address or a bank account. */
const lineRuns = (lines: string[], bold = false) => lines.map((text, i) => new TextRun({ text, bold, break: i ? 1 : 0 }));

/**
 * The document, A4. A contract reads like one: wider margins, looser lines, a centered bold title.
 * A quote is denser. `notice` goes first, shaded, for the person to delete when they're done.
 */
export async function generateDocx(content: TemplateContent, notice: string): Promise<Buffer> {
  const contract = content.kind === "contract";
  const margin = contract ? { top: mm(25), bottom: mm(25), left: mm(28), right: mm(28) } : { top: mm(18), bottom: mm(18), left: mm(20), right: mm(20) };
  const textWidth = mm(210) - margin.left - margin.right; // a table spans it
  let lists = 0;
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: notice, italics: true, size: 18 })],
      shading: { type: ShadingType.CLEAR, fill: "F2F2F2", color: "auto" },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: "999999", space: 6 } },
      spacing: { after: 240 },
    }),
    new Paragraph({ text: content.title, heading: HeadingLevel.TITLE, alignment: contract ? AlignmentType.CENTER : AlignmentType.LEFT }),
  ];

  for (const b of content.blocks) {
    switch (b.type) {
      case "paragraph":
        children.push(new Paragraph({ text: b.text, alignment: b.align === "right" ? AlignmentType.RIGHT : undefined }));
        break;
      case "heading":
        children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_1, pageBreakBefore: b.pageBreak, keepNext: true }));
        break;
      case "numbered": {
        const reference = listRef(++lists);
        for (const text of b.items) children.push(new Paragraph({ text, numbering: { reference, level: 0 }, keepLines: true }));
        break;
      }
      case "lines":
        children.push(new Paragraph({ children: lineRuns(b.lines), indent: b.indent ? { left: mm(10) } : undefined }));
        break;
      case "table": {
        // The first column (the item) is widest; the rest share what's left.
        const first = Math.round(textWidth * 0.46);
        const widths = b.columns.map((_, i) => (i === 0 ? first : Math.floor((textWidth - first) / (b.columns.length - 1))));
        const row = (cells: string[], header = false) =>
          new TableRow({
            tableHeader: header,
            cantSplit: true,
            children: cells.map(
              (text, i) =>
                new TableCell({
                  width: { size: widths[i], type: WidthType.DXA },
                  shading: header ? { type: ShadingType.CLEAR, fill: "E8F1ED", color: "auto" } : undefined,
                  children: [new Paragraph({ children: [new TextRun({ text, bold: header })] })],
                }),
            ),
          });
        children.push(
          new Table({ width: { size: textWidth, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, rows: [row(b.columns, true), ...b.rows.map((r) => row(r))] }),
        );
        break;
      }
      case "signature":
        children.push(
          new Paragraph({ children: [new TextRun({ text: b.party, bold: true })], spacing: { before: 320 } }),
          new Paragraph({ children: lineRuns(b.fields) }),
          new Paragraph({ text: `${b.signature}  ______________________________`, spacing: { before: 280 } }),
          new Paragraph({ text: b.date }),
        );
        break;
    }
  }

  const document = new Document({
    creator: "Taloox",
    title: content.title,
    styles: {
      default: {
        document: { run: { font, size: contract ? 22 : 21, color: "000000" }, paragraph: { spacing: { line: contract ? 300 : 269, after: contract ? 120 : 60 } } },
        title: { run: { font, size: contract ? 28 : 36, bold: contract, color: "000000" }, paragraph: { spacing: { after: contract ? 440 : 160 } } },
        heading1: { run: { font, size: contract ? 22 : 24, bold: true, color: "000000" }, paragraph: { spacing: { before: contract ? 240 : 140, after: contract ? 120 : 60 } } },
      },
    },
    numbering: {
      config: Array.from({ length: lists }, (_, i) => ({
        reference: listRef(i + 1),
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: mm(10), hanging: mm(6) } } } }],
      })),
    },
    sections: [
      {
        properties: {
          page: { size: { width: mm(210), height: mm(297) }, margin },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}
