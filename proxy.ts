import { type NextRequest, NextResponse } from "next/server";
import { hasSessionCookie } from "@/lib/auth/cookie";

// Optimistic redirects only. Pages still verify the session against the
// database through lib/auth (requirePerson / requireTalent).
const authPages = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = hasSessionCookie(request);
  const onAuthPage = authPages.includes(pathname);

  if (!signedIn && !onAuthPage) {
    const to = new URL("/sign-in", request.url);
    // Linking the Gmail add-on comes back after signing in (docs/design/gmail-addon.md).
    if (pathname.startsWith("/addon/")) to.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(to);
  }
  if (signedIn && onAuthPage && pathname !== "/reset-password") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
