"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Flex,
  Heading,
  HStack,
  SegmentGroup,
  Separator,
  Stack,
  Switch,
  Text,
} from "@chakra-ui/react";
import { Settings } from "lucide-react";
import {
  DEFAULT_ATTACHMENT_SORT,
  DEFAULT_ELEMENT_SORT,
  elementIdOf,
  isAttachmentSort,
  isElementSort,
  playStacks,
  RUN_ADD_INVISIBLE,
  RUN_ADD_SHOW_INFO,
  RUN_LIBRARY_ATTACHMENT_SORT,
  RUN_LIBRARY_ELEMENT_SORT,
  RUN_LIBRARY_SCENE_ONLY,
  DEFAULT_ELEMENT_SHOWING,
  withShowing,
  type ElementDetail,
  type PlayItem,
  type RunLibrarySource,
  type RunScene,
} from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { EMPTY_SCENE_TEXT, SCENE_LOCKED_STATUS, type SceneSessionOption } from "@/lib/scenes";
import type { StackRename } from "@/lib/stack-schemas";
import { cssUrlValue } from "@/lib/stories";
import { sa_linkSceneElement } from "@/app/(app)/run/[id]/actions";
import { sa_setLiveSceneText } from "@/app/(app)/scenes/[id]/live/actions";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { toaster } from "@/components/ui/toaster";
import { PlayHeader } from "@/components/play/play-header";
import { SceneTextPopover } from "@/components/play/scene-text-popover";
import { RunLibrary } from "@/components/run/run-library";
import { RunLibrarySortMenu } from "@/components/run/run-library-sort-menu";
import { RunPlayStack } from "@/components/run/run-play-stack";
import { RunStackSelect } from "@/components/run/run-stack-select";
import { RunManageStacksDialog } from "@/components/run/run-manage-stacks-dialog";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { StatusPill } from "@/components/status/status-pill";
import { LiveSceneSelect } from "./live-scene-select";
import { LiveSessionSelect } from "./live-session-select";

const LIBRARY_ID = "live-panel-library";

type Props = {
  idStory: number;
  /** The story the scene belongs to, shown in the header. */
  title: string;
  /** The scene being edited, as sa_getScenePlaySpace read it. */
  scene: RunScene;
  /** The scene's stacks, its cover, and the elements brought into it. */
  initialTags: string[];
  initialCoverUrl: string | null;
  initialInPlay: PlayItem[];
  /** The story's sittings, for the header's session select. */
  sessions: SceneSessionOption[];
  /** The sitting the scene was played in, or null for none. */
  idStorySession: number | null;
  /** The story_scenes workflow, for the scene's status chip. */
  sceneStatusOptions: StatusOption[];
};

