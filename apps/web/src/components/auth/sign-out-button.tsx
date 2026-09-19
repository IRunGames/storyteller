"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@chakra-ui/react";
import { signOut as authSignOut } from "@/lib/auth-client";

/**
 * Signs out and returns to the landing page. Shared by SignOutButton and the
 * header's account menu so both leave the app the same way.
 */
export function useSignOut() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = async () => {
    setIsSigningOut(true);
    await authSignOut();
    // refresh() re-runs (app)/layout.tsx, which now sees no session and
    // redirects to /login.
    router.push("/");
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
