import NextLink from "next/link";
import { Box, Button, Center, Heading, HStack, Stack, Text, Theme } from "@chakra-ui/react";
import { ColorModeButton } from "@/components/ui/color-mode";
import { pickWelcomeBackground } from "@/lib/welcome";

// The picture is picked per visit on the server, so the page must render on
// each request: left static, "/" would be built once and carry the one
// picture chosen at build time to every visitor.
export const dynamic = "force-dynamic";

// Public landing at "/". Anyone can see this, signed in or not — the (app)
// group is what requires a session.
export default function LandingPage() {
  const background = pickWelcomeBackground();

  return (
    <Center position="relative" minH="100vh" px="4" py="12" bg="bg.subtle">
      {/* Fixed to the window rather than to the page, so the picture is the
          window's background: a short window that has to scroll keeps it in
          place and never shows the page colour past its end. */}
      <Box
        aria-hidden
        position="fixed"
        inset="0"
        bgSize="cover"
        bgPos="center"
        style={{ backgroundImage: `url("${background}")` }}
      />
      {/* A dark, see-through panel over the picture, the same in every theme
          since the pictures are dark throughout. Theme forces the dark
          palette inside it, so the buttons and the muted text take their
          dark-mode colours even when the visitor's theme is light. */}
      <Theme
        appearance="dark"
        hasBackground={false}
        position="relative"
        maxW="lg"
        w="full"
        p={{ base: "6", md: "10" }}
        rounded="xl"
        bg="blackAlpha.700"
        backdropFilter="blur(6px)"
      >
        <Stack gap="8" textAlign="center" align="center">
          <Stack gap="3">
            <Heading size="4xl">Storyteller</Heading>
            <Text textStyle="lg" color="fg.muted">
              Real-time collaborative storytelling. Gather a table, share a world, and write the
              next chapter together.
            </Text>
          </Stack>

          <HStack gap="3">
            <Button asChild size="lg">
              <NextLink href="/signup">Get started</NextLink>
            </Button>
            <Button asChild size="lg" variant="outline">
              <NextLink href="/login">Log in</NextLink>
            </Button>
          </HStack>

          <ColorModeButton />
        </Stack>
      </Theme>
    </Center>
  );
}
