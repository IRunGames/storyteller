"use client";

import { useState } from "react";
import NextLink from "next/link";
import { Button, Heading, Stack, Text } from "@chakra-ui/react";
import { pickErrorBackground } from "@/lib/error-page";
import { useOptionalUser } from "@/components/auth/user-provider";
import { useSignOut } from "@/components/auth/sign-out-button";
import { PictureBackdrop } from "@/components/errors/picture-backdrop";

/**
 * Error boundary for every signed-in route.
 *
 * requireUser() throws UnauthorizedError when the session cookie is still
 * valid but the user row is gone or deactivated. That happens inside the
 * render of a Server Component, where a throw is a 500 and the visitor is
 * left on a raw Next error page with no way back. This catches it and offers
 * the two things that actually help: retry, or sign out and in again.
 *
 * It stands in for the (app) group's children, menu bar included, so it fills
 * the window with one of the error pictures behind the message. The picture
 * is chosen once, when the boundary first shows, so a retry that fails again
 * does not swap it; lib/error-page.ts says how it stays the same on the
 * server and in the browser.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [background] = useState(() => pickErrorBackground(error.digest));
  // Someone still signed in cannot use a Sign in link: /login sends a
  // signed-in visitor straight back into the app. They are offered Sign out
  // instead, which ends the session and lands on /login to sign in afresh.
  // (app)/layout.tsx mounts UserProvider above this boundary, so the user is
  // there whenever the layout itself rendered.
  const user = useOptionalUser();
  const { signOut, isSigningOut } = useSignOut("/login");

  return (
    <PictureBackdrop imageUrl={background}>
      <Heading as="h1" size="xl">
        Something went wrong loading this page.
      </Heading>
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
        {user ? (
          <Button variant="outline" onClick={signOut} loading={isSigningOut}>
            Sign out
          </Button>
        ) : (
          <Button asChild variant="outline">
            <NextLink href="/login">Sign in</NextLink>
          </Button>
        )}
      </Stack>
    </PictureBackdrop>
  );
}
