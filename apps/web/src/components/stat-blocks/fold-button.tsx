"use client";

import { type ReactNode } from "react";
import { chakra, Text } from "@chakra-ui/react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * The line that opens and closes a folded run of stat blocks: a chevron,
 * right while closed and down while open, and what the fold says of itself
 * (how many blocks, and whose). The element panel folds the element's own
 * blocks (ElementStatBlocksFold) and the scene element's copy
 * (ElementStatBlocks) behind one each, so the panel opens short and the
 * blocks are read when wanted.
 */
export function FoldButton({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <chakra.button
      type="button"
      display="inline-flex"
      alignItems="center"
      gap="1"
      alignSelf="flex-start"
      cursor="pointer"
      rounded="sm"
      fontSize="xs"
      fontWeight="semibold"
      color="fg.muted"
      aria-expanded={open}
      onClick={onToggle}
      _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
    >
      <chakra.span display="inline-flex" aria-hidden>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </chakra.span>
      <Text as="span">{children}</Text>
    </chakra.button>
  );
}
