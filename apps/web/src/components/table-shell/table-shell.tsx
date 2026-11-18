"use client";

import type { ReactNode } from "react";
import { Box, Flex } from "@chakra-ui/react";

type Props = {
  /** Something that draws nothing of its own but belongs to the table: the run table's inactivity check. */
  before?: ReactNode;
  /** The table's own chrome in place of the menu bar (PlayHeader). */
  header: ReactNode;
  /** Down the left, before the play space: the storyteller's library and stats panes. */
  left?: ReactNode;
  /** The play space, which takes the room left. */
  children: ReactNode;
  /** Under the play space, in its column: the character space. */
  below?: ReactNode;
  /** The right panel's content, the chat or the diagnostics; nothing for no panel. */
  right?: ReactNode;
  /** Over the whole table: the chat's overlay layout. */
  overlay?: ReactNode;
};

/**
 * The frame every table shares: the header on top, then one row the height
 * of the window holding whatever stands left of the play space, the play
 * space itself with anything under it, and the right panel. minH 0 all the
 * way down, so each panel scrolls inside itself instead of stretching the
 * page past the window. The storyteller's run table fills every slot, the
 * scene's live-edit page the header and the left, the players' table the
 * header, the right and the overlay.
 */
export function TableShell({ before, header, left, children, below, right, overlay }: Props) {
  return (
    <Flex direction="column" h="100vh">
      {before}
      {header}
      <Flex flex="1" minH="0">
        {left}
        <Flex direction="column" flex="1" minW="0">
          {children}
          {below}
        </Flex>
        {right && (
          <Box
            w={{ base: "72", md: "sm" }}
            flexShrink="0"
            minH="0"
            borderLeftWidth="1px"
            bg="bg.subtle"
          >
            {right}
          </Box>
        )}
      </Flex>
      {overlay}
    </Flex>
  );
}
