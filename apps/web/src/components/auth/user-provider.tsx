"use client";

import { createContext, useContext } from "react";
import type { CurrentUser } from "@/lib/current-user";

const UserContext = createContext<CurrentUser | null>(null);

/**
 * Holds the signed-in user for every client component under (app)/layout.tsx,
 * which loads it once per request with requireUser() and mounts this. Client
 * components call useUser() instead of taking the user as a prop or fetching
 * the session again from the browser.
 *
 * Server components cannot read React context; they keep calling
 * requireUser() (or requireSession()) themselves.
 */
export function UserProvider({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/**
 * The signed-in user, or null where nothing above mounted UserProvider. For
 * the few components that can render either side of sign-in, such as
 * (app)/error.tsx; everything else wants useUser(), which says loudly when
 * the provider is missing.
 */
export function useOptionalUser(): CurrentUser | null {
  return useContext(UserContext);
}

export function useUser(): CurrentUser {
  const user = useContext(UserContext);
  if (!user) {
    throw new Error(
      "useUser() can only be called inside a logged-in page: nothing above this component mounted UserProvider.",
    );
  }
  return user;
}
