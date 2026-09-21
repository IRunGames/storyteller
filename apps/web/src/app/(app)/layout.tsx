import { UserProvider } from "@/components/auth/user-provider";
import { requireUser } from "@/lib/authorize";
import { toCurrentUser } from "@/lib/current-user";
import { requireSession } from "@/lib/require-session";

// Backstop gate for the whole group. Note this does NOT stop child pages from
// rendering — Next renders layouts and pages concurrently — so any protected
// page that fetches user data must call requireSession() itself as well.
// proxy.ts only inspects the cookie; this validates against the database.
//
// Reading headers() (via requireSession) opts the group into dynamic
// rendering, which is what we want: a protected page must never be
// prerendered and cached.
//
// requireSession() first so a missing session redirects to /login;
// requireUser() then loads the users row, and throws to (app)/error.tsx if the
// row is gone or deactivated. Both are memoised per request, so pages and
// actions that call them again pay nothing.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  const user = await requireUser();

  return <UserProvider user={toCurrentUser(user)}>{children}</UserProvider>;
}
