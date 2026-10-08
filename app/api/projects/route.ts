import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { listProjects } from "@/lib/data/projects";
import { listSorts, listViews, PAGE_MAX, PAGE_SIZE } from "@/lib/domain/project-list";

const params = z.object({
  view: z.enum(listViews).catch("execution"),
  type: z.string().max(40).catch("all"),
  contact: z.union([z.uuid(), z.literal("")]).catch(""),
  q: z.string().max(200).catch(""),
  sort: z.enum(listSorts).catch("due"),
  cursor: z.string().max(1000).catch(""),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).catch(PAGE_SIZE),
});

/**
 * One page of the signed-in talent's projects (decision 0011): a view (a
 * phase, every active project, or archived), an optional type, contact, and search, an order, and a cursor
 * from the previous page. Unknown values fall back to the defaults.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current) return new Response("Not found", { status: 404 });

  const search = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = params.parse({ type: "all", contact: "", q: "", cursor: "", ...search });
  const page = await listProjects(current.id, current.name, parsed);
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
}
