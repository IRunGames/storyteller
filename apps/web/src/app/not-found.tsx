import type { Metadata } from "next";
import NextLink from "next/link";
import { Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";

export const metadata: Metadata = {
  title: "Not found · Storyteller",
};

// Every notFound() in the app lands here, as does any URL that matches no
// route. It sits at the root, outside (app), so it renders without a session
// and without the menu bar; a signed-out visitor to an unknown URL is sent to
// /login by proxy.ts before they get this far.
//
// One message covers a missing page and one the visitor may not see. The
// owner-only pages answer a player with notFound() on purpose, so that nobody
// learns a story or scene exists by guessing ids, and the wording here keeps
// that promise rather than saying which of the two it was.
//
// The picture is the same in every theme and dark throughout, so the panel
// in front of it keeps its own colours, as the waiting room's does.
export default function NotFound() {
  return (
    <Flex position="relative" minH="100vh" direction="column" bg="bg.subtle">
      <Box
        aria-hidden
        position="absolute"
        inset="0"
        bgSize="cover"
        bgPos="center"
        style={{ backgroundImage: 'url("/images/not-found.webp")' }}
      />
      <Box aria-hidden position="absolute" inset="0" bg="blackAlpha.500" />
      {/* The figure stands in the middle of the picture, so the panel sits
          below it rather than over it. */}
      <Flex position="relative" flex="1" align="end" justify="center" px="4" py="10">
        <Stack
          gap="4"
          maxW="md"
          w="full"
          p={{ base: "5", md: "8" }}
          bg="bg.panel"
          borderWidth="1px"
          rounded="xl"
          shadow="lg"
          textAlign="center"
          align="center"
        >
          <Text textStyle="sm" color="fg.muted" fontWeight="medium">
            404
          </Text>
          <Heading as="h1" size="2xl">
            Nothing waits here
          </Heading>
          <Text color="fg.muted">This page doesn&apos;t exist, or it isn&apos;t yours to see.</Text>
          <Button asChild>
            <NextLink href="/home">Back to home</NextLink>
          </Button>
        </Stack>
      </Flex>
    </Flex>
  );
}
