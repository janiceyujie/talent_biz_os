import { type NextRequest, NextResponse } from "next/server";
import { hasSessionCookie } from "@/lib/auth/cookie";

// Optimistic redirects only. Pages still verify the session against the
// database through lib/auth (requirePerson / requireTalent). A cookie alone
// never sends anyone away from the auth pages: it can be expired, or signed
// with an old secret, and the app would send them straight back (a loop that
// only clearing cookies ended). Sign-in and sign-up check the real session.
const authPages = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = hasSessionCookie(request);
  const onAuthPage = authPages.includes(pathname);

  if (!signedIn && !onAuthPage) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
