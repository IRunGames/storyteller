"use client";

import type { ReactNode } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { cssUrlValue } from "@/lib/stories";
import { PlayHeader } from "./play-header";

type Props = {
  /** The story's title, for the header. */
  title: string;
  /** The story's cover, or null for the plain page background. */
  imageUrl: string | null;
  children?: ReactNode;
};

// A /play/[id] screen that is not the table yet: the header, then the story's
// cover filling the rest of the window behind whatever is in front of it.
// The cover sits on its own layer under a scrim, so what is placed over it
// keeps its own panel colours and reads the same on a bright cover, a dark
// one, or none.
export function PlayCover({ title, imageUrl, children }: Props) {
  return (
    <Flex direction="column" minH="100vh">
      <PlayHeader title={title} />
      <Flex position="relative" flex="1" direction="column" bg="bg.subtle">
        {imageUrl && (
          <>
            <Box
              aria-hidden
              position="absolute"
              inset="0"
              bgSize="cover"
              bgPos="center"
              style={{ backgroundImage: `url("${cssUrlValue(imageUrl)}")` }}
            />
            <Box aria-hidden position="absolute" inset="0" bg="blackAlpha.500" />
          </>
        )}
        {/* Whatever is placed on the cover sits in the middle of it, both
            ways. A flex item rather than a fixed height, so a card taller than
            the window still grows and the page scrolls to it. */}
        <Flex position="relative" flex="1" align="center" justify="center">
          {children}
        </Flex>
      </Flex>
    </Flex>
  );
}
