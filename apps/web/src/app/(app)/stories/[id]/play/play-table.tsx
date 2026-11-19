"use client";

import { useUser } from "@/components/auth/user-provider";
import type { PlayScene } from "@/lib/play-scene";
import type { StorySession } from "@/lib/stories";
import { SessionNotesPopover } from "@/components/sessions/session-notes-popover";
import { StoryPlayingBox } from "@/components/stories/story-playing-box";
import { usePulsedPicture } from "@/components/table-shell/pulsed-picture";
import { TableShell } from "@/components/table-shell/table-shell";
import { useTableChat } from "@/components/table-shell/use-table-chat";
import { DisplayModeButton } from "./display-mode-button";
import { PlayHeader } from "@/components/play/play-header";
import { PlaySpace } from "@/components/play/play-space";
import { usePlayScene } from "@/components/play/use-play-scene";

// The players' table: where a story is played. It draws its own chrome
// instead of the menu bar (PlayHeader), so its page sits under
// (app)/stories/[id]/play rather than (app)/(nav). The storyteller has their
// own, RunTable at /stories/[id]/run; the frame and the panels are the
// shared table's (components/table-shell).
//
// Three parts. On the left, the play space on top, which is always there,
// and the character space below it; on the right, the chat. The toggles in
// the middle of the header open and close the other two (useTableChat).
//
// The play space follows the storyteller's table over the story's MQTT
// topic (usePlayScene). The storyteller's pulses come the same way: the
// link whose picture they last put up (preview.open) is held here, as
// nothing but this page remembers it (usePulsedPicture), and the play space
// shows it full size until preview.close or the player closes it. The
// chat's lines come over the same connection and are held with the panels,
// so they keep coming while the chat is closed and the Chat toggle counts
// them. A storyteller or administrator gets a fourth part, the diagnostics
// panel, which takes the chat's place while it is open and shows what comes
// over that connection.
type Props = {
  idStory: number;
  /** The story being played, shown in the header. */
  title: string;
  /** The heading of the session being played, or null when there is none. */
  session: string | null;
  /** The id behind that heading, for the notes panel beside it; null with no session. */
  idStorySession: number | null;
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
  idStorySession,
  initialScene,
  storyCoverUrl,
  sessions,
}: Props) {
  const user = useUser();
  const picture = usePulsedPicture();
  const panels = useTableChat(idStory, "play");
  const { chat } = panels;
  const { scene, channel, setSceneText, setElementNotes, setElementStatus } = usePlayScene(
    idStory,
    initialScene,
    picture.onPulse,
    { onChat: chat.receive, onConnect: () => void chat.refresh() },
  );

  return (
    <TableShell
      header={
        // The session's notes and lingering questions, written up beside
        // its heading by the players as well as the storyteller. Not for a
        // guest: every write is an account's (requireAccount), as the rest
        // of the table's are.
        <PlayHeader
          title={title}
          session={session}
          afterSession={
            session !== null && idStorySession !== null && !user.isAnonymous ? (
              <SessionNotesPopover idStorySession={idStorySession} heading={session} />
            ) : undefined
          }
          center={
            <>
              {panels.toggles.character}
              {panels.toggles.chat}
              {panels.toggles.diagnostics}
              <DisplayModeButton idStory={idStory} />
            </>
          }
          centerInMenu
        />
      }
      below={panels.characterPanel}
      right={panels.rightPanel(channel)}
      overlay={panels.chatOverlay}
    >
      <PlaySpace
        variant="table"
        idStory={idStory}
        scene={scene}
        fallbackCoverUrl={storyCoverUrl}
        // The storyteller's box from the run table, without the pencils
        // and trashcans: only the story's owner manages its sessions, and the
        // owner is sent to /run rather than here.
        noSceneBox={
          <StoryPlayingBox idStory={idStory} title={title} sessions={sessions} canManage={false} />
        }
        status={channel.status}
        onTextChange={setSceneText}
        onNotesChange={setElementNotes}
        onStatusChange={setElementStatus}
        previewIdSceneElement={picture.idSceneElement}
        onPreviewClose={picture.close}
      />
    </TableShell>
  );
}
