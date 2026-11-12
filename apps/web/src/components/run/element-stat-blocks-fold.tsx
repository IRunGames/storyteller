"use client";

import { useState } from "react";
import { Stack } from "@chakra-ui/react";
import type { ElementStatBlock, StatBlockHolder } from "@/components/stat-blocks/actions";
import { FoldButton } from "@/components/stat-blocks/fold-button";
import { StatBlockView } from "@/components/stat-blocks/stat-block-view";

/**
 * The element's own stat blocks under a pill's panel, folded: a heading that
 * says how many blocks the element carries, which opens to show them as the
 * table draws them, to read and not to change. The scene element's copy
 * above is what play changes; this is the baseline the element was prepared
 * with, which the scene part's copy button starts the link again from.
 * Nothing is drawn for an element with no block.
 */
export function ElementStatBlocksFold({
  holder,
  blocks,
}: {
  /** The element, as the blocks' holder. */
  holder: StatBlockHolder;
  /** The element's blocks, as the panel read them. */
  blocks: ElementStatBlock[];
}) {
  const [open, setOpen] = useState(false);
  const stored = blocks.filter((block) => block.stored && block.carried.length > 0);
  const count = stored.reduce((sum, block) => sum + block.carried.length, 0);
  if (count === 0) return null;
  return (
    <Stack gap="2" data-testid="element-stat-blocks-fold">
      <FoldButton open={open} onToggle={() => setOpen((current) => !current)}>
        {count === 1 ? "1 stat block" : `${count} stat blocks`} on the element
      </FoldButton>
      {open && (
        <Stack gap="3" pl="4">
          {stored.map((block) => (
            <StatBlockView
              key={block.idSystem}
              holder={holder}
              block={block}
              canEdit={false}
              onChange={() => {}}
              onBlocks={() => {}}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
