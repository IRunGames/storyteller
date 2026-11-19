"use client";

import type { ReactNode } from "react";
import { Box } from "@chakra-ui/react";
import { Activity, MessageSquare, UserRound } from "lucide-react";
import { useUser } from "@/components/auth/user-provider";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { canSeeDiagnostics } from "@/lib/diagnostics";
import { tablePanelPreferenceKeys } from "@/lib/preference-keys";
import { PlayCharacterSpace } from "@/components/play/play-character-space";
import { PlayChat } from "@/components/play/play-chat";
import { useChatLayout } from "@/components/play/play-chat-layout";
import { PlayChatOverlay } from "@/components/play/play-chat-overlay";
import { PlayDiagnostics } from "@/components/play/play-diagnostics";
import { PlayPanelToggle } from "@/components/play/play-panel-toggle";
import type { ChannelState } from "@/components/play/use-story-channel";
import { useStoryChat } from "@/components/play/use-story-chat";

/**
 * The chat and the panels round the play space that the storyteller's run
 * table and the players' table both have: the character space under the
 * play space, the chat or the diagnostics on the right, and the toggles in
 * the header that open and close them. Whether each is open is a user
 * preference rather than state of the page, so it holds across stories and
 * visits, and across devices. The two tables keep separate preferences
 * (`run.*` and `play.*`, tablePanelPreferenceKeys) and separate panel ids,
 * since they are laid out
 * for different jobs and a storyteller who also plays in someone else's
 * story keeps each the way they left it; `prefix` says which table this is.
 *
 * The chat is held here rather than in its panel, so it keeps listening
 * while the panel is closed and the Chat toggle can count what came in.
 * Diagnostics, offered to a storyteller or administrator, stands in for the
 * chat rather than beside it: the chat's preference is left as it is, so
 * closing diagnostics brings it back. The chat's overlay layout has no
 * panel: a box in the lower right, over the table.
 */
export function useTableChat(idStory: number, prefix: "run" | "play") {
  const user = useUser();
  const preferences = useUserPreferences();
  const diagnosticsOffered = canSeeDiagnostics(user.idUserType);
  const keys = tablePanelPreferenceKeys(prefix);
  const ids = {
    chat: `${prefix}-panel-chat`,
    character: `${prefix}-panel-character`,
    diagnostics: `${prefix}-panel-diagnostics`,
  };
  const showChat = preferences.get<boolean>(keys.chat, false);
  const showCharacter = preferences.get<boolean>(keys.character, false);
  const showDiagnostics = diagnosticsOffered && preferences.get<boolean>(keys.diagnostics, false);
  const chat = useStoryChat(idStory, showChat && !showDiagnostics);
  const [chatLayout] = useChatLayout();

  // Each toggle on its own, so a table lays them out in its own order among
  // its own; PlayHeader puts them in the header, and in the drawer on a phone.
  const toggles = {
    character: (
      <PlayPanelToggle
        label="Character"
        controls={ids.character}
        isOpen={showCharacter}
        onToggle={() => preferences.set(keys.character, !showCharacter)}
      >
        <UserRound />
      </PlayPanelToggle>
    ),
    chat: (
      <PlayPanelToggle
        label="Chat"
        controls={ids.chat}
        isOpen={showChat}
        count={chat.unread}
        onToggle={() => preferences.set(keys.chat, !showChat)}
      >
        <MessageSquare />
      </PlayPanelToggle>
    ),
    diagnostics: diagnosticsOffered && (
      <PlayPanelToggle
        label="Diagnostics"
        controls={ids.diagnostics}
        isOpen={showDiagnostics}
        onToggle={() => preferences.set(keys.diagnostics, !showDiagnostics)}
      >
        <Activity />
      </PlayPanelToggle>
    ),
  };

  /** The right panel's content for the table's connection, or null for no panel. */
  const rightPanel = (channel: ChannelState): ReactNode =>
    showDiagnostics ? (
      <PlayDiagnostics id={ids.diagnostics} channel={channel} />
    ) : showChat && chatLayout !== "overlay" ? (
      <PlayChat id={ids.chat} idStory={idStory} chat={chat} />
    ) : null;

  const chatOverlay = showChat && !showDiagnostics && chatLayout === "overlay" && (
    <PlayChatOverlay id={ids.chat} idStory={idStory} chat={chat} />
  );

  const characterPanel = showCharacter && (
    <Box flexBasis="40%" flexShrink="0" minH="0" overflowY="auto" borderTopWidth="1px">
      <PlayCharacterSpace id={ids.character} />
    </Box>
  );

  return { chat, toggles, rightPanel, chatOverlay, characterPanel };
}
