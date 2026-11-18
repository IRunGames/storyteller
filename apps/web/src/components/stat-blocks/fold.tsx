"use client";

import { type ReactNode } from "react";
import { chakra, Collapsible, Text } from "@chakra-ui/react";
import { ChevronDown, ChevronRight } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the fold says of itself on its line: how many blocks, and whose. */
  summary: ReactNode;
  /** What the fold holds, mounted only while open: the blocks load as they mount. */
  children: ReactNode;
};

/**
 * A folded run of stat blocks: Chakra's Collapsible, with a line of its own
 * for the trigger (a chevron, right while closed and down while open, and
 * the summary). The element panel folds the element's own blocks
 * (ElementStatBlocksFold) and the scene element's copy (ElementStatBlocks)
 * behind one each, so the panel opens short and the blocks are read when
 * wanted. The content mounts on opening and goes with closing, since each
 * block view loads its stats as it mounts.
 */
export function Fold({ open, onOpenChange, summary, children }: Props) {
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
      lazyMount
      unmountOnExit
      display="flex"
      flexDirection="column"
      gap="2"
    >
      <Collapsible.Trigger asChild>
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
          _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
        >
          <chakra.span display="inline-flex" aria-hidden>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </chakra.span>
          <Text as="span">{summary}</Text>
        </chakra.button>
      </Collapsible.Trigger>
      <Collapsible.Content>{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}
