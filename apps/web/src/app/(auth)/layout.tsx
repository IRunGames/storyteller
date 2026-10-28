import { redirect } from "next/navigation";
import { Box, Center } from "@chakra-ui/react";
import { getSession } from "@/lib/require-session";

// Mirror of (app)/layout.tsx: a verified session here means the visitor has no
// business on /login or /signup, so bounce them into the app. proxy.ts does the
// same check optimistically; this one is authoritative.
//
// A guest's session is the exception. Someone who came in by a join link is
// signed in anonymously, and logging in or signing up from here is how they
// turn that into an account (the anonymous plugin in lib/auth.ts). Bouncing
// them would also loop, since (nav)/layout.tsx sends a guest here.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (session && !session.user.isAnonymous) {
    redirect("/home");
  }

  return (
    <Center minH="100vh" px="4" py="12">
      <Box w="full" maxW="sm">
        {children}
      </Box>
    </Center>
  );
}