// A scene's live-edit page, /scenes/[id]/live, behind the pencil on the
// library's scene cards. It began as a copy of the run page's RunTable, so a
// scene is prepared with the very library, stacks and pills it is played
// with, and each change is saved and published as the run page's are.
//
// What makes it a page for one scene rather than a table to play at: it is
// opened on that scene, and the scene's status chip sits beside its title in
// the play space. The header's middle is a scene selector of its own
// (LiveSceneSelect): status pills, a Sessions filter, a box to type a scene's
// name into, and a + beside it. Choosing a scene opens its live-edit page, and
// the + makes one to prepare and opens it, the session left where it was
// either way. The header's session is a select of the story's sittings, for
// the one the scene was played in, rather than the session being played,
// and no session need be running to open it. The panels a table has for
// play (the character sheet, the chat, the diagnostics) and the toggles that
// opened them are gone, and the library is always open. The panel behind the
// scene's title renames the scene too, and says under Notes that the
// players write there as well. There is no reload: nothing moves the scene
// from under this page but the storyteller's own changes here. The pills'
// thumbnails have no tack either: putting a picture up on the players' table
// is done at the run page's table, not while a scene is being edited.
export function LiveTable({
  idStory,
  title,
  scene: initialScene,
  initialTags,
  initialCoverUrl,
  initialInPlay,
  sessions,
  idStorySession,
  sceneStatusOptions,
}: Props) {
  const preferences = useUserPreferences();
  const router = useRouter();
  const openScene = (idStoryScene: number) => router.push(`/scenes/${idStoryScene}/live`);
  const [scene, setScene] = useState<RunScene>(initialScene);
  // The library's tab, held here for the sort menu beside its heading.
  const [libraryTab, setLibraryTab] = useState<RunLibrarySource>("ATTACHMENT");
  const [tags, setTags] = useState<string[]>(initialTags);
  const [coverUrl, setCoverUrl] = useState<string | null>(initialCoverUrl);
  const [inPlay, setInPlay] = useState<PlayItem[]>(initialInPlay);
  // The library's In select, as on the run page.
  const [chosenStack, setChosenStack] = useState<string | null>(null);
  const inStack =
    chosenStack !== null && tags.includes(chosenStack) ? chosenStack : (tags[0] ?? null);
  const [managingStacks, setManagingStacks] = useState(false);
  // A complete scene is the record of what was played: nothing goes into it
  // or comes out of it (the actions refuse too), and the play space says so.
  const isComplete = scene.status === SCENE_LOCKED_STATUS;

  // The library's switches and sorts, the run page's own preferences: the
  // library is the same one, so it is set up the same way on both.
  const addInvisible = preferences.get<boolean>(RUN_ADD_INVISIBLE, false);
  const addShowInfo = preferences.get<boolean>(RUN_ADD_SHOW_INFO, false);
  const sceneOnly = preferences.get<boolean>(RUN_LIBRARY_SCENE_ONLY, false);
  const storedAttachmentSort = preferences.get<string>(RUN_LIBRARY_ATTACHMENT_SORT, "");
  const attachmentSort = isAttachmentSort(storedAttachmentSort)
    ? storedAttachmentSort
    : DEFAULT_ATTACHMENT_SORT;
  const storedElementSort = preferences.get<string>(RUN_LIBRARY_ELEMENT_SORT, "");
  const elementSort = isElementSort(storedElementSort) ? storedElementSort : DEFAULT_ELEMENT_SORT;

  // An item already in play stays where it is rather than going in twice.
  const put = (item: PlayItem) =>
    setInPlay((current) =>
      current.some((existing) => existing.key === item.key) ? current : [...current, item],
    );

  // The library's arrow: the element is linked to the scene under the In
  // select's stack, and goes in as the link came back.
  async function add(item: PlayItem) {
    if (isComplete || inPlay.some((existing) => existing.key === item.key)) return;
    const idElement = elementIdOf(item);
    try {
      const result = await sa_linkSceneElement(idStory, scene.idStoryScene, idElement, {
        hidden: addInvisible,
        tag: inStack,
        showInfo: addShowInfo,
      });
      if (result.ok) put(result.item);
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The element could not be added. Try again.", type: "error" });
    }
  }
  const remove = (key: string) =>
    setInPlay((current) => current.filter((existing) => existing.key !== key));
  // The rest of these are the run page's, for the same reasons; see there.
  const removeElement = (idElement: number) =>
    setInPlay((current) =>
      current.filter(
        (existing) => existing.kind === "ATTACHMENT" || elementIdOf(existing) !== idElement,
      ),
    );
  const replace = (item: PlayItem) =>
    setInPlay((current) =>
      current.map((existing) =>
        existing.kind !== "ATTACHMENT" && elementIdOf(existing) === elementIdOf(item)
          ? item
          : existing,
      ),
    );
  const setImage = (idElement: number, imageUrl: string | null) =>
    setInPlay((current) =>
      current.map((existing) =>
        existing.kind !== "ATTACHMENT" && elementIdOf(existing) === idElement
          ? { ...existing, imageUrl }
          : existing,
      ),
    );
  const editElement = (element: ElementDetail) =>
    setInPlay((current) =>
      current.map((existing) => {
        if (existing.kind === "ATTACHMENT" || elementIdOf(existing) !== element.idElement) {
          return existing;
        }
        const moved: PlayItem = {
          ...existing,
          key: `${element.kind}:${element.idElement}`,
          kind: element.kind as PlayItem["kind"],
          imageUrl: element.imageUrl,
        };
        if (!existing.fields) return { ...moved, label: element.name, detail: element.title };
        return withShowing(
          {
            ...moved,
            fields: {
              initial_name: element.initialName,
              name: element.name,
              title: element.title,
            },
          },
          existing.showing ?? DEFAULT_ELEMENT_SHOWING,
        );
      }),
    );
  const saveStacks = (next: string[], renames: StackRename[]) => {
    const renamed = (tag: string) => renames.find((rename) => rename.from === tag)?.to ?? tag;
    setTags(next);
    if (renames.length > 0) {
      setInPlay((current) =>
        current.map((existing) =>
          existing.sceneTags
            ? { ...existing, sceneTags: existing.sceneTags.map(renamed) }
            : existing,
        ),
      );
      setChosenStack((current) => (current === null ? current : renamed(current)));
    }
  };
  const setStatus = (key: string, status: string) =>
    setInPlay((current) =>
      current.map((existing) =>
        existing.key === key ? { ...existing, sceneStatus: status } : existing,
      ),
    );

  return (
    <Flex direction="column" h="100vh">
      <PlayHeader
        title={title}
        // A string so the header draws its session slot; the select is
        // what shows in it.
        session=""
        sessionContent={
          <LiveSessionSelect
            idStory={idStory}
            idStoryScene={scene.idStoryScene}
            sessions={sessions}
            initial={idStorySession}
            locked={isComplete}
          />
        }
        center={
          <LiveSceneSelect
            idStory={idStory}
            scene={scene}
            sessions={sessions}
            statusOptions={sceneStatusOptions}
            onChoose={openScene}
          />
        }
      />

      {/* minH 0 all the way down, so each panel scrolls inside itself
          instead of stretching the page past the window. */}
      <Flex flex="1" minH="0">
        <Box
          as="section"
          id={LIBRARY_ID}
          aria-labelledby="live-library-heading"
          w={{ base: "72", md: "sm" }}
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
              <Heading id="live-library-heading" size="sm">
                Library
              </Heading>
              <RunLibrarySortMenu
                tab={libraryTab}
                attachmentSort={attachmentSort}
                elementSort={elementSort}
                onAttachmentSortChange={(sort) =>
                  preferences.set(RUN_LIBRARY_ATTACHMENT_SORT, sort)
                }
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
                  { value: "SCENE", label: "Scene only" },
                ]}
              />
            </SegmentGroup.Root>
          </HStack>
          <Box flex="1" minH="0" display="flex" flexDirection="column">
            <RunLibrary
              idStory={idStory}
              idStoryScene={scene.idStoryScene}
              tab={libraryTab}
              onTabChange={setLibraryTab}
              attachmentSort={attachmentSort}
              elementSort={elementSort}
              sceneOnly={sceneOnly}
              onAdd={(item) => void add(item)}
              onRemovedFromScene={removeElement}
              onCreated={put}
              onImageChange={setImage}
              onElementEdited={editElement}
              onItemChange={replace}
              onSceneStatusChange={setStatus}
              stackTag={inStack}
              sceneStacks={tags}
              locked={isComplete}
              onSceneCoverChange={setCoverUrl}
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
              {!isComplete && (
                <HStack gap="0" minW="0">
                  <RunStackSelect
                    idStory={idStory}
                    idStoryScene={scene.idStoryScene}
                    tags={tags}
                    value={inStack}
                    onChange={setChosenStack}
                    onTagsChange={setTags}
                  />
                  <PrepIconButton label="Manage stacks" onClick={() => setManagingStacks(true)}>
                    <Settings />
                  </PrepIconButton>
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

        {/* The cover sits behind the scrolling part, so it stays put while
            the stacks scroll over it. */}
        <Box
          as="section"
          aria-labelledby="play-space-heading"
          position="relative"
          flex="1"
          minW="0"
          minH="0"
        >
          {coverUrl && (
            <>
              <Box
                aria-hidden
                data-testid="play-space-cover"
                position="absolute"
                inset="0"
                bgSize="cover"
                bgPos="center"
                style={{ backgroundImage: `url("${cssUrlValue(coverUrl)}")` }}
              />
              <Box aria-hidden position="absolute" inset="0" bg="blackAlpha.400" />
            </>
          )}
          <Stack position="relative" h="full" overflowY="auto" gap="3" p="4">
            <Heading id="play-space-heading" srOnly>
              Play space
            </Heading>
            {/* The scene's title on the panel colour, part see-through, as
                the run page has it, with its status chip after it and the
                chevron that opens its title, description and notes at the
                end. The chip stays a menu on a complete scene, as the
                workflow allows: moving it back lifts the overlay and the
                locks, which all follow the status. */}
            <HStack
              gap="1"
              alignSelf="flex-start"
              maxW="full"
              rounded="2xl"
              bg="bg.panel/55"
              backdropFilter="blur(6px)"
              ps="3"
              pe="1"
              py="1"
            >
              <Heading as="h2" size="md" minW="0" truncate title={scene.title}>
                {scene.title}
              </Heading>
              {/* A little room either side, so the chip stands apart from
                  the title before it and the chevron after it. */}
              <Box mx="1.5" flexShrink="0">
                <StatusPill
                  table="story_scenes"
                  id={scene.idStoryScene}
                  status={scene.status}
                  options={sceneStatusOptions}
                  canEdit
                  tooltip="Set scene status"
                  confirm={(next) => {
                    if (next === SCENE_LOCKED_STATUS) {
                      return {
                        title: "Complete this scene?",
                        body: "A complete scene is locked: nothing can be added to it or taken out of it.",
                        confirmLabel: "Complete scene",
                      };
                    }
                    if (isComplete) {
                      const label =
                        sceneStatusOptions.find((option) => option.key === next)?.label ?? next;
                      return {
                        title: "Resume this scene?",
                        body: `This scene is complete. Resuming it makes it ${label.toLowerCase()} again, so its elements and stacks can be changed.`,
                        confirmLabel: "Resume scene",
                      };
                    }
                    return null;
                  }}
                  onChanged={(status) => setScene((current) => ({ ...current, status }))}
                />
              </Box>
              <SceneTextPopover
                title={scene.title}
                text={scene.text ?? EMPTY_SCENE_TEXT}
                save={(values) => sa_setLiveSceneText(idStory, scene.idStoryScene, values)}
                onSaved={(text, savedTitle) =>
                  setScene((current) => ({ ...current, text, title: savedTitle ?? current.title }))
                }
                readOnly={isComplete}
                editTitle
                notesHint="The players can edit this box too."
              />
            </HStack>
            {/* space-between: the first stack against the left edge and
                the rest spread across the width. */}
            <Flex gap="3" wrap="wrap" align="flex-start" justify="space-between">
              {playStacks(tags, inPlay).map((stack) => (
                <RunPlayStack
                  key={stack.title}
                  idStory={idStory}
                  stack={stack}
                  sceneTags={tags}
                  idStoryScene={scene.idStoryScene}
                  onCreated={put}
                  onRemove={remove}
                  onStatusChange={setStatus}
                  onItemChange={replace}
                  locked={isComplete}
                />
              ))}
            </Flex>
          </Stack>
          {/* Over the stacks, saying so, but letting the pointer through:
              the pills' panels and the scene's text are still there to
              read, and the status chip to move the scene back. */}
          {isComplete && (
            <Flex
              position="absolute"
              inset="0"
              align="center"
              justify="center"
              bg="blackAlpha.600"
              pointerEvents="none"
              data-testid="scene-complete-overlay"
            >
              <Text fontSize="5xl" fontWeight="bold" letterSpacing="widest" color="white">
                COMPLETE
              </Text>
            </Flex>
          )}
        </Box>
      </Flex>
    </Flex>
  );
}
