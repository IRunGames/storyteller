import NextLink from "next/link";
import { Box, Button, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
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
    <Flex
      position="relative"
      minH="100vh"
      p={{ base: "4", md: "10" }}
      justify="start"
      align="end"
      bg="bg.subtle"
    >
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
      {/* A see-through panel in the window's bottom-left corner, over the
          picture, so the figures in the middle of each picture stay in
          view. The colour-mode button at its foot flips the theme, and
          since the picture hides the page colour the panel is where the
          flip shows: a dark panel in the dark themes,
          a frosted light one in light. Its text and buttons take the
          theme's colours as everywhere else; a forced dark palette here had
          left the button with nothing visible to do. */}
      <Box
        position="relative"
        maxW="lg"
        w="full"
        p={{ base: "6", md: "10" }}
        rounded="xl"
        bg={{ base: "whiteAlpha.800", _dark: "blackAlpha.700" }}
        backdropFilter="blur(6px)"
      >
        <Stack gap="8" align="start">
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
      </Box>
    </Flex>
  );
}
