"use client";

import { useEffect, useRef, useState } from "react";
import { Flex, HStack, Text } from "@chakra-ui/react";
import { BookOpen, ChartNoAxesColumn, RefreshCw } from "lucide-react";
import type { RunPlaySpace, RunScene, RunSession } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { EMPTY_SCENE_TEXT } from "@/lib/scenes";
import { SCENE_LOCKED_STATUS, SESSION_PLAYING_STATUSES, SESSION_STATUS } from "@/lib/status";
import type { StorySession } from "@/lib/stories";
import { sa_openRunPlaySpace } from "@/components/run/actions";
import { useWideStacks } from "@/components/run/use-wide-stacks";
import { SceneItemsProvider } from "@/components/table-shell/scene-items-context";
import { useSceneItems } from "@/components/table-shell/use-scene-items";
import { TableLibraryPanel } from "@/components/table-shell/table-library-panel";
import { TablePlaySpace, TableStacks } from "@/components/table-shell/table-play-space";
import { TableShell } from "@/components/table-shell/table-shell";
import { useTableChat } from "@/components/table-shell/use-table-chat";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { toaster } from "@/components/ui/toaster";
import { InactivityCheck } from "./inactivity-check";
import { PlayPanelToggle } from "@/components/play/play-panel-toggle";
import { SceneCompleteOverlay } from "@/components/play/scene-state-overlay";
import { SceneTextPopover } from "@/components/play/scene-text-popover";
import { useStoryChannel } from "@/components/play/use-story-channel";
import { StoryPlayingBox } from "@/components/stories/story-playing-box";
import { RunStatsPane } from "./run-stats-pane";
import { RunTableHeader } from "./run-table-header";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { glass } from "@/theme";

// The storyteller's own preference keys for the panes this table alone has;
// the chat's, the character's and the diagnostics' are useTableChat's, under
// the same `run.` prefix. The library starts open, since it is what this
// table is for.
const SHOW_LIBRARY = "run.showLibrary";
const SHOW_STATS = "run.showStats";

const LIBRARY_ID = "run-panel-library";
const STATS_ID = "run-panel-stats";

type Props = {
  idStory: number;
  /** The story being run, shown in the header. */
  title: string;
  /**
   * The story's cover, behind the play space while the table is on no scene
   * or on one without a cover of its own.
   */
  storyCoverUrl: string | null;
  /**
   * The first page of the story's sessions, for the list in the box the play
   * space shows while it is on no scene (StoryPlayingBox).
   */
  sessions: StorySession[];
  /** The session being played, or null when there is none. */
  session: RunSession | null;
  /** The scene the table opens on, and what the play space holds for it. */
  initialSpace: RunPlaySpace;
  /** The story_scenes workflow, for the scene selector's statuses. */
  sceneStatusOptions: StatusOption[];
  /** The story_sessions workflow, for the chip beside the session's title. */
  sessionStatusOptions: StatusOption[];
};

