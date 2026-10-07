import type { Metadata } from "next";
import NextLink from "next/link";
import { Button, Heading, Text } from "@chakra-ui/react";
import { PictureBackdrop } from "@/components/errors/picture-backdrop";

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
export default function NotFound() {
  return (
    <PictureBackdrop imageUrl="/images/not-found.webp">
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
    </PictureBackdrop>
  );
}
