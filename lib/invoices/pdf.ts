import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import { invoiceFontkit } from "./fontkit";
import en from "@/messages/en.json";
import zh from "@/messages/zh-TW.json";
import { billingDocumentKind } from "./document";
import type { InvoiceDetail } from "./types";

let fontBytes: Promise<Buffer> | undefined;
/** A deterministic document snapshot; no network, browser, AI, or operating-system font dependency. */
export async function renderInvoicePdf(row: InvoiceDetail, draft = true) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(invoiceFontkit);
  fontBytes ??= readFile(
    path.join(process.cwd(), "assets/fonts/NotoSansTC-Regular.ttf"),
  );
  const font = await doc.embedFont(await fontBytes, { subset: true });
  const s = row.snapshot,
    catalogue = (s.documentLanguage === "zh-TW" ? zh : en).invoices,
    labels = catalogue.pdfLabels,
    documentTitle = catalogue.documentKinds[billingDocumentKind(s)];
  const supported = new Set(font.getCharacterSet());
  // Reject unsupported glyphs before delivery rather than silently printing empty boxes.
  for (const value of [
    s.sellerName,
    s.sellerAddress,
    s.sellerEmail,
    s.buyerName,
    s.buyerAddress,
    s.recipient,
    s.description,
    s.paymentInstructions,
    s.taxNote,
  ]) {
    for (const c of value) {
      if (!/[\n\r\t]/.test(c) && !supported.has(c.codePointAt(0)!)) {
        const error = new Error("unsupportedCharacters");
        error.name = "InvoicePdfUnsupportedText";
        throw error;
      }
    }
  }
  doc.setTitle(`${documentTitle} ${row.number}`);
  doc.setAuthor(s.sellerName);
  doc.setSubject(s.description.slice(0, 200));
  doc.setCreator("Taloox");
  const ink = rgb(0.12, 0.21, 0.19),
    muted = rgb(0.38, 0.45, 0.43),
    line = rgb(0.82, 0.87, 0.84);
  const left = 48,
    right = 564,
    width = 516,
    bottom = 64;
  let page: PDFPage,
    y = 0;
  const text = (
    value: string,
    x: number,
    baseline: number,
    size = 10,
    color = ink,
  ) => page.drawText(value, { x, y: baseline, size, font, color });
  const rule = (baseline: number) =>
    page.drawLine({
      start: { x: left, y: baseline },
      end: { x: right, y: baseline },
      thickness: 0.7,
      color: line,
    });
  const newPage = () => {
    page = doc.addPage([612, 792]);
    y = 742;
    text(documentTitle, left, y, 22);
    text(row.number, 360, y, 12);
    if (draft) text(labels.draft, 360, y - 20, 10, muted);
    text(labels.notUniformInvoice, left, y - 24, 9, muted);
    y -= 50;
    rule(y);
    y -= 22;
  };
  const ensure = (height: number) => {
    if (y - height < bottom) newPage();
  };
  const wrap = (value: string, available = width, size = 10) => {
    const lines: string[] = [];
    for (const paragraph of value
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "    ")
      .split("\n")) {
      let current = "";
      for (const c of paragraph) {
        if (current && font.widthOfTextAtSize(current + c, size) > available) {
          const split = current.lastIndexOf(" ");
          if (split > current.length / 3) {
            lines.push(current.slice(0, split));
            current = current.slice(split + 1) + c;
          } else {
            lines.push(current);
            current = c;
          }
        } else current += c;
      }
      lines.push(current);
    }
    return lines;
  };
  const paragraph = (value: string, size = 10) => {
    for (const part of wrap(value, width, size)) {
      ensure(16);
      text(part, left, y, size);
      y -= 16;
    }
  };
  const block = (label: string, value: string) => {
    ensure(48);
    y -= 10;
    text(label, left, y, 10, muted);
    y -= 20;
    paragraph(value);
    y -= 8;
  };
  const money = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: s.currency,
      currencyDisplay: "code",
    }).format(n);
  newPage();
  // Stack unusually long billing blocks so both columns remain within the printable page.
  const seller = wrap(
      `${s.sellerName}\n${s.sellerAddress}\n${s.sellerEmail}`,
      244,
    ),
    buyer = wrap(`${s.buyerName}\n${s.buyerAddress}\n${s.recipient}`, 244);
  if (Math.max(seller.length, buyer.length) > 15) {
    block(labels.from, `${s.sellerName}\n${s.sellerAddress}\n${s.sellerEmail}`);
    block(labels.to, `${s.buyerName}\n${s.buyerAddress}\n${s.recipient}`);
  } else {
    text(labels.from, left, y, 9, muted);
    text(labels.to, 320, y, 9, muted);
    y -= 20;
    const start = y;
    seller.forEach((v, i) => text(v, left, start - i * 15));
    buyer.forEach((v, i) => text(v, 320, start - i * 15));
    y -= Math.max(seller.length, buyer.length) * 15 + 16;
  }
  ensure(64);
  rule(y);
  y -= 23;
  text(`${labels.issued}: ${row.issueOn}`, left, y);
  text(`${labels.due}: ${row.dueOn}`, 320, y);
  y -= 26;
  rule(y);
  y -= 12;
  block(labels.service, s.description);
  ensure(114);
  rule(y);
  y -= 24;
  for (const [label, value] of [
    [labels.subtotal, s.subtotal],
    [s.taxReview ? `${labels.tax} (${s.taxReview.rate}%)` : labels.tax, s.tax],
    [labels.total, s.total],
  ] as const) {
    const size = label === labels.total ? 14 : 10;
    text(label, 320, y, size);
    const amount = money(value);
    text(amount, right - font.widthOfTextAtSize(amount, size), y, size);
    y -= 24;
  }
  y -= 10;
  block(labels.instructions, s.paymentInstructions);
  block(labels.taxNote, s.taxNote);
  for (const [i, p] of doc.getPages().entries()) {
    p.drawLine({
      start: { x: left, y: 44 },
      end: { x: right, y: 44 },
      thickness: 0.7,
      color: line,
    });
    p.drawText(`${labels.reference}: ${row.number}  |  ${s.currency}`, {
      x: left,
      y: 28,
      size: 8,
      font,
      color: muted,
    });
    p.drawText(`${i + 1} / ${doc.getPageCount()}`, {
      x: 530,
      y: 28,
      size: 8,
      font,
      color: muted,
    });
  }
  return doc.save();
}
