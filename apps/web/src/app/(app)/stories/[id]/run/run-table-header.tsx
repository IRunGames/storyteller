"use client";

import type { ComponentProps, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { HStack } from "@chakra-ui/react";
import type { RunPlaySpace, RunScene, RunSession } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { SCENE_LOCKED_STATUS, SESSION_STATUS } from "@/lib/status";
import { sessionHeading } from "@/lib/stories";
import { SessionNotesPopover } from "@/components/sessions/session-notes-popover";
import { PlayHeader } from "@/components/play/play-header";
import { StoryTitleMenu } from "@/components/stories/story-title-menu";
import { StatusPill } from "@/components/status/status-pill";
import { JoinLinkButton } from "./join-link-button";
import { RunSceneSelect } from "./run-scene-select";
import { RunSessionTitle } from "./run-session-title";

type Props = {
  idStory: number;
  /** The story being run. */
  title: string;
  /** The session being played, or null when there is none. */
  session: RunSession | null;
  /** The session's status as its chip last moved it, and the chip's change. */
  sessionStatus: string | null;
  onSessionStatusChange: (status: string) => void;
  /** The scene the table is on, or null for none, and its status chip's change. */
  scene: RunScene | null;
  onSceneStatusChange: (status: string) => void;
  /** The play space for a scene the selector moved the table to. */
  onLoaded: (space: RunPlaySpace) => void;
  sceneStatusOptions: StatusOption[];
  sessionStatusOptions: StatusOption[];
  /** The panel toggles for the header's middle. */
  toggles: ReactNode;
  /** Who is at the table, as the chat counts them, for the join link's badge; see JoinLinkButton. */
  atTable: ComponentProps<typeof JoinLinkButton>["atTable"];
};

/**
 * The run table's header: the story's title menu, the session's title with
 * its notes, the join link and its status chip, then the scene selector and
 * the scene's status chip; the panel toggles in the middle (PlayHeader).
 * Ending the session takes the table down and goes back to the story's
 * page, since an ended session has nothing left to run.
 */
export function RunTableHeader({
  idStory,
  title,
  session,
  sessionStatus,
  onSessionStatusChange,
  scene,
  onSceneStatusChange,
  onLoaded,
  sceneStatusOptions,
  sessionStatusOptions,
  toggles,
  atTable,
}: Props) {
  const router = useRouter();
  const isComplete = scene?.status === SCENE_LOCKED_STATUS;

  return (
    <PlayHeader
      title={title}
      titleContent={
        <StoryTitleMenu
          idStory={idStory}
          title={title}
          isStoryteller
          as="span"
          size="lg"
          fontWeight="medium"
        />
      }
      session={session ? sessionHeading(session) : null}
      sessionContent={session && <RunSessionTitle idStory={idStory} session={session} />}
      center={toggles}
      centerInMenu
      afterSession={
        <HStack gap="1" flexShrink="0">
          {/* The session's notes and lingering questions, the same panel
              the players have beside the heading at their table. */}
          {session && (
            <SessionNotesPopover
              idStorySession={session.idStorySession}
              heading={sessionHeading(session)}
            />
          )}
          {/* The join link beside the notes, whether or not a session is
              on: seats are handed out before play begins as well. */}
          <JoinLinkButton idStory={idStory} atTable={atTable} />
          {/* The session's status as a chip beside its title, and the
              way to pause, resume or end it. Pausing keeps the storyteller
              at the table: a pause is a break in play, and the same chip
              resumes it. Ending asks first and takes the table down, since
              an ended session has nothing left to run, so the storyteller
              goes back to the story's page. */}
          {session && sessionStatus !== null && (
            <StatusPill
              table="story_sessions"
              id={session.idStorySession}
              status={sessionStatus}
              options={sessionStatusOptions}
              canEdit
              tooltip="Set session status"
              confirm={(next) => {
                if (next === SESSION_STATUS.DONE) {
                  return {
                    title: "End this session?",
                    body: "The session is over and the table closes. Carrying the story on means starting a new session from the story's page.",
                    confirmLabel: "End session",
                  };
                }
                if (next === SESSION_STATUS.SUSPENDED) {
                  return {
                    title: "Suspend this session?",
                    body: "Play stops for a break. The table stays open, and this menu resumes the session.",
                    confirmLabel: "Suspend session",
                  };
                }
                return null;
              }}
              onChanged={(status) => {
                onSessionStatusChange(status);
                if (status === SESSION_STATUS.DONE) router.push(`/stories/${idStory}`);
              }}
            />
          )}
          <RunSceneSelect
            idStory={idStory}
            scene={scene}
            hasSession={session !== null}
            statusOptions={sceneStatusOptions}
            onLoaded={onLoaded}
          />
          {/* The scene's status beside the selector. Keyed by the scene,
              so moving to another starts from that scene's status. It
              stays a menu on a complete scene, as the workflow allows:
              moving it back lifts the overlay and the locks, which all
              follow the status. Completing a scene and resuming one each
              ask first. */}
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
                // Leaving complete undoes a scene the storyteller
                // finished, so it asks too.
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
              onChanged={onSceneStatusChange}
            />
          )}
        </HStack>
      }
    />
  );
}
