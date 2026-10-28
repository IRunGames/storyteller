"use client";

import NextLink from "next/link";
import { IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { Monitor } from "lucide-react";

/**
 * The button in the middle of a table's header, beside its panel toggles,
 * that goes to the story's display table (/table/[id]): the same scene,
 * large, with nothing to press, for a screen the whole table reads. A link
 * in the toggles' clothes, since it leaves the page rather than opening a
 * panel. The display table's own button comes back.
 */
export function DisplayModeButton({ idStory }: { idStory: number }) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton asChild variant="ghost" boxSize="11" rounded="10px" color="nav.icon">
          <NextLink href={`/table/${idStory}`} aria-label="Display mode">
            <Monitor />
          </NextLink>
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>Display mode</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