// The storyteller's table, /stories/[id]/run: the player's table (PlayTable)
// with the story's library down the left. It is a page and a component a
// player never loads, so that what only the storyteller may see lives
// there; the page proves the caller owns the story before drawing any of it.
//
// The play space opens with the scene the session is on and the elements
// brought into it (sa_openRunPlaySpace), in one stack per scene tag with the
// scene's cover behind them. A stack's + makes a new element filed under
// its tag, and the library's arrow links an element to the scene under the
// In select's tag (TableLibraryPanel); both are saved, tag and all, so a
// reload puts each back in its stack. The scene selector in the header,
// beside the session and its status chip, moves the table to another scene,
// which replaces the play space with that scene's; the scene's status chip
// sits beside the selector. The session's chip is a menu too: pausing or
// ending the session from it takes the table down and goes back to the
// story's page, which is where a paused session is resumed. The scene's
// title stands in the play space's upper left.
//
// Every change made here is published on the story's MQTT topic for the
// players' table (lib/realtime/publish-scene.ts). The table listens to the
// story's topics too, for the chat (useTableChat), whose lines come in
// whether or not its panel is open and are counted on the Chat toggle
// while it is not; moving to another scene puts an "Entering" divider in
// it. The diagnostics panel, in the chat's place as on the players' table,
// lists what comes over that same connection, so the storyteller can see
// each change go out.
export function RunTable({
  idStory,
  title,
  storyCoverUrl,
  sessions,
  session,
  initialSpace,
  sceneStatusOptions,
  sessionStatusOptions,
}: Props) {
  const preferences = useUserPreferences();
  const panels = useTableChat(idStory, "run");
  const { chat } = panels;
  // This table publishes the scene and does not follow it, so the state
  // topic's messages are left alone; the connection is always open for the
  // chat, and for the diagnostics panel.
  const channel = useStoryChannel(idStory, {
    onChat: chat.receive,
    onConnect: () => void chat.refresh(),
  });
  const [scene, setScene] = useState<RunScene | null>(initialSpace.scene);
  // The session's status as its chip last moved it; the page loaded it.
  const [sessionStatus, setSessionStatus] = useState(session?.status ?? null);
  const [tags, setTags] = useState<string[]>(initialSpace.tags);
  // The stacks widened to the whole space, the scene's own, so every table
  // draws them the same (useWideStacks).
  const wideStacks = useWideStacks(idStory, scene?.idStoryScene ?? null, initialSpace.wideTags);
  const [coverUrl, setCoverUrl] = useState<string | null>(initialSpace.coverUrl);
  // Bumped when the scene editor's Pictures change them, so the library's
  // Attachments tab reads them again; see RunLibrary's attachmentsVersion.
  const [picturesVersion, setPicturesVersion] = useState(0);
  // What is in the play space and every way it changes, handed down to the
  // stacks, the pills and the library through SceneItemsProvider.
  const sceneItems = useSceneItems(initialSpace.inPlay);
  const inPlay = sceneItems.items;
  // Counts the times the space was read again, for the stats pane to read
  // its blocks again with it.
  const [spaceVersion, setSpaceVersion] = useState(0);
  // The pill whose picture the storyteller last put up on the players'
  // table from its tack, by key, or null for none. This page's alone: the
  // pulse that put it up was not written anywhere, so a reload starts from
  // none, and so does another scene.
  const [pictureUpKey, setPictureUpKey] = useState<string | null>(null);
  // A complete scene is the record of what was played: nothing goes into it
  // or comes out of it (the actions refuse too), and the play space says so.
  const isComplete = scene?.status === SCENE_LOCKED_STATUS;
  // What is behind the play space: the scene's cover, or the story's when
  // there is no scene or the scene has none, so the space is never bare
  // while the story has a picture. coverUrl stays the scene's alone, since
  // the library's Cover buttons set and clear it.
  const shownCoverUrl = coverUrl ?? storyCoverUrl;

  const loadSpace = (space: RunPlaySpace) => {
    setScene(space.scene);
    setTags(space.tags);
    wideStacks.load(space.wideTags);
    setCoverUrl(space.coverUrl);
    sceneItems.load(space.inPlay);
    setPictureUpKey(null);
    setSpaceVersion((current) => current + 1);
  };

  // The reload at the scene's title: the space read again as the database
  // holds it now, for a change made elsewhere (a player untapping a card,
  // another window) that the table has not heard of. Hidden while it is
  // out, so a second press cannot send it twice.
  const [reloading, setReloading] = useState(false);
  async function reloadSpace() {
    setReloading(true);
    try {
      loadSpace(await sa_openRunPlaySpace(idStory));
    } catch {
      toaster.create({ title: "The scene could not be reloaded. Try again.", type: "error" });
    } finally {
      setReloading(false);
    }
  }

  // Nothing can be played until a session is, so the storyteller is told as
  // the table opens. The ref keeps React's development double mount from
  // raising it twice.
  const toldNoSession = useRef(false);
  useEffect(() => {
    if (toldNoSession.current) return;
    if (session === null) {
      toldNoSession.current = true;
      toaster.create({ title: "There is no active session.", type: "error" });
    } else if (session.status === SESSION_STATUS.SUSPENDED) {
      // A table opened on a pause: the session is there to resume from the
      // chip, so it is named as paused rather than missing.
      toldNoSession.current = true;
      toaster.create({ title: "This session is suspended.", type: "info" });
    }
  }, [session]);

  const showLibrary = preferences.get<boolean>(SHOW_LIBRARY, true);
  const showStats = preferences.get<boolean>(SHOW_STATS, false);

  // A pill's tack: the picture goes up, or comes down if it is the one up.
  // One picture is up on the players' table at a time (their preview is one
  // dialog, and a fresh open swaps it), so the one key says which pill
  // glows, and another's going up takes this glow with it.
  const setPictureUp = (key: string, up: boolean) =>
    setPictureUpKey((current) => (up ? key : current === key ? null : current));

  // A list with no row of its own: PlayHeader lays it out in the header, and
  // in the drawer on a phone.
  const toggles = (
    <>
      <PlayPanelToggle
        label="Library"
        controls={LIBRARY_ID}
        isOpen={showLibrary}
        onToggle={() => preferences.set(SHOW_LIBRARY, !showLibrary)}
      >
        <BookOpen />
      </PlayPanelToggle>
      <PlayPanelToggle
        label="Stats"
        controls={STATS_ID}
        isOpen={showStats}
        onToggle={() => preferences.set(SHOW_STATS, !showStats)}
      >
        <ChartNoAxesColumn />
      </PlayPanelToggle>
      {panels.toggles.character}
      {panels.toggles.chat}
      {panels.toggles.diagnostics}
    </>
  );

  const header = (
    <RunTableHeader
      idStory={idStory}
      title={title}
      session={session}
      sessionStatus={sessionStatus}
      onSessionStatusChange={setSessionStatus}
      scene={scene}
      onSceneStatusChange={(status) =>
        setScene((current) => (current ? { ...current, status } : current))
      }
      onLoaded={loadSpace}
      sceneStatusOptions={sceneStatusOptions}
      sessionStatusOptions={sessionStatusOptions}
      toggles={toggles}
      atTable={chat.atTable}
    />
  );

  // Over the stacks, saying so, but letting the pointer through: the pills'
  // panels and the scene's text are still there to read, and the pills
  // themselves (locked) offer nothing that changes the scene.
  //
  // A suspended session says so in the same way, pale where the complete
  // scene is dark, so the two read as different things. It takes the
  // complete scene's place rather than stacking on it: the break in play is
  // the more recent news. Nothing at the table changes while it is up (the
  // actions refuse a paused session), and the chip that resumes it is in the
  // header, outside the overlay.
  const overlay =
    sessionStatus === SESSION_STATUS.SUSPENDED ? (
      <Flex
        position="absolute"
        inset="0"
        align="center"
        justify="center"
        bg="whiteAlpha.500"
        pointerEvents="none"
        data-testid="session-suspended-overlay"
      >
        <Text fontSize="5xl" fontWeight="bold" letterSpacing="widest" color="gray.900">
          SUSPENDED
        </Text>
      </Flex>
    ) : (
      isComplete && <SceneCompleteOverlay />
    );

  return (
    <SceneItemsProvider value={sceneItems}>
      <TableShell
        before={
          // Asks after a long quiet whether play goes on, and suspends the
          // session if not; the chip and the overlay then follow the status.
          session && (
            <InactivityCheck
              idStory={idStory}
              idStorySession={session.idStorySession}
              isPlaying={sessionStatus !== null && SESSION_PLAYING_STATUSES.includes(sessionStatus)}
              onSuspended={setSessionStatus}
            />
          )
        }
        header={header}
        left={
          <>
            {showLibrary && (
              <TableLibraryPanel
                id={LIBRARY_ID}
                width="sm"
                idStory={idStory}
                scene={scene}
                tags={tags}
                onTagsChange={setTags}
                locked={isComplete}
                onCoverChange={setCoverUrl}
                attachmentsVersion={picturesVersion}
              />
            )}
            {/* The scene's stat blocks, every element's at once, beside the
                library and before the play space. */}
            {showStats && (
              <RunStatsPane
                id={STATS_ID}
                idStory={idStory}
                idStoryScene={scene?.idStoryScene ?? null}
                items={inPlay}
                locked={isComplete}
                version={spaceVersion}
                onStatusChange={sceneItems.setStatus}
              />
            )}
          </>
        }
        below={panels.characterPanel}
        right={panels.rightPanel(channel)}
        overlay={panels.chatOverlay}
      >
        <TablePlaySpace
          coverUrl={shownCoverUrl}
          overlay={overlay}
          // After the overlays, so it stays above a SUSPENDED one and its
          // chevron, pencils and trashcans keep working.
          after={
            scene === null && (
              <StoryPlayingBox
                idStory={idStory}
                title={title}
                sessions={sessions}
                sessionStatusOptions={sessionStatusOptions}
                canManage
              />
            )
          }
        >
          {/* With a scene loaded, the scene is what the space is about:
              its title stands in the upper left, on the panel colour,
              part see-through, as the pills are, so it reads over the
              cover, with the reload before it and the chevron that
              opens its description and notes after. With no scene there
              is nothing to title: the story's box in the lower left says
              what is being played instead. */}
          {scene !== null && (
            <HStack
              gap="1"
              alignSelf="flex-start"
              maxW="full"
              rounded="2xl"
              css={glass}
              ps="1"
              pe="1"
              py="1"
            >
              {!reloading && (
                <IconButtonWithTooltip label="Reload the scene" onClick={() => void reloadSpace()}>
                  <RefreshCw />
                </IconButtonWithTooltip>
              )}
              {/* The title is the popover's own trigger, the chevron after it. */}
              <SceneTextPopover
                asTitle
                idStory={idStory}
                idStoryScene={scene.idStoryScene}
                title={scene.title}
                text={scene.text ?? EMPTY_SCENE_TEXT}
                saver="run"
                onSaved={(text) =>
                  setScene((current) => (current ? { ...current, text } : current))
                }
                readOnly={isComplete}
                pictures={{
                  idStory,
                  idStoryScene: scene.idStoryScene,
                  onCoverChange: setCoverUrl,
                  onPicturesChange: () => setPicturesVersion((version) => version + 1),
                }}
              />
            </HStack>
          )}
          {/* With no scene and nothing brought in, an empty Default stack
              would only say "Nothing here yet", so the space is left to the
              cover and the story's box. Something the library adds with no
              scene still shows, in its stack. */}
          {(scene !== null || inPlay.length > 0) && (
            <TableStacks
              idStory={idStory}
              idStoryScene={scene?.idStoryScene ?? null}
              tags={tags}
              items={inPlay}
              locked={isComplete}
              wideStacks={wideStacks}
              pictureUpKey={pictureUpKey}
              onPictureUpChange={setPictureUp}
            />
          )}
        </TablePlaySpace>
      </TableShell>
    </SceneItemsProvider>
  );
}
