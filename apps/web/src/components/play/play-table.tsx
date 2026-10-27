"use client";

import { useCallback, useState } from "react";
import { Box, Flex, HStack } from "@chakra-ui/react";
import { Activity, MessageSquare, UserRound } from "lucide-react";
import { useUser } from "@/components/auth/user-provider";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { canSeeDiagnostics } from "@/lib/diagnostics";
import type { PlayScene } from "@/lib/play-scene";
import type { StorySession } from "@/lib/stories";
import { StoryPlayingBox } from "@/components/stories/story-playing-box";
import { PlayCharacterSpace } from "./play-character-space";
import { PlayChat } from "./play-chat";
import { useChatLayout } from "./play-chat-layout";
import { PlayChatOverlay } from "./play-chat-overlay";
import { useStoryChat } from "./use-story-chat";
import { PlayDiagnostics } from "./play-diagnostics";
import { PlayHeader } from "./play-header";
import { PlayPanelToggle } from "./play-panel-toggle";
import { PlaySpace } from "./play-space";
import { usePlayScene, type ScenePulseEvent } from "./use-play-scene";

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
// topic (usePlayScene). The storyteller's pulses come the same way: the
// element whose picture they last put up (preview.open) is held here, as
// nothing but this page remembers it, and the play space shows it full
// size until preview.close or the player closes it. The chat's lines come
// over the same connection (useStoryChat) and are held here, so they keep
// coming while the chat is closed and the Chat toggle counts them. A
// storyteller or administrator gets a fourth part, the diagnostics panel,
// which takes the chat's place while it is open and shows what comes over
// that connection.
type Props = {
  idStory: number;
  /** The story being played, shown in the header. */
  title: string;
  /** The heading of the session being played, or null when there is none. */
  session: string | null;
  /** The scene as the page loaded it; the table keeps it up to date from there. */
  initialScene: PlayScene;
  /** The story's cover, for the play space when the scene has none; see PlaySpace. */
  storyCoverUrl: string | null;
  /** The first page of the story's sessions, for the story's box on no scene. */
  sessions: StorySession[];
};

export function PlayTable({
  idStory,
  title,
  session,
  initialScene,
  storyCoverUrl,
  sessions,
}: Props) {
  const user = useUser();
  const preferences = useUserPreferences();
  const [previewIdElement, setPreviewIdElement] = useState<number | null>(null);
  // An action this build does not know is left alone, so an older table
  // keeps working when a newer storyteller's page sends something new.
  const onPulse = useCallback((event: ScenePulseEvent) => {
    if (event.custom.action === "preview.open") setPreviewIdElement(event.idElement);
    else if (event.custom.action === "preview.close") setPreviewIdElement(null);
  }, []);
  const showChat = preferences.get<boolean>(SHOW_CHAT, false);
  const showCharacter = preferences.get<boolean>(SHOW_CHARACTER, false);
  const diagnosticsOffered = canSeeDiagnostics(user.idUserType);
  const showDiagnostics = diagnosticsOffered && preferences.get<boolean>(SHOW_DIAGNOSTICS, false);
  // The chat is held here rather than in its panel, so it keeps listening
  // while the panel is closed and the Chat toggle can count what came in.
  // Diagnostics stands in for the chat, so the chat is showing only while
  // diagnostics is not.
  const chat = useStoryChat(idStory, showChat && !showDiagnostics);
  const [chatLayout] = useChatLayout();
  const { scene, channel, setSceneText, setElementNotes, setElementStatus } = usePlayScene(
    idStory,
    initialScene,
    onPulse,
    { onChat: chat.receive, onConnect: () => void chat.refresh() },
  );

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
        count={chat.unread}
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
  ) : showChat && chatLayout !== "overlay" ? (
    <PlayChat id={CHAT_ID} idStory={idStory} chat={chat} />
  ) : null;
  // The overlay layout has no panel: a box in the lower right, over the table.
  const chatOverlay = showChat && !showDiagnostics && chatLayout === "overlay" && (
    <PlayChatOverlay id={CHAT_ID} idStory={idStory} chat={chat} />
  );

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
            fallbackCoverUrl={storyCoverUrl}
            // The storyteller's box from the run table, without the pencils
            // and bins: only the story's owner manages its sessions, and the
            // owner is sent to /run rather than here.
            noSceneBox={
              <StoryPlayingBox
                idStory={idStory}
                title={title}
                sessions={sessions}
                canManage={false}
              />
            }
            status={channel.status}
            onTextChange={setSceneText}
            onNotesChange={setElementNotes}
            onStatusChange={setElementStatus}
            previewIdElement={previewIdElement}
            onPreviewClose={() => setPreviewIdElement(null)}
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
      {chatOverlay}
    </Flex>
  );
}
