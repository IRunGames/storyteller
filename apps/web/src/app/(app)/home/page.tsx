import NextLink from "next/link";
import { Button, Center, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";
import { ColorModeButton } from "@/components/ui/color-mode";
import { SignOutButton } from "@/components/auth/sign-out-button";

// Placeholder home for signed-in users — where /login and /signup send people.
// requireSession() here rather than trusting the group layout: the layout's
// redirect does not prevent this page from rendering. It is memoised, so this
// costs no extra round trip.
export default async function HomePage() {
  const session = await requireSession();

  return (
    <Center minH="100vh" px="4" py="12">
      <Stack gap="8" maxW="lg" textAlign="center" align="center">
        <Stack gap="2">
          <Heading size="3xl">Welcome, {session.user.name}</Heading>
          <Text color="fg.muted">Your story starts here soon.</Text>
        </Stack>

        <HStack gap="3">
          <Button asChild>
            <NextLink href="/play">Open the chat</NextLink>
          </Button>
          <ColorModeButton />
          <SignOutButton />
        </HStack>
      </Stack>
    </Center>
  );
}
