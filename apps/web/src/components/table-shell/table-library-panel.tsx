"use client";

import { useState } from "react";
import { Box, Heading, HStack, SegmentGroup, Separator, Stack, Switch } from "@chakra-ui/react";
import { Settings } from "lucide-react";
import {
  DEFAULT_ATTACHMENT_SORT,
  DEFAULT_ELEMENT_SORT,
  elementIdOf,
  isAttachmentSort,
  isElementSort,
  RUN_ADD_INVISIBLE,
  RUN_ADD_SHOW_INFO,
  RUN_LIBRARY_ATTACHMENT_SORT,
  RUN_LIBRARY_ELEMENT_SORT,
  RUN_LIBRARY_SCENE_ONLY,
  type PlayItem,
  type RunLibrarySource,
  type RunScene,
} from "@/lib/run";
import type { StackRename } from "@/lib/stack-schemas";
import { sa_linkSceneElement } from "@/components/scene-elements/actions";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { toaster } from "@/components/ui/toaster";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { RunLibrary } from "@/components/run/run-library";
import { RunLibrarySortMenu } from "@/components/run/run-library-sort-menu";
import { RunManageStacksDialog } from "@/components/run/run-manage-stacks-dialog";
import { RunStackSelect } from "@/components/run/run-stack-select";
import { useSceneItemsContext } from "./scene-items-context";

type Props = {
  /** The section's DOM id, which the run table's Library toggle names in aria-controls. */
  id: string;
  /**
   * How wide, at md and up: the run table's sm, beside its stats, chat and
   * character panes; the live-edit page's md, having none of those to make
   * room for, and a scene's attachments carrying a Recycle beside the tags
   * and Cover on every line.
   */
  width: "sm" | "md";
  idStory: number;
  /** The scene the table is on; null for none, at the run table. */
  scene: RunScene | null;
  /** The scene's stacks, in order, and the table's setter for them. */
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  /** The scene is complete: nothing goes into it or comes out of it. */
  locked: boolean;
  /** The scene's cover has changed from the library: its url, or null for none. */
  onCoverChange: (url: string | null) => void;
  /** Bumped when the scene's pictures change elsewhere, so the library reads them again; see RunLibrary. */
  attachmentsVersion: number;
};

/**
 * The storyteller's library down the left of the run table and the live-edit
 * page: the heading with the sort menu beside it and All / Scene only at the
 * far end (how and what the library lists; with no scene at the table there
 * is only All), the library itself (RunLibrary), and under a rule, outside
 * the list's scroll so it stays in reach however far the list has scrolled,
 * how and where the library adds: on the left hidden or not and with or
 * without its info, on the right which stack, with the gear beside it for
 * the stacks themselves (RunManageStacksDialog). The stack controls need a
 * scene that is not complete.
 *
 * The switches and sorts are the storyteller's preferences, the same on
 * both tables since the library is the same one. The In select is held as
 * a name and checked against the scene's stacks on every render, so a new
 * scene, or the chosen stack taken off this one, falls back to the first
 * stack without anything having to reset it.
 *
 * The library's arrow links an element to the scene under the In select's
 * stack (sa_linkSceneElement), and it goes into the play space as the link
 * came back (useSceneItemsContext). An element already in the scene goes in
 * again as a copy, with its own link, and the storyteller is warned: a
 * second goblin is wanted often enough, a second copy of the same one by
 * mistake often enough too. With no scene at the table, what the library
 * adds is kept in the page's state only, so it is the storyteller's alone;
 * showing it to the players is for when the table has somewhere shared to
 * keep it.
 */
