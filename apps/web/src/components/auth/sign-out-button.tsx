"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@chakra-ui/react";
import { signOut as authSignOut } from "@/lib/auth-client";

/**
 * Signs out and returns to the landing page, or to `destination` when the
 * caller wants somewhere else: the error page sends the user to /login, as
 * signing in again is what it is offering. Shared by SignOutButton, the
 * header's account menu and the error page so all of them leave the app the
 * same way.
 */
export function useSignOut(destination = "/") {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = async () => {
    setIsSigningOut(true);
    await authSignOut();
    // refresh() re-runs (app)/layout.tsx, which now sees no session and
    // redirects to /login.
    router.push(destination);
    router.refresh();
  };

  return { signOut, isSigningOut };
}

export function SignOutButton(props: ButtonProps) {
  const { signOut, isSigningOut } = useSignOut();

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={isSigningOut}
      onClick={signOut}
      {...props}
    >
      Sign out
    </Button>
  );
}
