import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { listDocumentTemplates } from "@/lib/data/document-templates";
import { locales } from "@/lib/i18n/config";
import { templateKinds } from "@/lib/templates/content";

const params = z.object({ locale: z.enum(locales), kind: z.enum(templateKinds) });

/** The published contract or quote templates in one language (decision 0020), for a signed-in person with a workspace. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!(await getCurrentTalent(session.personId))) return new Response("Not found", { status: 404 });
  const parsed = params.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return new Response("Invalid query", { status: 400 });
  const templates = await listDocumentTemplates(parsed.data.locale, parsed.data.kind);
  return Response.json(templates, { headers: { "Cache-Control": "private, no-store" } });
}
