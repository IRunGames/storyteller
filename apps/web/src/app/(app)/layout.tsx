import { requireSession } from "@/lib/require-session";

// Backstop gate for the whole group. Note this does NOT stop child pages from
// rendering — Next renders layouts and pages concurrently — so any protected
// page that fetches user data must call requireSession() itself as well.
// proxy.ts only inspects the cookie; this validates against the database.
//
// Reading headers() (via requireSession) opts the group into dynamic
// rendering, which is what we want: a protected page must never be
// prerendered and cached.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();

  return <>{children}</>;
}
