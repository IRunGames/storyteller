"use client";

import { useState, type ReactNode } from "react";
import { Box, Container, HStack, IconButton, Portal, Stack, Tooltip } from "@chakra-ui/react";
import { Maximize2, Minimize2 } from "lucide-react";

type Props = {
  /** True when the page has a cover behind it: the panel then draws itself. */
  onImage: boolean;
  /** Anything for the end of the second line, across from the details; the doors moved into the title's menu. */
  doors?: ReactNode;
  /** At the end of the title's line, before the expand button: the story card's heart. */
  corner?: ReactNode;
  /** The title and what sits beside it, at the start of the first line. */
  heading: ReactNode;
  /** The lines under the title, the game system first: the second line's start. */
  details: ReactNode;
  children: ReactNode;
};

/**
 * The story page's column and the panel in it. The panel's head is two
 * lines in the flow of the page: the first has the title and what sits
 * beside it at the start and, at the end, the story card's heart with the
 * expand button to its right; the second has the details, the game system
 * first, at the start and the storyteller's doors across from them at the
 * end. Nothing floats over the text, so the title can run as long as it
 * likes. The column is a reading
 * width to begin with; the button takes it out to the whole window less a
 * small gutter either side, for the long lists further down, the sessions
 * and the attachments, and back again. The button is the storyboard card's
 * Expand and Shrink: it is hidden on a phone, where the column already has
 * the whole width. A client component of its own, so StoryDetails around it
 * can go on rendering on the server with the width the only state here.
 *
 * One panel for everything, heading included. Opaque without a cover would
 * be a box on a plain page for no reason, so the panel only draws itself
 * when there is an image to stand out from.
 */
export function StoryPanel({ onImage, doors, corner, heading, details, children }: Props) {
  const [wide, setWide] = useState(false);
  const size = wide ? "Shrink page" : "Expand page";

  return (
    // The gutter is the Container's own padding, which maxW full leaves in
    // place: the column reaches the window's edges less that much.
    <Container
      maxW={wide ? "full" : "3xl"}
      py="8"
      position="relative"
      data-wide={wide || undefined}
    >
      <Stack
        gap="10"
        p={onImage ? { base: "5", md: "8" } : undefined}
        rounded="xl"
        bg={onImage ? "blackAlpha.700" : undefined}
        color={onImage ? "white" : undefined}
      >
        <Stack gap="2">
          <HStack justify="space-between" align="start" gap="4" wrap="wrap">
            {heading}
            <HStack gap="1" flexShrink="0" ms="auto">
              {corner}
              <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
                <Tooltip.Trigger asChild>
                  <IconButton
                    type="button"
                    aria-label={size}
                    aria-pressed={wide}
                    variant="ghost"
                    size="sm"
                    rounded="full"
                    color={onImage ? "whiteAlpha.900" : undefined}
                    _hover={onImage ? { bg: "whiteAlpha.200" } : undefined}
                    hideBelow="md"
                    onClick={() => setWide(!wide)}
                  >
                    {wide ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  </IconButton>
                </Tooltip.Trigger>
                <Portal>
                  <Tooltip.Positioner>
                    <Tooltip.Content>{size}</Tooltip.Content>
                  </Tooltip.Positioner>
                </Portal>
              </Tooltip.Root>
            </HStack>
          </HStack>
          <HStack justify="space-between" align="start" gap="4">
            <Box flex="1" minW="0">
              {details}
            </Box>
            {doors && (
              <HStack gap="1" flexShrink="0">
                {doors}
              </HStack>
            )}
          </HStack>
        </Stack>
        {children}
      </Stack>
    </Container>
  );
}
