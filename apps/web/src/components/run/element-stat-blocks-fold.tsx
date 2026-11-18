"use client";

import { useState } from "react";
import { Stack } from "@chakra-ui/react";
import type { ElementStatBlock, StatBlockHolder } from "@/components/stat-blocks/actions";
import { Fold } from "@/components/stat-blocks/fold";
import { StatBlockView } from "@/components/stat-blocks/stat-block-view";
import { plural } from "@/lib/plural";

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
      <Fold
        open={open}
        onOpenChange={setOpen}
        summary={`${plural(count, "stat block")} on the element`}
      >
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
      </Fold>
    </Stack>
  );
}
