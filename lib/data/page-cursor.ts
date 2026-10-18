import "server-only";
import { z } from "zod";
export class InvalidCursor extends Error {}
export const encodePageCursor = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
export function decodePageCursor<T>(cursor: string, schema: z.ZodType<T>): T | null {
  if (!cursor) return null;
  try { return schema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString())); }
  catch { throw new InvalidCursor("Invalid page cursor"); }
}
export const literalSearch = (q: string) => `%${q.replace(/[\\%_]/g, value => `\\${value}`)}%`;
