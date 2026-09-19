import { redirect } from "next/navigation";
import { Box, Center } from "@chakra-ui/react";
import { getSession } from "@/lib/require-session";

// Mirror of (app)/layout.tsx: a verified session here means the visitor has no
// business on /login or /signup, so bounce them into the app. proxy.ts does the
// same check optimistically; this one is authoritative.
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (session) {
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
