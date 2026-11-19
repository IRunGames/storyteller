import { redirect } from "next/navigation";
import { Box, Flex, Stack } from "@chakra-ui/react";
import { ColorModeButton } from "@/components/ui/color-mode";
import { getSession } from "@/lib/require-session";
import { pickWelcomeBackground } from "@/lib/welcome";

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

  // The landing page's picture, panel and colour-mode button, so /login and
  // /signup look like the page that sent the visitor here. Reading the
  // session already renders this layout on each request, so the pick is made
  // per visit without the landing page's force-dynamic. Being the layout's,
  // it also stays put when the visitor follows the link between the two forms.
  return (
    <Flex
      position="relative"
      minH="100vh"
      p={{ base: "4", md: "10" }}
      justify="start"
      align="end"
      bg="bg.subtle"
    >
      <Box
        aria-hidden
        position="fixed"
        inset="0"
        bgSize="cover"
        bgPos="center"
        style={{ backgroundImage: `url("${pickWelcomeBackground()}")` }}
      />
      {/* A step more solid than the landing page's panel: a form's labels,
          inputs and hints are smaller than its heading and blurb, and a busy
          picture showing through made them hard to read. */}
      <Box
        position="relative"
        maxW="lg"
        w="full"
        p={{ base: "6", md: "10" }}
        rounded="xl"
        bg={{ base: "white/85", _dark: "blackAlpha.800" }}
        backdropFilter="blur(6px)"
      >
        <Stack gap="6">
          {children}
          <ColorModeButton alignSelf="start" />
        </Stack>
      </Box>
    </Flex>
  );
}
