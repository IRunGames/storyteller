"use client";

import { Box } from "@chakra-ui/react";
import { CloudFog } from "lucide-react";

/**
 * The fog mark in the corner of a pill's picture while it is annotated: the
 * players are shown it under the storyteller's fog and pen marks. Over the
 * picture, so it takes the cards' dark band rather than a theme colour; it
 * passes presses through to the picture under it.
 */
export function FogMark() {
  return (
    <Box
      role="img"
      aria-label="Annotated for players"
      position="absolute"
      insetEnd="0.5"
      bottom="0.5"
      rounded="full"
      p="0.5"
      bg="blackAlpha.600"
      color="white"
      lineHeight="0"
      pointerEvents="none"
    >
      <CloudFog size={10} aria-hidden />
    </Box>
  );
}
