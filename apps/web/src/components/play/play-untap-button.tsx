"use client";

import { useId, useState } from "react";
import { Button, HStack, Popover, Portal, Text } from "@chakra-ui/react";
import { RotateCw } from "lucide-react";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";

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
  const triggerId = useId();
  const [asking, setAsking] = useState(false);

  return (
    <Popover.Root
      ids={{ trigger: triggerId }}
      open={asking}
      onOpenChange={(details) => setAsking(details.open)}
      positioning={{ placement: "bottom-start" }}
    >
      <IconButtonWithTooltip
        label={`Tapped: untap ${label}`}
        tooltip="Tapped: press to untap"
        color="fg.muted"
        popoverTrigger={triggerId}
      >
        <RotateCw />
      </IconButtonWithTooltip>
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
