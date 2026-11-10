"use client";

import { useId, useState } from "react";
import {
  Alert,
  Button,
  HStack,
  IconButton,
  Popover,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Copy } from "lucide-react";
import type { RunScene } from "@/lib/run";
import { duplicateSceneTitle } from "@/lib/scenes";
import { sa_duplicateLiveScene } from "@/app/(app)/scenes/[id]/live/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  idStory: number;
  /** The scene the page is on, which is the one copied. */
  scene: RunScene;
  /** The copy was made: the page goes to it. */
  onDuplicated: (idStoryScene: number) => void;
};

/**
 * The Duplicate beside the live-edit page's scene selector, and the popover
 * that asks first: a copy is a whole new scene with every element and
 * picture of this one, which is a lot to make by a slip of the hand, and
 * the page leaves for the copy once it is made. The question names the
 * copy as the action will (duplicateSceneTitle) and says what goes into
 * it. The same shape as DeleteButton's popover, Cancel at the start and
 * the action at the end, a refusal inline and the success a toast, but not
 * that component: nothing here is taken away, so neither its red nor its
 * words fit.
 */
export function DuplicateSceneButton({ idStory, scene, onDuplicated }: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);
  const label = "Duplicate scene";
  const copyTitle = duplicateSceneTitle(scene.title);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await sa_duplicateLiveScene(idStory, scene.idStoryScene);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toaster.create({ title: `${copyTitle} has been made.`, type: "success" });
      onDuplicated(result.idStoryScene);
    } catch {
      setError("The scene could not be duplicated. Try again.");
    } finally {
      setBusy(false);
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
      positioning={{ placement: "bottom-end" }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              type="button"
              aria-label={label}
              aria-expanded={open}
              variant="ghost"
              size="xs"
              rounded="full"
            >
              <Copy />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>{label}</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="sm">
            <Popover.Arrow />
            <Popover.Header fontWeight="semibold">
              <Popover.Title>Duplicate {scene.title}?</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              <Stack gap="3">
                <Text fontSize="sm">
                  A new scene, {copyTitle}, will be made with this scene&apos;s description, notes,
                  stacks, pictures and elements, waiting to be played. You will be taken to it.
                </Text>
                {error && (
                  // role="alert", which Chakra's Alert does not set itself.
                  <Alert.Root role="alert" status="error" size="sm">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{error}</Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                )}
                <HStack justify="space-between" gap="2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    loading={isBusy}
                    loadingText="Duplicating"
                    onClick={() => void confirm()}
                  >
                    Duplicate
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
