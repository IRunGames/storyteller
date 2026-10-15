"use client";

import { Box, Flex, HStack } from "@chakra-ui/react";
import { Activity, MessageSquare, UserRound } from "lucide-react";
import { useUser } from "@/components/auth/user-provider";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { canSeeDiagnostics } from "@/lib/diagnostics";
import type { PlayScene } from "@/lib/play-scene";
import { PlayCharacterSpace } from "./play-character-space";
import { PlayChat } from "./play-chat";
import { PlayDiagnostics } from "./play-diagnostics";
import { PlayHeader } from "./play-header";
import { PlayPanelToggle } from "./play-panel-toggle";
import { PlaySpace } from "./play-space";
import { usePlayScene } from "./use-play-scene";

// The preference keys for the panels, closed until the user opens them,
// so a first visit gives the play space the whole window.
const SHOW_CHAT = "play.showChat";
const SHOW_CHARACTER = "play.showCharacter";
const SHOW_DIAGNOSTICS = "play.showDiagnostics";

const CHAT_ID = "play-panel-chat";
const CHARACTER_ID = "play-panel-character";
const DIAGNOSTICS_ID = "play-panel-diagnostics";

// The players' table: where a story is played. It draws its own chrome
// instead of the menu bar (PlayHeader), so its page sits under
// (app)/play/[id] rather than (app)/(nav). The storyteller has their own,
// RunTable at /run/[id].
//
// Three parts. On the left, the play space on top, which is always there,
// and the character space below it; on the right, the chat. The toggles in
// the middle of the header open and close the other two. Whether each is
// open is a user preference rather than state of this page, so it holds
// across stories and visits, and across devices.
//
// The play space follows the storyteller's table over the story's MQTT
// topic (usePlayScene). A storyteller or administrator gets a fourth part,
// the diagnostics panel, which takes the chat's place while it is open and
// shows what comes over that topic.
type Props = {
  idStory: number;
  /** The story being played, shown in the header. */
  title: string;
  /** The heading of the session being played, or null when there is none. */
  session: string | null;
  /** The scene as the page loaded it; the table keeps it up to date from there. */
  initialScene: PlayScene;
};

export function PlayTable({ idStory, title, session, initialScene }: Props) {
  const user = useUser();
  const preferences = useUserPreferences();
  const { scene, channel, setSceneText } = usePlayScene(idStory, initialScene);

  const showChat = preferences.get<boolean>(SHOW_CHAT, false);
  const showCharacter = preferences.get<boolean>(SHOW_CHARACTER, false);
  const diagnosticsOffered = canSeeDiagnostics(user.idUserType);
  const showDiagnostics = diagnosticsOffered && preferences.get<boolean>(SHOW_DIAGNOSTICS, false);

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
      {diagnosticsOffered && (
        <PlayPanelToggle
          label="Diagnostics"
          controls={DIAGNOSTICS_ID}
          isOpen={showDiagnostics}
          onToggle={() => preferences.set(SHOW_DIAGNOSTICS, !showDiagnostics)}
        >
          <Activity />
        </PlayPanelToggle>
      )}
    </HStack>
  );

  // Diagnostics stands in for the chat rather than beside it: the chat's
  // preference is left as it is, so closing diagnostics brings it back.
  const rightPanel = showDiagnostics ? (
    <PlayDiagnostics id={DIAGNOSTICS_ID} channel={channel} />
  ) : showChat ? (
    <PlayChat id={CHAT_ID} />
  ) : null;

  return (
    <Flex direction="column" h="100vh">
      <PlayHeader title={title} session={session} center={toggles} />

      {/* minH 0 all the way down, so a long chat scrolls inside its panel
          instead of stretching the page past the window. */}
      <Flex flex="1" minH="0">
        <Flex direction="column" flex="1" minW="0">
          <PlaySpace
            idStory={idStory}
            scene={scene}
            status={channel.status}
            onTextChange={setSceneText}
          />

          {showCharacter && (
            <Box flexBasis="40%" flexShrink="0" minH="0" overflowY="auto" borderTopWidth="1px">
              <PlayCharacterSpace id={CHARACTER_ID} />
            </Box>
          )}
        </Flex>

        {rightPanel && (
          <Box
            w={{ base: "72", md: "sm" }}
            flexShrink="0"
            minH="0"
            borderLeftWidth="1px"
            bg="bg.subtle"
          >
            {rightPanel}
          </Box>
        )}
      </Flex>
    </Flex>
  );
}
