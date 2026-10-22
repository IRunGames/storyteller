"use client";

import { useState } from "react";
import { Box, Heading, HStack, Stack } from "@chakra-ui/react";
import { Settings } from "lucide-react";
import { elementIdOf, playStacks, type PlayItem } from "@/lib/run";
import type { StackRename } from "@/lib/stack-schemas";
import { RunManageStacksDialog } from "@/components/run/run-manage-stacks-dialog";
import { RunPlayStack } from "@/components/run/run-play-stack";
import { PrepIconButton } from "./prep-icon-button";

type Props = {
  idStory: number;
  idStoryScene: number;
  /** The scene's stacks, in order, as sa_getScenePlaySpace read them. */
  initialTags: string[];
  /** The elements linked to the scene, as read with the page. */
  initialItems: PlayItem[];
  /** The scene is complete: the pills are there to read, with no + and nothing that changes them. */
  locked: boolean;
  /**
   * The page has the scene's cover behind it, so the heading stands on a
   * part see-through chip, as the run page's scene title does, to be read
   * over the picture.
   */
  onCover?: boolean;
};

/**
 * The third column of a scene's edit page: the elements brought into the
 * scene, in one stack per scene tag with a + each for a new element filed
 * under it, as the run page's play space has them (RunPlayStack). The
 * stacks run one under another, each the column's width, rather than across
 * a play space.
 *
 * The pills are the run page's own, so an element is edited, moved between
 * stacks or taken out of the scene from its panel here as there. They have
 * no tack: putting a picture up on the players' table is something done at
 * the table, not while the scene is being written.
 *
 * The gear at the heading's end opens Manage stacks, the run page's dialog
 * from its library footer, to add, take away, rename and order the stacks.
 * A complete scene has no gear, as on the run page: its stacks are fixed.
 */
export function SceneElements({
  idStory,
  idStoryScene,
  initialTags,
  initialItems,
  locked,
  onCover = false,
}: Props) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [items, setItems] = useState<PlayItem[]>(initialItems);
  const [managingStacks, setManagingStacks] = useState(false);

  // A new element from a stack's +; one already here stays where it is.
  const put = (item: PlayItem) =>
    setItems((current) =>
      current.some((existing) => existing.key === item.key) ? current : [...current, item],
    );
  const remove = (key: string) =>
    setItems((current) => current.filter((existing) => existing.key !== key));
  const setStatus = (key: string, status: string) =>
    setItems((current) =>
      current.map((existing) =>
        existing.key === key ? { ...existing, sceneStatus: status } : existing,
      ),
    );
  // Matched by the element's id rather than the key, which carries the
  // kind: an edit that changes the kind comes back under a new key.
  const replace = (item: PlayItem) =>
    setItems((current) =>
      current.map((existing) =>
        existing.kind !== "ATTACHMENT" && elementIdOf(existing) === elementIdOf(item)
          ? item
          : existing,
      ),
    );

  // Manage stacks saved: as the run page does, a renamed stack takes its
  // pills with it, as the action took their links, and one taken away
  // leaves its pills filed under the old name, so they fall into the first.
  const saveStacks = (next: string[], renames: StackRename[]) => {
    const renamed = (tag: string) => renames.find((rename) => rename.from === tag)?.to ?? tag;
    setTags(next);
    if (renames.length > 0) {
      setItems((current) =>
        current.map((existing) =>
          existing.sceneTags
            ? { ...existing, sceneTags: existing.sceneTags.map(renamed) }
            : existing,
        ),
      );
    }
  };

  return (
    <Stack as="section" aria-labelledby="scene-elements-heading" gap="4">
      <HStack justify="space-between" gap="2">
        <Heading
          id="scene-elements-heading"
          as="h2"
          size="md"
          alignSelf="flex-start"
          rounded="2xl"
          px={onCover ? "3" : undefined}
          py={onCover ? "1" : undefined}
          bg={onCover ? "bg.panel/55" : undefined}
          backdropFilter={onCover ? "blur(6px)" : undefined}
        >
          Elements
        </Heading>
        {!locked && (
          <>
            {/* On the heading's chip over a cover, so the gear reads too. */}
            <Box
              rounded="full"
              bg={onCover ? "bg.panel/55" : undefined}
              backdropFilter={onCover ? "blur(6px)" : undefined}
            >
              <PrepIconButton label="Manage stacks" onClick={() => setManagingStacks(true)}>
                <Settings />
              </PrepIconButton>
            </Box>
            <RunManageStacksDialog
              idStory={idStory}
              idStoryScene={idStoryScene}
              tags={tags}
              open={managingStacks}
              onClose={() => setManagingStacks(false)}
              onSaved={saveStacks}
            />
          </>
        )}
      </HStack>
      {playStacks(tags, items).map((stack) => (
        <RunPlayStack
          key={stack.title}
          idStory={idStory}
          stack={stack}
          sceneTags={tags}
          idStoryScene={idStoryScene}
          onCreated={put}
          onRemove={remove}
          onStatusChange={setStatus}
          onItemChange={replace}
          locked={locked}
          fullWidth
        />
      ))}
    </Stack>
  );
}
