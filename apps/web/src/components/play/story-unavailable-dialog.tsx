"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Dialog, Portal, Stack, Text } from "@chakra-ui/react";
import type { PlayStory } from "@/lib/play";
import { sa_activateStory } from "@/app/(app)/play/[id]/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  story: Pick<PlayStory, "idStory" | "title" | "isOwner" | "isActive" | "isArchived">;
};

/**
 * What /play/[id] shows in place of the table when the story is switched
 * off or archived. It cannot be dismissed — there is no table behind it to
 * go back to — so it has no close button, and neither Escape nor a click
 * outside closes it; every way out is one of its buttons.
 *
 * The storyteller can go and edit the story, and an inactive one can be
 * switched back on from here. An archived one is only offered the edit
 * form, even when it is also inactive: making it active would still leave
 * it archived, and unarchiving belongs on the form where the rest of the
 * story is in view. A player can do neither, so they are only told why.
 *
 * role="alertdialog" because it stops the reader rather than offering them
 * a panel to read, as the remove-player dialog does.
 */
export function StoryUnavailableDialog({ story }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isActivating, setActivating] = useState(false);
  const [isActivated, setActivated] = useState(false);

  async function activate() {
    setActivating(true);
    setError(null);
    try {
      const result = await sa_activateStory(story.idStory);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The page decides what /play/[id] shows, so a refresh is what swaps
      // this dialog for the table. The button stays loading until it does.
      setActivated(true);
      toaster.create({ title: `${story.title} is active.`, type: "success" });
      router.refresh();
    } catch {
      setError("The story could not be made active. Try again.");
    } finally {
      setActivating(false);
    }
  }

  const canActivate = story.isOwner && !story.isActive && !story.isArchived;

  return (
    <Dialog.Root
      role="alertdialog"
      open
      closeOnEscape={false}
      closeOnInteractOutside={false}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{title(story)}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="3">
                <Text>{explanation(story)}</Text>
                {error && (
                  // role="alert", which Chakra's Alert does not set itself.
                  <Alert.Root role="alert" status="error" size="sm">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{error}</Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                )}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button asChild variant="ghost">
                <NextLink href="/play">Back to Play</NextLink>
              </Button>
              {story.isOwner && (
                <Button asChild variant={canActivate ? "outline" : "solid"}>
                  <NextLink href={`/stories/${story.idStory}/edit`}>Edit story</NextLink>
                </Button>
              )}
              {canActivate && (
                <Button
                  onClick={activate}
                  loading={isActivating || isActivated}
                  loadingText="Making active"
                >
                  Make active
                </Button>
              )}
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function title(story: Props["story"]): string {
  if (story.isArchived) return `${story.title} is archived`;
  return `${story.title} is not active`;
}

function explanation(story: Props["story"]): string {
  if (!story.isOwner) {
    return "Its storyteller has put this story away, so there is no table to join.";
  }
  if (story.isArchived) {
    return "An archived story cannot be played. Unarchive it from the edit form to open its table again.";
  }
  return "An inactive story cannot be played. Make it active to open its table, or edit it first.";
}
