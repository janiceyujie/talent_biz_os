import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { listFiles } from "@/lib/data/files";
import { PAGE_MAX, PAGE_SIZE } from "@/lib/domain/list-page";

const params = z.object({
  project: z.union([z.uuid(), z.literal("")]).catch(""),
  q: z.string().max(200).catch(""),
  archived: z.enum(["true", "false"]).transform((v) => v === "true").catch(false),
  cursor: z.string().max(1000).catch(""),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).catch(PAGE_SIZE),
});

/**
 * One page of the signed-in talent's files (decision 0011), newest first: one
 * project's or all, archived ones with `archived=true`, and a search of the
 * name. Unknown values fall back to the defaults.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current) return new Response("Not found", { status: 404 });

  const parsed = params.parse({ project: "", q: "", cursor: "", ...Object.fromEntries(req.nextUrl.searchParams) });
  const page = await listFiles(current.id, parsed);
  return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
}
