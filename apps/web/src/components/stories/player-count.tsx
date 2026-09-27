"use client";

import { Box, HStack, Portal, Text, Tooltip, VisuallyHidden } from "@chakra-ui/react";
import type { StackProps } from "@chakra-ui/react";
import { Slash, User } from "lucide-react";
import { formatPlayerCount } from "@/lib/stories";

// Whatever the caller wants on the row itself. StackProps rather than the
// span's own props: it is an HStack underneath, and its `direction` is not
// the plain CSS one.
type Props = Omit<StackProps, "children"> & {
  count: number;
};

/**
 * How many players sit at a table: a person and a number, with the words
 * behind it. It is used where there is no room to write "3 players" — on a
 * story card over its cover, and on a Prep Work timeline row — so the count
 * reads at a glance and "3 players" is what a screen reader and the tooltip
 * both say.
 *
 * A story nobody has joined shows the person struck through and no number,
 * since the strike already says zero. Lucide has no crossed-out person, so
 * its Slash is laid over its User.
 *
 * Whatever the caller passes lands on the row, which is how the card gets its
 * dark pill over the cover while the timeline stays plain text.
 */
export function PlayerCount({ count, ...rest }: Props) {
  const label = formatPlayerCount(count);

  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <HStack as="span" aria-label={label} gap="1" textStyle="xs" {...rest}>
          <Box as="span" position="relative" display="inline-flex">
            <User size={14} />
            {count === 0 && (
              <Box as="span" position="absolute" inset="0" display="inline-flex">
                <Slash size={14} />
              </Box>
            )}
          </Box>
          {count > 0 && <Text as="span">{count}</Text>}
          <VisuallyHidden>{label}</VisuallyHidden>
        </HStack>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>Player Count</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
