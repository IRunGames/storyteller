"use client";

import { useId, useState } from "react";
import { Button, HStack, IconButton, Popover, Portal, Text, Tooltip } from "@chakra-ui/react";
import { RotateCw } from "lucide-react";

type Props = {
  /** What the pill calls the element, for the button's name and the question. */
  label: string;
  /** The player has said yes to untapping the card. */
  onConfirm: () => void;
};

/**
 * The turned arrow at the start of a tapped player pill whose info is
 * showing: a button that asks before untapping the card, since readying a
 * card is a move everyone at the table sees. The question is anchored to
 * the button, as a status pill's confirmation is (status-pill.tsx), with
 * Cancel and Untap; Untap is reported, and the pill does the rest.
 */
export function PlayUntapButton({ label, onConfirm }: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [asking, setAsking] = useState(false);

  return (
    <Popover.Root
      ids={{ trigger: triggerId }}
      open={asking}
      onOpenChange={(details) => setAsking(details.open)}
      positioning={{ placement: "bottom-start" }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              aria-label={`Tapped: untap ${label}`}
              size="xs"
              variant="ghost"
              rounded="full"
              color="fg.muted"
            >
              <RotateCw />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Tapped: press to untap</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="xs">
            <Popover.Arrow />
            <Popover.Body>
              <Popover.Title fontWeight="semibold">Untap {label}?</Popover.Title>
              <Text textStyle="sm" color="fg.muted" mt="1">
                The card goes back to ready for everyone at the table.
              </Text>
              <HStack gap="2" mt="3" justify="flex-end">
                <Button size="sm" variant="outline" onClick={() => setAsking(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setAsking(false);
                    onConfirm();
                  }}
                >
                  Untap
                </Button>
              </HStack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
