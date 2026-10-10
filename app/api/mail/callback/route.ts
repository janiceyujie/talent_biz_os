import { type NextRequest, NextResponse } from "next/server";
import { requireTalent } from "@/lib/auth";
import { finishConnect } from "@/lib/mail/connect";
import { STATE_COOKIE } from "@/lib/mail/oauth-state";

// Google sends the person back here after the consent screen. The result shows on the Gmail row in Settings.
export async function GET(req: NextRequest) {
  const { person, talent } = await requireTalent();
  const result = await finishConnect({
    cookie: req.cookies.get(STATE_COOKIE)?.value,
    params: req.nextUrl.searchParams,
    personId: person.personId,
    talentId: talent.id,
  });
  const res = NextResponse.redirect(new URL(`/settings?gmail=${result}`, req.url));
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/mail" });
  return res;
}
