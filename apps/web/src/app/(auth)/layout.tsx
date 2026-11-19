import { redirect } from "next/navigation";
import NextLink from "next/link";
import { Box, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { LogoMark } from "@/components/nav/brand-mark";
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
// The swatch's outline: straight along the screen's edge, torn down the
// right, and uneven along the top and bottom, as a strip of black paper torn
// from a sheet would be.
const RAGGED_EDGE = `polygon(
  0 3%, 9% 0, 17% 7%, 28% 2%, 39% 9%, 50% 1%, 61% 7%, 72% 0, 81% 8%, 90% 2%, 94% 0,
  97% 12%, 93% 24%, 99% 37%, 95% 49%, 100% 61%, 94% 73%, 98% 86%, 95% 100%,
  86% 93%, 77% 100%, 66% 92%, 55% 99%, 44% 91%, 33% 98%, 22% 92%, 11% 100%, 0 95%
)`;

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (session && !session.user.isAnonymous) {
    redirect("/home");
  }

  // The landing page's picture, panel and colour-mode button, so /login and
  // /signup look like the page that sent the visitor here, with the logo and
  // the app's name in the upper left, back to the landing page; the page is
  // a column, the name at its head and the form at its foot, so the two
  // never overlap however tall the form grows. Reading the
  // session already renders this layout on each request, so the pick is made
  // per visit without the landing page's force-dynamic. Being the layout's,
  // it also stays put when the visitor follows the link between the two forms.
  return (
    <Flex
      position="relative"
      direction="column"
      gap="6"
      minH="100vh"
      p={{ base: "4", md: "10" }}
      justify="space-between"
      align="start"
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
      {/* On a ragged black swatch, 60% opaque, that comes in from the
          screen's left edge, past the page's padding, the name in white so it
          reads over any picture. The torn right edge is a clip, so a focus ring would be cut
          off with it: focus underlines the name instead. */}
      <HStack
        asChild
        position="relative"
        gap="3"
        ms={{ base: "-4", md: "-10" }}
        ps={{ base: "4", md: "10" }}
        pe="12"
        py="3"
        bg="black/60"
        color="white"
        textDecoration="none"
        style={{ clipPath: RAGGED_EDGE }}
        _focusVisible={{
          outline: "none",
          "& > span": { textDecoration: "underline", textUnderlineOffset: "4px" },
        }}
      >
        <NextLink href="/">
          <LogoMark size="9" />
          <Text as="span" fontSize="2xl" fontWeight="bold" letterSpacing="-0.01em">
            Storyteller
          </Text>
        </NextLink>
      </HStack>
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
