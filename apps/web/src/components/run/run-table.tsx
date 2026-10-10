"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Flex, Heading, HStack, Stack, Switch } from "@chakra-ui/react";
import { BookOpen, MessageSquare, UserRound } from "lucide-react";
import {
  elementIdOf,
  playStacks,
  RUN_ADD_INVISIBLE,
  type PlayItem,
  type RunPlaySpace,
  type RunScene,
} from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { cssUrlValue } from "@/lib/stories";
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
  /** The heading of the session being played, or null when there is none. */
  session: string | null;
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

  // An item already in play stays where it is rather than going in twice.
  const put = (item: PlayItem) =>
    setInPlay((current) =>
      current.some((existing) => existing.key === item.key) ? current : [...current, item],
    );

  // The library's arrow. An element is linked to the scene first, and goes
  // in as the link came back, with whatever tags it already had there.
  async function add(item: PlayItem) {
    if (inPlay.some((existing) => existing.key === item.key)) return;
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
      );
      if (result.ok) put(result.item);
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The element could not be added. Try again.", type: "error" });
    }
  }
  const remove = (key: string) =>
    setInPlay((current) => current.filter((existing) => existing.key !== key));
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
        session={session}
        center={toggles}
        afterSession={
          <RunSceneSelect
            idStory={idStory}
            scene={scene}
            hasSession={session !== null}
            statusOptions={sceneStatusOptions}
            onLoaded={loadSpace}
          />
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
            {/* The switch sits at the heading's far end: it decides how what
                the library adds goes into the scene, hidden or not. */}
            <HStack justify="space-between" gap="2">
              <Heading id="run-library-heading" size="sm">
                Library
              </Heading>
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
            </HStack>
            <Box flex="1" minH="0">
              <RunLibrary
                idStory={idStory}
                idStoryScene={scene?.idStoryScene ?? null}
                onAdd={(item) => void add(item)}
                onSceneCoverChange={setCoverUrl}
              />
            </Box>
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
