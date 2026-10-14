import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { listDocumentTemplates } from "@/lib/data/document-templates";

const query = z.object({ locale: z.enum(["en", "zh-TW"]), kind: z.enum(["contract", "quote"]) });
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!await getCurrentTalent(session.personId)) return new Response("Not found", { status: 404 });
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return new Response("Invalid query", { status: 400 });
  const { locale, kind } = parsed.data;
  return Response.json(await listDocumentTemplates(locale, kind), { headers: { "Cache-Control": "private, no-store" } });
}
