"use client";

import NextLink from "next/link";
import { Button, Center, Heading, Stack, Text } from "@chakra-ui/react";

/**
 * Error boundary for every signed-in route.
 *
 * requireUser() throws UnauthorizedError when the session cookie is still
 * valid but the user row is gone or deactivated. That happens inside the
 * render of a Server Component, where a throw is a 500 and the visitor is
 * left on a raw Next error page with no way back. This catches it and offers
 * the two things that actually help: retry, or sign in as someone else.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Center minH="50vh" p="8">
      <Stack gap="4" align="center" textAlign="center">
        <Heading size="xl">Something went wrong loading this page.</Heading>
        <Text color="fg.muted">
          You may need to sign in again, or the page may just need another try.
        </Text>
        {/* Next replaces a server error's message with an opaque digest; it is
            the only thing that ties what the visitor saw to the server log. */}
        {error.digest && (
          <Text textStyle="xs" color="fg.subtle">
            Reference: {error.digest}
          </Text>
        )}
        <Stack direction="row" gap="3">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <NextLink href="/login">Sign in</NextLink>
          </Button>
        </Stack>
      </Stack>
    </Center>
  );
}
