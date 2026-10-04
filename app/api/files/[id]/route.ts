import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { file } from "@/lib/db/schema";
import { readStream } from "@/lib/storage";

/**
 * One stored file, for the signed-in talent only — streamed through the app
 * rather than handed out as a storage URL. Served as its stored type and never
 * sniffed (uploads are checked to be real images or PDFs), so a file can't run as a page.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  const { id } = await ctx.params;
  if (!current || !z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });

  const [row] = await db
    .select({ storageKey: file.storageKey, contentType: file.contentType, filename: file.filename })
    .from(file)
    .where(and(eq(file.id, id), eq(file.talentId, current.id)));
  if (!row) return new Response("Not found", { status: 404 });

  const stored = await readStream(row.storageKey);
  const filename = encodeURIComponent(row.filename ?? "file");
  return new Response(stored.body, {
    headers: {
      "Content-Type": row.contentType,
      ...(stored.size ? { "Content-Length": String(stored.size) } : {}),
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      // PDFs open in the browser's own sandboxed viewer, which a CSP sandbox would block.
      ...(row.contentType === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'" }),
    },
  });
}
