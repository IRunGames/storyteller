"use client";

import { useEffect, useRef, useState } from "react";
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
import { BookOpen, MessageSquare, Settings, UserRound } from "lucide-react";
import {
  elementIdOf,
  playStacks,
  RUN_ADD_INVISIBLE,
  RUN_LIBRARY_SCENE_ONLY,
  DEFAULT_ELEMENT_SHOWING,
  withShowing,
  type ElementDetail,
  type PlayItem,
  type RunPlaySpace,
  type RunScene,
  type RunSession,
} from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { SCENE_LOCKED_STATUS } from "@/lib/scenes";
import type { StackRename } from "@/lib/stack-schemas";
import { cssUrlValue, sessionHeading } from "@/lib/stories";
import { sa_linkSceneElement } from "@/app/(app)/run/[id]/actions";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { toaster } from "@/components/ui/toaster";
import { PlayCharacterSpace } from "@/components/play/play-character-space";
import { PlayChat } from "@/components/play/play-chat";
import { PlayHeader } from "@/components/play/play-header";
import { PlayPanelToggle } from "@/components/play/play-panel-toggle";
import { RunLibrary } from "./run-library";
import { RunPlayStack } from "./run-play-stack";
import { RunSceneSelect } from "./run-scene-select";
import { RunSessionTitle } from "./run-session-title";
import { RunStackSelect } from "./run-stack-select";
import { RunManageStacksDialog } from "./run-manage-stacks-dialog";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { StatusPill } from "@/components/status/status-pill";

// The storyteller's own preference keys, apart from a player's play.* ones:
// the two tables are laid out for different jobs, and the storyteller who
// also plays in someone else's story keeps each the way they left it. The
// library starts open, since it is what this table is for.
const SHOW_LIBRARY = "run.showLibrary";
const SHOW_CHAT = "run.showChat";
const SHOW_CHARACTER = "run.showCharacter";

const LIBRARY_ID = "run-panel-library";
const CHAT_ID = "run-panel-chat";
const CHARACTER_ID = "run-panel-character";

type Props = {
  idStory: number;
  /** The story being run, shown in the header. */
  title: string;
  /** The session being played, or null when there is none. */
  session: RunSession | null;
  /** The scene the table opens on, and what the play space holds for it. */
  initialSpace: RunPlaySpace;
  /** The story_scenes workflow, for the scene selector's statuses. */
  sceneStatusOptions: StatusOption[];
};

