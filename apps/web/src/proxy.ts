import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Next 16 renamed Middleware to Proxy; `proxy.ts` is the current convention.
//
// This layer is an OPTIMISTIC filter, not a security boundary. getSessionCookie
// only checks that a session cookie is present and well-formed — it never
// reaches the database, because this runtime cannot: src/db/index.ts opens a pg
// Pool. A stale or forged cookie passes this check happily.
//
// The real guarantees live in the group layouts, which call
// auth.api.getSession() server-side. Everything here does is save a round trip
// to a page that would immediately redirect anyway.
//
// Only the signed-OUT direction is handled here. Bouncing a cookie-holder away
// from /login would loop whenever the cookie is stale (session row deleted or
// expired while the browser still has the token): (app)/layout sends them to
// /login, this layer would send them straight back. Better Auth tries to clear
// the stale cookie from getSession(), but a Server Component cannot set
// cookies, so it survives. (auth)/layout does the authoritative bounce instead.

/** Requires a session. Keep in sync with app/(app)/. */
const PROTECTED_ROUTES = ["/home", "/play"];

const SIGNED_OUT_HOME = "/login";

function matches(pathname: string, routes: string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(getSessionCookie(request));

  if (!hasSessionCookie && matches(pathname, PROTECTED_ROUTES)) {
    const target = new URL(SIGNED_OUT_HOME, request.url);
    // Preserve where they were headed so login can return them there.
    target.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(target);
  }

  return NextResponse.next();
}

export const config = {
  // Skip /api/auth (the handler manages its own cookies), Next internals and
  // anything that looks like a static file.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
