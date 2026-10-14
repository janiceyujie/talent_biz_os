import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { findDocumentTemplate } from "@/lib/data/document-templates";
import { readStream } from "@/lib/storage";
import { WORD_CONTENT_TYPE } from "@/lib/templates/catalog";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/document-templates/[id]/download">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!await getCurrentTalent(session.personId) || !z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const row = await findDocumentTemplate(id);
  if (!row) return new Response("Not found", { status: 404 });
  try {
    const stored = await readStream(row.storageKey);
    return new Response(stored.body, { headers: {
      "Content-Type": WORD_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(stored.size ? { "Content-Length": String(stored.size) } : {}),
    } });
  } catch {
    return new Response("Document temporarily unavailable", { status: 503 });
  }
}