export function TableLibraryPanel({
  id,
  width,
  idStory,
  scene,
  tags,
  onTagsChange,
  locked,
  onCoverChange,
  attachmentsVersion,
}: Props) {
  const preferences = useUserPreferences();
  const { put, renameTags } = useSceneItemsContext();
  const headingId = `${id}-heading`;
  // The library's tab, held here for the sort menu beside its heading.
  const [libraryTab, setLibraryTab] = useState<RunLibrarySource>("ATTACHMENT");
  const [chosenStack, setChosenStack] = useState<string | null>(null);
  const inStack =
    chosenStack !== null && tags.includes(chosenStack) ? chosenStack : (tags[0] ?? null);
  const [managingStacks, setManagingStacks] = useState(false);

  // The library's Add as invisible switch; a stack's + reads it too, for
  // where its new element starts.
  const addInvisible = preferences.get<boolean>(RUN_ADD_INVISIBLE, false);
  // The library's Add showing info switch, read the same two ways: whether
  // the players see a new element's description.
  const addShowInfo = preferences.get<boolean>(RUN_ADD_SHOW_INFO, false);
  // The library's All / Scene only switch, kept as a preference like the
  // ones above. Only on while there is a scene to narrow to.
  const sceneOnly = preferences.get<boolean>(RUN_LIBRARY_SCENE_ONLY, false) && scene !== null;
  // The library's sorts, one for its Attachments tab and one for the element
  // tabs, each falling back to the default on a value the menu no longer
  // offers.
  const storedAttachmentSort = preferences.get<string>(RUN_LIBRARY_ATTACHMENT_SORT, "");
  const attachmentSort = isAttachmentSort(storedAttachmentSort)
    ? storedAttachmentSort
    : DEFAULT_ATTACHMENT_SORT;
  const storedElementSort = preferences.get<string>(RUN_LIBRARY_ELEMENT_SORT, "");
  const elementSort = isElementSort(storedElementSort) ? storedElementSort : DEFAULT_ELEMENT_SORT;

  async function add(item: PlayItem) {
    if (locked) return;
    if (scene === null) {
      put(item);
      return;
    }
    const idElement = elementIdOf(item);
    try {
      const result = await sa_linkSceneElement(idStory, scene.idStoryScene, idElement, {
        hidden: addInvisible,
        tag: inStack,
        showInfo: addShowInfo,
      });
      if (!result.ok) {
        toaster.create({ title: result.error, type: "error" });
        return;
      }
      put(result.item);
      if (result.duplicate) {
        toaster.create({
          title: `${item.label} is in the scene already`,
          description: `A copy was added as ${result.item.label}.`,
          type: "warning",
        });
      }
    } catch {
      toaster.create({ title: "The element could not be added. Try again.", type: "error" });
    }
  }

  // Manage stacks saved: the scene's stacks as they now are. A renamed stack
  // takes its pills with it, as the action took their links, and the In
  // select follows a stack it had chosen; one taken away leaves its pills
  // filed under the old name, so they fall into the first stack.
  const saveStacks = (next: string[], renames: StackRename[]) => {
    const renamed = (tag: string) => renames.find((rename) => rename.from === tag)?.to ?? tag;
    onTagsChange(next);
    if (renames.length > 0) {
      renameTags(renamed);
      setChosenStack((current) => (current === null ? current : renamed(current)));
    }
  };

  return (
    <Box
      as="section"
      id={id}
      aria-labelledby={headingId}
      w={{ base: "72", md: width }}
      flexShrink="0"
      minH="0"
      display="flex"
      flexDirection="column"
      gap="3"
      p="4"
      borderRightWidth="1px"
      bg="bg.subtle"
    >
      <HStack justify="space-between" gap="2">
        <HStack gap="1">
          <Heading id={headingId} size="sm">
            Library
          </Heading>
          <RunLibrarySortMenu
            tab={libraryTab}
            attachmentSort={attachmentSort}
            elementSort={elementSort}
            onAttachmentSortChange={(sort) => preferences.set(RUN_LIBRARY_ATTACHMENT_SORT, sort)}
            onElementSortChange={(sort) => preferences.set(RUN_LIBRARY_ELEMENT_SORT, sort)}
          />
        </HStack>
        <SegmentGroup.Root
          size="xs"
          aria-label="Which elements"
          value={sceneOnly ? "SCENE" : "ALL"}
          onValueChange={(details) =>
            preferences.set(RUN_LIBRARY_SCENE_ONLY, details.value === "SCENE")
          }
        >
          <SegmentGroup.Indicator />
          <SegmentGroup.Items
            items={[
              { value: "ALL", label: "All" },
              { value: "SCENE", label: "Scene only", disabled: scene === null },
            ]}
          />
        </SegmentGroup.Root>
      </HStack>
      {/* A column, so the library takes the height left between the
          heading and the footer as a flex item rather than through a
          percentage height, and its results scroll inside it. */}
      <Box flex="1" minH="0" display="flex" flexDirection="column">
        <RunLibrary
          idStory={idStory}
          idStoryScene={scene?.idStoryScene ?? null}
          tab={libraryTab}
          onTabChange={setLibraryTab}
          attachmentSort={attachmentSort}
          elementSort={elementSort}
          sceneOnly={sceneOnly}
          onAdd={(item) => void add(item)}
          stackTag={inStack}
          sceneStacks={tags}
          locked={locked}
          onSceneCoverChange={onCoverChange}
          attachmentsVersion={attachmentsVersion}
        />
      </Box>
      <Stack gap="3" flexShrink="0">
        <Separator />
        <HStack justify="space-between" gap="2" minW="0">
          <HStack gap="3" wrap="wrap" flexShrink="0">
            <Switch.Root
              checked={addInvisible}
              onCheckedChange={(details) => preferences.set(RUN_ADD_INVISIBLE, details.checked)}
              size="sm"
            >
              {/* Chakra renders a checkbox input; role="switch" is the
                  ARIA pattern for an on/off toggle and what tests query. */}
              <Switch.HiddenInput role="switch" />
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Label>Add as invisible</Switch.Label>
            </Switch.Root>
            <Switch.Root
              checked={addShowInfo}
              onCheckedChange={(details) => preferences.set(RUN_ADD_SHOW_INFO, details.checked)}
              size="sm"
            >
              <Switch.HiddenInput role="switch" />
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Label>Add showing info</Switch.Label>
            </Switch.Root>
          </HStack>
          {scene !== null && !locked && (
            <HStack gap="0" minW="0">
              <RunStackSelect
                idStory={idStory}
                idStoryScene={scene.idStoryScene}
                tags={tags}
                value={inStack}
                onChange={setChosenStack}
                onTagsChange={onTagsChange}
              />
              <IconButtonWithTooltip label="Manage stacks" onClick={() => setManagingStacks(true)}>
                <Settings />
              </IconButtonWithTooltip>
              <RunManageStacksDialog
                idStory={idStory}
                idStoryScene={scene.idStoryScene}
                tags={tags}
                open={managingStacks}
                onClose={() => setManagingStacks(false)}
                onSaved={saveStacks}
              />
            </HStack>
          )}
        </HStack>
      </Stack>
    </Box>
  );
}
