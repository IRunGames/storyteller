"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Flex, Heading, HStack, Image, List, Stack, Text } from "@chakra-ui/react";
import { BookOpen, MessageSquare, UserRound, X } from "lucide-react";
import type { PlayItem, RunPlaySpace, RunScene } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { toaster } from "@/components/ui/toaster";
import { PlayCharacterSpace } from "@/components/play/play-character-space";
import { PlayChat } from "@/components/play/play-chat";
import { PlayHeader } from "@/components/play/play-header";
import { PlayPanelToggle } from "@/components/play/play-panel-toggle";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { RunLibrary } from "./run-library";
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
// brought into it (sa_getRunPlaySpace), and the library's arrows add to it.
// The scene selector in the header moves the table to another scene, which
// replaces the play space with that scene's. What is added is kept in this
// page's state for now, so it is the storyteller's alone and a reload goes
// back to the scene; showing it to the players is for when the table has
// somewhere shared to keep it.
export function RunTable({ idStory, title, session, initialSpace, sceneStatusOptions }: Props) {
  const preferences = useUserPreferences();
  const [scene, setScene] = useState<RunScene | null>(initialSpace.scene);
  const [inPlay, setInPlay] = useState<PlayItem[]>(initialSpace.inPlay);

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

  // An item already in play stays where it is rather than going in twice.
  const add = (item: PlayItem) =>
    setInPlay((current) =>
      current.some((existing) => existing.key === item.key) ? current : [...current, item],
    );
  const remove = (key: string) =>
    setInPlay((current) => current.filter((existing) => existing.key !== key));

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
            onLoaded={(space) => {
              setScene(space.scene);
              setInPlay(space.inPlay);
            }}
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
            <Heading id="run-library-heading" size="sm">
              Library
            </Heading>
            <Box flex="1" minH="0">
              <RunLibrary
                idStory={idStory}
                idStoryScene={scene?.idStoryScene ?? null}
                onAdd={add}
              />
            </Box>
          </Box>
        )}

        <Flex direction="column" flex="1" minW="0">
          <Stack
            as="section"
            aria-labelledby="play-space-heading"
            flex="1"
            minH="0"
            overflowY="auto"
            gap="3"
            p="4"
          >
            {/* With a scene loaded, the scene is what the space is about and
                its heading would only repeat the obvious; it stays for a
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
            {inPlay.length === 0 ? (
              <Text color="fg.muted">Nothing in play yet.</Text>
            ) : (
              <List.Root listStyleType="none" gap="2" maxW="md">
                {inPlay.map((item) => (
                  <List.Item key={item.key}>
                    <HStack gap="3" p="2" borderWidth="1px" rounded="md" bg="bg.panel">
                      {item.imageUrl && (
                        <Image
                          src={item.imageUrl}
                          alt=""
                          boxSize="12"
                          rounded="sm"
                          objectFit="cover"
                        />
                      )}
                      <Stack gap="0" flex="1" minW="0">
                        <Text fontWeight="medium" truncate>
                          {item.label}
                        </Text>
                        {item.detail && (
                          <Text fontSize="sm" color="fg.muted" truncate>
                            {item.detail}
                          </Text>
                        )}
                      </Stack>
                      <PrepIconButton
                        label={`Remove ${item.label} from the play space`}
                        onClick={() => remove(item.key)}
                      >
                        <X />
                      </PrepIconButton>
                    </HStack>
                  </List.Item>
                ))}
              </List.Root>
            )}
          </Stack>

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
