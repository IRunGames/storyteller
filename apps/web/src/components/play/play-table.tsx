"use client";

import { useEffect, useRef } from "react";
import { Box, Flex, Heading, HStack } from "@chakra-ui/react";
import { MessageSquare, UserRound } from "lucide-react";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { toaster } from "@/components/ui/toaster";
import { PlayCharacterSpace } from "./play-character-space";
import { PlayChat } from "./play-chat";
import { PlayHeader } from "./play-header";
import { PlayPanelToggle } from "./play-panel-toggle";

// The preference keys for the two panels, closed until the user opens them,
// so a first visit gives the play space the whole window.
const SHOW_CHAT = "play.showChat";
const SHOW_CHARACTER = "play.showCharacter";

const CHAT_ID = "play-panel-chat";
const CHARACTER_ID = "play-panel-character";

// The table: where a story is played. It draws its own chrome instead of the
// menu bar (PlayHeader), so its page sits under (app)/play/[id] rather than
// (app)/(nav).
//
// Three parts. On the left, the play space on top, which is always there,
// and the character space below it; on the right, the chat. The toggles in
// the middle of the header open and close the other two. Whether each is
// open is a user preference rather than state of this page, so it holds
// across stories and visits, and across devices.
type Props = {
  /** The story being played, shown in the header. */
  title: string;
  /** The heading of the session being played, or null when there is none. */
  session: string | null;
};

export function PlayTable({ title, session }: Props) {
  const preferences = useUserPreferences();

  // Only the storyteller reaches the table with no session being played
  // (a player is sent to the waiting room), and nothing here can be played
  // until one is, so they are told as the table opens. The ref keeps React's
  // development double mount from raising it twice.
  const toldNoSession = useRef(false);
  useEffect(() => {
    if (session !== null || toldNoSession.current) return;
    toldNoSession.current = true;
    toaster.create({ title: "There is no active session.", type: "error" });
  }, [session]);
  const showChat = preferences.get<boolean>(SHOW_CHAT, false);
  const showCharacter = preferences.get<boolean>(SHOW_CHARACTER, false);

  const toggles = (
    <HStack gap="1">
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
      <PlayHeader title={title} session={session} center={toggles} />

      {/* minH 0 all the way down, so a long chat scrolls inside its panel
          instead of stretching the page past the window. */}
      <Flex flex="1" minH="0">
        <Flex direction="column" flex="1" minW="0">
          <Box as="section" aria-labelledby="play-space-heading" flex="1" minH="0" p="4">
            <Heading id="play-space-heading" size="sm">
              Play space
            </Heading>
          </Box>

          {showCharacter && (
            <Box
              flexBasis="40%"
              flexShrink="0"
              minH="0"
              overflowY="auto"
              borderTopWidth="1px"
            >
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
