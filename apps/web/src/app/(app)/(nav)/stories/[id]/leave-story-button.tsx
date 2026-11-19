"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, HStack, Popover, Portal, Stack, Text } from "@chakra-ui/react";
import { LogOut } from "lucide-react";
import { sa_leaveStory } from "@/components/stories/actions";
import { toaster } from "@/components/ui/toaster";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { FormError } from "@/components/forms/form-error";

type Props = {
  idStory: number;
  /** The seat is gone, so the list can drop the caller's row. */
  onLeft: () => void;
};

/**
 * The round exit button beside the caller's own place in a story's Players,
 * and the popover that asks before they give it up. Leaving cannot be undone
 * from here: only the storyteller seats players, so the question says that
 * coming back takes another invitation.
 *
 * A refusal stays in the popover as an inline alert; success is a toast,
 * since the popover closes with the row it hung from. The page is refreshed
 * as well, so whatever else on it depended on the seat catches up.
 */
export function LeaveStoryButton({ idStory, onLeft }: Props) {
  const router = useRouter();
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLeaving, setLeaving] = useState(false);

  async function leave() {
    setLeaving(true);
    setError(null);
    try {
      const result = await sa_leaveStory(idStory);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onLeft();
      router.refresh();
      toaster.create({ title: "You have left the game.", type: "success" });
    } catch {
      setError("You could not leave the game. Try again.");
    } finally {
      setLeaving(false);
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        if (!details.open) setError(null);
      }}
      ids={{ trigger: triggerId }}
      positioning={{ placement: "top" }}
    >
      <IconButtonWithTooltip
        label="Leave game"
        type="button"
        variant="outline"
        colorPalette="red"
        popoverTrigger={triggerId}
      >
        <LogOut />
      </IconButtonWithTooltip>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="xs">
            <Popover.Arrow />
            <Popover.Header fontWeight="semibold">
              <Popover.Title>Leave this game?</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              <Stack gap="3">
                <Text fontSize="sm">
                  Are you sure you want to leave? You will have to be invited again by the
                  storyteller to rejoin the game.
                </Text>
                <FormError message={error} size="sm" />
                {/* Cancel at the start and the action at the end, as the
                    forms lay them out. */}
                <HStack justify="space-between" gap="2">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    colorPalette="red"
                    loading={isLeaving}
                    loadingText="Leaving"
                    onClick={() => void leave()}
                  >
                    Leave
                  </Button>
                </HStack>
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
