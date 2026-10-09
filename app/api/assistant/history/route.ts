import { requireTalent } from "@/lib/auth";
import { readAssistantArchive } from "@/lib/ai/assistant-history";
export async function GET() {
  const { person, talent } = await requireTalent();
  try {
    const archive = await readAssistantArchive(person.personId, talent.id);
    return Response.json(archive, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
