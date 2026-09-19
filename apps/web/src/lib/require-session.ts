import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Per-request memoised session lookup. React's cache() dedupes it, so a layout
 * and the page inside it share one database round trip instead of two.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * Returns the session or redirects to /login. Use this in every protected
 * Server Component that touches user data — NOT only in the group layout.
 *
 * A layout's redirect() does not stop its children rendering: Next renders
 * layout and page concurrently, so a page that fetches data unconditionally
 * will still stream that data into the response body even though the status
 * line is a 307. Calling requireSession() before fetching is what makes a
 * protected page safe on its own, with (app)/layout.tsx as the backstop.
 */
export async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}
