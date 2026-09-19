"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@chakra-ui/react";
import { signOut } from "@/lib/auth-client";

export function SignOutButton(props: ButtonProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={isSigningOut}
      onClick={async () => {
        setIsSigningOut(true);
        await signOut();
        // refresh() re-runs (app)/layout.tsx, which now sees no session and
        // redirects to /login.
        router.push("/");
        router.refresh();
      }}
      {...props}
    >
      Sign out
    </Button>
  );
}
