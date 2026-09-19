import NextLink from "next/link";
import { Button, Center, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { ColorModeButton } from "@/components/ui/color-mode";

// Public landing at "/". Anyone can see this, signed in or not — the (app)
// group is what requires a session.
export default function LandingPage() {
  return (
    <Center minH="100vh" px="4" py="12">
      <Stack gap="8" maxW="lg" textAlign="center" align="center">
        <Stack gap="3">
          <Heading size="4xl">Storyteller</Heading>
          <Text textStyle="lg" color="fg.muted">
            Real-time collaborative storytelling. Gather a table, share a world,
            and write the next chapter together.
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
    </Center>
  );
}