// The storyteller's table, /run/[id]: the player's table (PlayTable) with the
// story's library down the left. It began as a copy of PlayTable rather than
// a mode of it, so that what only the storyteller may see lives in a page and
// a component a player never loads; the page proves the caller owns the
// story before drawing any of it.
//
// The play space opens with the scene the session is on and the elements
// brought into it (sa_getRunPlaySpace), in one stack per scene tag with the
// scene's cover behind them. A stack's + makes a new element filed under
// its tag, and the library's arrow links an element to the scene under the
// first stack's tag; both are saved, tag and all, so a reload puts each
// back in its stack. An element added with no scene at the table is kept
// in this page's state only, so it is the storyteller's alone; showing it
// to the players is for when the table has somewhere shared to keep it.
// The scene selector in the header moves the table to another scene, which
// replaces the play space with that scene's.
export function RunTable({ idStory, title, session, initialSpace, sceneStatusOptions }: Props) {
  const preferences = useUserPreferences();
  const [scene, setScene] = useState<RunScene | null>(initialSpace.scene);
  const [tags, setTags] = useState<string[]>(initialSpace.tags);
  const [coverUrl, setCoverUrl] = useState<string | null>(initialSpace.coverUrl);
  const [inPlay, setInPlay] = useState<PlayItem[]>(initialSpace.inPlay);
  // The library's In select: the stack what the library adds goes in. Held
  // as a name and checked against the scene's stacks on every render, so a
  // new scene, or the chosen stack taken off this one, falls back to the
  // first stack without anything having to reset it.
  const [chosenStack, setChosenStack] = useState<string | null>(null);
  const inStack =
    chosenStack !== null && tags.includes(chosenStack) ? chosenStack : (tags[0] ?? null);
  const [managingStacks, setManagingStacks] = useState(false);
  // A complete scene is the record of what was played: nothing goes into it
  // or comes out of it (the actions refuse too), and the play space says so.
  const isComplete = scene?.status === SCENE_LOCKED_STATUS;

  const loadSpace = (space: RunPlaySpace) => {
    setScene(space.scene);
    setTags(space.tags);
    setCoverUrl(space.coverUrl);
    setInPlay(space.inPlay);
  };

  // Nothing can be played until a session is, so the storyteller is told as
  // the table opens. The ref keeps React's development double mount from
  // raising it twice.
  const toldNoSession = useRef(false);
  useEffect(() => {
    if (session !== null || toldNoSession.current) return;
    toldNoSession.current = true;
    toaster.create({ title: "There is no active session.", type: "error" });
  }, [session]);

  const showLibrary = preferences.get<boolean>(SHOW_LIBRARY, true);
  const showChat = preferences.get<boolean>(SHOW_CHAT, false);
  const showCharacter = preferences.get<boolean>(SHOW_CHARACTER, false);
  // The library's Add as invisible switch; a stack's + reads it too, for
  // where its new element starts.
  const addInvisible = preferences.get<boolean>(RUN_ADD_INVISIBLE, false);
  // The library's All / Scene only switch, kept as a preference like the
  // one above. Only on while there is a scene to narrow to.
  const sceneOnly = preferences.get<boolean>(RUN_LIBRARY_SCENE_ONLY, false) && scene !== null;

  // An item already in play stays where it is rather than going in twice.
  const put = (item: PlayItem) =>
    setInPlay((current) =>
      current.some((existing) => existing.key === item.key) ? current : [...current, item],
    );

  // The library's arrow. An element is linked to the scene first, under the
  // In select's stack, and goes in as the link came back, with whatever tags
  // it already had there.
  async function add(item: PlayItem) {
    if (isComplete || inPlay.some((existing) => existing.key === item.key)) return;
    if (scene === null) {
      put(item);
      return;
    }
    const idElement = elementIdOf(item);
    try {
      const result = await sa_linkSceneElement(
        idStory,
        scene.idStoryScene,
        idElement,
        addInvisible,
        inStack,
      );
      if (result.ok) put(result.item);
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The element could not be added. Try again.", type: "error" });
    }
  }
  const remove = (key: string) =>
    setInPlay((current) => current.filter((existing) => existing.key !== key));
  // An element taken out of the scene from the library's panel. Matched by
  // its id, as replace does, not by the library's key: that carries the kind
  // the library lists it under, which is not the pill's if the kind was
  // changed after the pill went into play.
  const removeElement = (idElement: number) =>
    setInPlay((current) =>
      current.filter(
        (existing) => existing.kind === "ATTACHMENT" || elementIdOf(existing) !== idElement,
      ),
    );
  // An item edited or moved from its info popover, in place. Matched by its
  // element id rather than its key, which carries the kind: an edit that
  // changes the kind comes back under a new key.
  const replace = (item: PlayItem) =>
    setInPlay((current) =>
      current.map((existing) =>
        existing.kind !== "ATTACHMENT" && elementIdOf(existing) === elementIdOf(item)
          ? item
          : existing,
      ),
    );
  // An element's picture changed from the library's info popover: its pill,
  // if it is in play, shows the new one.
  const setImage = (idElement: number, imageUrl: string | null) =>
    setInPlay((current) =>
      current.map((existing) =>
        existing.kind !== "ATTACHMENT" && elementIdOf(existing) === idElement
          ? { ...existing, imageUrl }
          : existing,
      ),
    );
  // An element edited from the library's info popover: its pill, if it is
  // in play, takes the new fields, keeps the field it was showing, and moves
  // under its new kind's key if the kind changed.
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
        // Something the page alone holds has no fields to choose among.
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
  // Manage stacks saved: the scene's stacks as they now are. A renamed stack
  // takes its pills with it, as the action took their links, and the In
  // select follows a stack it had chosen; one taken away leaves its pills
  // filed under the old name, so they fall into the first stack.
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

  const toggles = (
    <HStack gap="1">
      <PlayPanelToggle
        label="Library"
        controls={LIBRARY_ID}
        isOpen={showLibrary}
        onToggle={() => preferences.set(SHOW_LIBRARY, !showLibrary)}
      >
        <BookOpen />
      </PlayPanelToggle>
      <PlayPanelToggle
        label="Character"
        controls={CHARACTER_ID}
        isOpen={showCharacter}
        onToggle={() => preferences.set(SHOW_CHARACTER, !showCharacter)}
      >
        <UserRound />
      </PlayPanelToggle>
      <PlayPanelToggle
        label="Chat"
        controls={CHAT_ID}
        isOpen={showChat}
        onToggle={() => preferences.set(SHOW_CHAT, !showChat)}
      >
        <MessageSquare />
      </PlayPanelToggle>
    </HStack>
  );

  return (
    <Flex direction="column" h="100vh">
      <PlayHeader
        title={title}
        session={session ? sessionHeading(session) : null}
        sessionContent={session && <RunSessionTitle idStory={idStory} session={session} />}
        center={toggles}
        afterSession={
          <HStack gap="1" minW="0">
            <RunSceneSelect
              idStory={idStory}
              scene={scene}
              hasSession={session !== null}
              statusOptions={sceneStatusOptions}
              onLoaded={loadSpace}
            />
            {/* The scene's status beside it. Keyed by the scene, so moving
                to another starts from that scene's status. It stays a menu on
                a complete scene, as the workflow allows: moving it back lifts
                the overlay and the locks, which all follow the status.
                Completing a scene and resuming one each ask first. */}
            {scene && (
              <StatusPill
                key={scene.idStoryScene}
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
                      body: "A complete scene is locked: nothing can be added to it or taken out of it. To carry on the story, start a new scene.",
                      confirmLabel: "Complete scene",
                    };
                  }
                  // Leaving complete undoes a scene the storyteller finished,
                  // so it asks too.
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
                onChanged={(status) =>
                  setScene((current) => (current ? { ...current, status } : current))
                }
              />
            )}
          </HStack>
        }
      />

      {/* minH 0 all the way down, so each panel scrolls inside itself
          instead of stretching the page past the window. */}
      <Flex flex="1" minH="0">
        {showLibrary && (
          <Box
            as="section"
            id={LIBRARY_ID}
            aria-labelledby="run-library-heading"
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
            {/* All / Scene only beside the heading: what the library lists.
                With no scene at the table there is only All. */}
            <HStack justify="space-between" gap="2">
              <Heading id="run-library-heading" size="sm">
                Library
              </Heading>
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
                sceneOnly={sceneOnly}
                onAdd={(item) => void add(item)}
                onRemovedFromScene={removeElement}
                onCreated={put}
                onImageChange={setImage}
                onElementEdited={editElement}
                onItemChange={replace}
                onSceneStatusChange={setStatus}
                stackTag={inStack}
                locked={isComplete}
                onSceneCoverChange={setCoverUrl}
              />
            </Box>
            {/* Below the list and outside its scroll, under a rule: the
                switch is about how anything goes into the scene, not about
                what the list shows, so it stays in reach however far the
                list has scrolled. */}
            <Stack gap="3" flexShrink="0">
              <Separator />
              {/* How and where the library adds: hidden or not on the left,
                  and on the right which stack, with the gear beside it for
                  the stacks themselves. The stack controls need a scene. */}
              <HStack justify="space-between" gap="2" minW="0">
                <Switch.Root
                  checked={addInvisible}
                  onCheckedChange={(details) => preferences.set(RUN_ADD_INVISIBLE, details.checked)}
                  size="sm"
                  flexShrink="0"
                >
                  {/* Chakra renders a checkbox input; role="switch" is the
                      ARIA pattern for an on/off toggle and what tests query. */}
                  <Switch.HiddenInput role="switch" />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Label>Add as invisible</Switch.Label>
                </Switch.Root>
                {scene !== null && !isComplete && (
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
        )}

        <Flex direction="column" flex="1" minW="0">
          {/* The cover sits behind the scrolling part, so it stays put while
              the stacks scroll over it. */}
          <Box
            as="section"
            aria-labelledby="play-space-heading"
            position="relative"
            flex="1"
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
              {/* With a scene loaded, the scene is what the space is about and
                  its heading would only repeat the selector; it stays for a
                  screen reader, which names the region by it. */}
              {scene === null ? (
                <Heading id="play-space-heading" size="sm">
                  Play space
                </Heading>
              ) : (
                <Heading id="play-space-heading" srOnly>
                  Play space
                </Heading>
              )}
              {/* space-between: the first stack against the left edge and
                  the rest spread across the width. */}
              <Flex gap="3" wrap="wrap" align="flex-start" justify="space-between">
                {playStacks(tags, inPlay).map((stack) => (
                  <RunPlayStack
                    key={stack.title}
                    idStory={idStory}
                    stack={stack}
                    sceneTags={tags}
                    idStoryScene={scene?.idStoryScene ?? null}
                    onCreated={put}
                    onRemove={remove}
                    onStatusChange={setStatus}
                    onItemChange={replace}
                  />
                ))}
              </Flex>
            </Stack>
            {/* Over the stacks and taking their pointer, so nothing in a
                complete scene can be pressed. */}
            {isComplete && (
              <Flex
                position="absolute"
                inset="0"
                align="center"
                justify="center"
                bg="gray.500/35"
                data-testid="scene-complete-overlay"
              >
                <Text fontSize="5xl" fontWeight="bold" letterSpacing="widest" color="white">
                  COMPLETE
                </Text>
              </Flex>
            )}
          </Box>

          {showCharacter && (
            <Box flexBasis="40%" flexShrink="0" minH="0" overflowY="auto" borderTopWidth="1px">
              <PlayCharacterSpace id={CHARACTER_ID} />
            </Box>
          )}
        </Flex>

        {showChat && (
          <Box
            w={{ base: "72", md: "sm" }}
            flexShrink="0"
            minH="0"
            borderLeftWidth="1px"
            bg="bg.subtle"
          >
            <PlayChat id={CHAT_ID} />
          </Box>
        )}
      </Flex>
    </Flex>
  );
}
