"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  CloseButton,
  Dialog,
  HStack,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import type { PlayItem } from "@/lib/run";
import { sa_setSceneElementTags } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  idStory: number;
  idStoryScene: number;
  idElement: number;
  /** What the element is called, to name the dialog. */
  name: string;
  /** The scene's stacks, in order. */
  stacks: string[];
  /** The link's tags as the dialog opens: the stacks it is ticked for. */
  tags: string[];
  open: boolean;
  onClose: () => void;
  /** The stacks saved, as the pill now is. */
  onSaved: (item: PlayItem) => void;
};

/**
 * The element panel's Stack row, pressed: which of the scene's stacks the
 * element is filed under, one checkbox per stack, saved together
 * (sa_setSceneElementTags) so Cancel leaves the link as it was. Only the
 * scene's stacks are offered; making a stack is Manage stacks' job, from
 * the library footer's gear.
 */
export function RunSceneElementStacksDialog({
  idStory,
  idStoryScene,
  idElement,
  name,
  stacks,
  tags,
  open,
  onClose,
  onSaved,
}: Props) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      size="sm"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Stacks for {name}</Dialog.Title>
            </Dialog.Header>
            {/* Only drawn while open, so each opening starts from the link's
                tags as they are now. */}
            {open && (
              <StacksForm
                idStory={idStory}
                idStoryScene={idStoryScene}
                idElement={idElement}
                stacks={stacks}
                tags={tags}
                onClose={onClose}
                onSaved={onSaved}
              />
            )}
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function StacksForm({
  idStory,
  idStoryScene,
  idElement,
  stacks,
  tags,
  onClose,
  onSaved,
}: Omit<Props, "open" | "name">) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(tags));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function tick(stack: string, checked: boolean) {
    setTicked((current) => {
      const next = new Set(current);
      if (checked) next.add(stack);
      else next.delete(stack);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const result = await sa_setSceneElementTags(
        idStory,
        idStoryScene,
        idElement,
        stacks.filter((stack) => ticked.has(stack)),
      );
      if (result.ok) {
        onSaved(result.item);
        toaster.create({ title: "Stacks saved", type: "success" });
        onClose();
        return;
      }
      setError(result.error);
    } catch {
      setError("The stacks could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog.Body>
        <Stack gap="3">
          {error && (
            <Alert.Root status="error">
              <Alert.Indicator />
              <Alert.Title>{error}</Alert.Title>
            </Alert.Root>
          )}
          {stacks.length === 0 ? (
            <Text color="fg.muted">
              No stacks: the scene shows everything in one Default stack.
            </Text>
          ) : (
            <Stack gap="2" role="group" aria-label="Stacks">
              {stacks.map((stack) => (
                <Checkbox.Root
                  key={stack}
                  size="sm"
                  checked={ticked.has(stack)}
                  onCheckedChange={(details) => tick(stack, details.checked === true)}
                >
                  <Checkbox.HiddenInput />
                  <Checkbox.Control />
                  <Checkbox.Label>{stack}</Checkbox.Label>
                </Checkbox.Root>
              ))}
            </Stack>
          )}
        </Stack>
      </Dialog.Body>
      <Dialog.Footer>
        <HStack gap="2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </HStack>
      </Dialog.Footer>
    </>
  );
}
