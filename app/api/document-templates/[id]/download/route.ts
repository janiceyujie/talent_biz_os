import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { findTemplateFile } from "@/lib/data/document-templates";
import { readStream } from "@/lib/storage";
import { WORD_CONTENT_TYPE } from "@/lib/templates/catalog";

/** A published template's Word file, streamed from Storage for a signed-in person with a workspace. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/document-templates/[id]/download">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!(await getCurrentTalent(session.personId)) || !z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const file = await findTemplateFile(id);
  if (!file) return new Response("Not found", { status: 404 });
  try {
    const stored = await readStream(file.storageKey);
    return new Response(stored.body, {
      headers: {
        "Content-Type": WORD_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(stored.size ? { "Content-Length": String(stored.size) } : {}),
      },
    });
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
}
