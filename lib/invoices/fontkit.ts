import "server-only";
import { Readable } from "node:stream";
import { create } from "fontkit";
import type { PDFDocument } from "pdf-lib";

/** pdf-lib expects the stream API of Fontkit 1; Fontkit 2 fixes CJK subset encoding. */
export const invoiceFontkit = {
  create(bytes: Uint8Array) {
    const font = create(Buffer.from(bytes));
    if (!("createSubset" in font))
      throw new Error("Invoice font must be a single font");
    const createSubset = font.createSubset.bind(font);
    font.createSubset = () => {
      const subset = createSubset();
      return Object.assign(subset, {
        encodeStream: () => Readable.from([subset.encode()]),
      });
    };
    return font;
  },
} as unknown as Parameters<PDFDocument["registerFontkit"]>[0];
