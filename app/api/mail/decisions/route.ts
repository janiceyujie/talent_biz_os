import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentTalent, getSession } from "@/lib/auth";
import { listMailDecisions } from "@/lib/data/mail";

const params = z.object({
  view: z.enum(["waiting", "skipped"]).catch("waiting"),
  offset: z.coerce.number().int().min(0).max(10_000).catch(0),
});

/** One page of Intake's Waiting or Filtered out, for the signed-in talent's mailbox. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const current = await getCurrentTalent(session.personId);
  if (!current) return new Response("Not found", { status: 404 });
  const { view, offset } = params.parse(Object.fromEntries(req.nextUrl.searchParams));
  return Response.json(await listMailDecisions(current.id, view, offset), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
