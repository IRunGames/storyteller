"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Collapsible,
  Flex,
  Grid,
  Heading,
  HStack,
  IconButton,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { ChevronsLeft, ChevronsRight, Info } from "lucide-react";
import type { StatusOption } from "@/lib/status";
import { SESSION_DONE_STATUS, cssUrlValue, sessionHeading, sessionStatusText } from "@/lib/stories";
import type {
  Storyboard as StoryboardData,
  StoryboardScene,
  StoryboardSession,
} from "@/lib/storyboard";
import {
  sa_getStoryboardSessions,
  sa_getStoryboardUnplayed,
} from "@/app/(app)/(nav)/stories/[id]/storyboard/actions";
import { LocalDate } from "@/components/dates/local-date";
import { StoryTitleMenu } from "@/components/stories/story-title-menu";
import { SceneCard } from "./scene-card";
import { SessionEditPopover } from "./session-edit-popover";

type Props = {
  board: StoryboardData;
  /** The story_scenes workflow, for the status word on each card. */
  sceneStatusOptions: StatusOption[];
};

// How far in from the edge the board's rows start, and the gutter the
// scroller keeps at either end so the first and last cards are not flush
// with the viewport.
const GUTTER = { base: "4", md: "8" } as const;

/**
 * The storyboard, /stories/[id]/storyboard: the story's scenes laid side to
 * side in the order they were played, on the story's cover. Each sitting is
 * a lane (SessionLane): a band in the theme's highlight naming it over the
 * scene cards played in it. For the storyteller a last lane holds the
 * scenes in no sitting yet, as a grid two cards tall rather than a row, so
 * a long backlog does not stretch the board out of sight. Who sees what is
 * the action's to decide (sa_getStoryboard); the board draws what it is
 * given.
 *
 * The page opens on the latest few sittings and the first of the unplayed
 * scenes, which is what the board is for most days; a More button before
 * the first lane fetches the sittings before it (sa_getStoryboardSessions)
 * and one after the grid fetches the next of the unplayed
 * (sa_getStoryboardUnplayed), each until there are none, so a story of
 * fifty sittings does not load them all to show the last three. Earlier
 * sittings go in before the first lane, and the scroller is moved by their
 * width as they land, so what was being looked at stays where it was.
 *
 * The page scrolls sideways, which is the one place in the app that does:
 * a timeline reads left to right, and a board of a dozen sittings laid
 * down the page would be a long way to scroll past the ones already read.
 */
export function Storyboard({ board, sceneStatusOptions }: Props) {
  const [sessions, setSessions] = useState<StoryboardSession[]>(board.sessions);
  const [moreSessions, setMoreSessions] = useState(board.moreSessions);
  const [unplayed, setUnplayed] = useState<StoryboardScene[]>(board.unplayed);
  const [moreUnplayed, setMoreUnplayed] = useState(board.moreUnplayed);
  const [loading, setLoading] = useState<"sessions" | "unplayed" | null>(null);
  const [failed, setFailed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // The scroller's width and position as earlier sittings were asked for,
  // to put it back by the width they add once they are laid out.
  const keep = useRef<{ width: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const kept = keep.current;
    const el = scroller.current;
    if (!kept || !el) return;
    keep.current = null;
    el.scrollLeft = kept.left + (el.scrollWidth - kept.width);
  }, [sessions]);

  // Secondary text sits on the darkened cover when there is one, and on the
  // plain page otherwise, as on the story page.
  const mutedColor = board.imageUrl ? "whiteAlpha.800" : "fg.muted";
  const isEmpty = sessions.length === 0 && unplayed.length === 0;

  async function loadEarlier() {
    const oldest = sessions[0];
    if (!oldest || loading) return;
    setLoading("sessions");
    setFailed(false);
    try {
      const page = await sa_getStoryboardSessions(board.idStory, {
        number: oldest.number,
        idStorySession: oldest.idStorySession,
      });
      if (!page) throw new Error("no page");
      const el = scroller.current;
      if (el) keep.current = { width: el.scrollWidth, left: el.scrollLeft };
      setSessions([...page.sessions, ...sessions]);
      setMoreSessions(page.more);
    } catch {
      setFailed(true);
    } finally {
      setLoading(null);
    }
  }

  // A sitting the storyteller deleted from its panel: its lane goes, and
  // the scenes that were in it go to the front of the unplayed grid, since
  // the database leaves them in the story with no sitting
  // (sa_deleteStorySession). The front is where the next load would put
  // them: a scene that was played has a number, and the grid's order puts
  // numbered scenes before the never-run ones it held.
  function removeSession(idStorySession: number) {
    const gone = sessions.find((session) => session.idStorySession === idStorySession);
    if (!gone) return;
    setSessions(sessions.filter((session) => session !== gone));
    setUnplayed([...gone.scenes, ...unplayed]);
  }

  async function loadMoreUnplayed() {
    if (loading) return;
    setLoading("unplayed");
    setFailed(false);
    try {
      const page = await sa_getStoryboardUnplayed(board.idStory, unplayed.length);
      if (!page) throw new Error("no page");
      setUnplayed([...unplayed, ...page.scenes]);
      setMoreUnplayed(page.more);
    } catch {
      setFailed(true);
    } finally {
      setLoading(null);
    }
  }

  return (
    // flex="1" fills the nav layout's column so the backdrop reaches the foot
    // of the viewport, not just the bottom of the cards.
    <Box position="relative" flex="1" display="flex" flexDirection="column">
      {board.imageUrl && (
        <>
          <Box
            data-testid="storyboard-backdrop"
            position="absolute"
            inset="0"
            bgSize="cover"
            bgPos="center"
            style={{ backgroundImage: `url("${cssUrlValue(board.imageUrl)}")` }}
          />
          {/* The cards' scrim, so the bands and the text never meet a bright
              cover directly and the page reads the same in every theme. */}
          <Box
            position="absolute"
            inset="0"
            bgGradient="to-b"
            gradientFrom="blackAlpha.700"
            gradientVia="blackAlpha.400"
            gradientTo="blackAlpha.800"
          />
        </>
      )}

      <Stack
        position="relative"
        flex="1"
        gap="6"
        py="8"
        color={board.imageUrl ? "white" : undefined}
      >
        <HStack gap="3" align="center" px={GUTTER}>
          {/* The story's title, whose caret opens the story's doors
              (StoryTitleMenu): the story's page for anyone who can see the
              board, and the storyteller's pages for the storyteller. */}
          <StoryTitleMenu
            idStory={board.idStory}
            title={board.title}
            isStoryteller={board.isStoryteller}
            onImage={!!board.imageUrl}
          />
          <Badge variant="solid" colorPalette="blue" flexShrink="0">
            STORYBOARD
          </Badge>
          {failed && (
            <Text role="alert" textStyle="sm" color={mutedColor}>
              More could not be loaded right now.
            </Text>
          )}
        </HStack>

        {isEmpty ? (
          <Text px={GUTTER} color={mutedColor}>
            No scenes have been played yet.
          </Text>
        ) : (
          // The scroller itself. align start so a lane two cards tall does
          // not stretch the one-row lanes beside it.
          <Flex ref={scroller} overflowX="auto" gap="8" px={GUTTER} pb="4" align="start" flex="1">
            {moreSessions && (
              <MoreButton
                label="Earlier sessions"
                side="start"
                loading={loading === "sessions"}
                onClick={loadEarlier}
              />
            )}
            {sessions.map((session) => (
              <SessionLane
                key={session.idStorySession}
                idStory={board.idStory}
                session={session}
                statusOptions={sceneStatusOptions}
                canEdit={board.isStoryteller}
                mutedColor={mutedColor}
                onDeleted={() => removeSession(session.idStorySession)}
              />
            ))}
            {unplayed.length > 0 && (
              <Stack as="section" aria-label="Not yet played" gap="3" flexShrink="0">
                {/* No band: a band names a sitting, and these have none.
                    Set in the band's row so the grid's top lines up with
                    the lanes' cards. */}
                <Heading size="sm" px="4" py="1" color={mutedColor}>
                  Not yet played
                </Heading>
                <HStack gap="4" align="start">
                  <Grid templateRows="repeat(2, auto)" autoFlow="column" gap="4">
                    {unplayed.map((scene) => (
                      <SceneCard
                        key={scene.idStoryScene}
                        idStory={board.idStory}
                        scene={scene}
                        statusOptions={sceneStatusOptions}
                        canEdit={board.isStoryteller}
                      />
                    ))}
                  </Grid>
                  {moreUnplayed && (
                    <MoreButton
                      label="More unplayed scenes"
                      side="end"
                      loading={loading === "unplayed"}
                      onClick={loadMoreUnplayed}
                    />
                  )}
                </HStack>
              </Stack>
            )}
          </Flex>
        )}
      </Stack>
    </Box>
  );
}

/**
 * The board's two More buttons: before the first lane, pointing back to
 * the earlier sittings, and after the unplayed grid, pointing on to the
 * rest of the backlog. Set in the band's row, where the eye lands first
 * on a lane, and in the board's white-on-cover dressing so it reads on
 * the picture.
 */
function MoreButton({
  label,
  side,
  loading,
  onClick,
}: {
  /** The accessible name: the text says only More, the chevrons which way. */
  label: string;
  side: "start" | "end";
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      aria-label={label}
      size="sm"
      rounded="full"
      variant="subtle"
      flexShrink="0"
      alignSelf="start"
      loading={loading}
      onClick={onClick}
    >
      {side === "start" && <ChevronsLeft size={16} />}
      More
      {side === "end" && <ChevronsRight size={16} />}
    </Button>
  );
}

/**
 * One sitting on the board: its band, in the theme's highlight with the
 * sitting's heading and date, over the scenes played in it in a row. The
 * band stretches to the row's width, so it reads as covering its scenes.
 * A sitting still in progress (only the storyteller's board has one) says
 * so on its band; a sitting with no scenes to show keeps its band, since
 * the sitting happened, and says there is nothing under it.
 *
 * A sitting that was written up has its write-up open between the band
 * and the scenes from the start: the summary, the notes and the lingering
 * questions, each under its own heading and only when there is one, as the
 * session popover shows them, laid side by side across the row's width and
 * stacking where the row is too narrow for that. The info button after
 * the sitting's name folds the panel away and back (Collapsible), for a
 * board read for its pictures. A sitting with nothing written has neither
 * panel nor button: a panel that only said so would be a click for
 * nothing.
 *
 * For the storyteller a pencil follows, on every band, that opens the
 * Timeline's session panel in a popover (SessionEditPopover), so a sitting
 * can be written up from the board; the band and the write-up then show
 * what was saved. That is kept here rather than in the board's lists: a
 * lane's write-up is its own, and the board never hands a lane a new one.
 * The panel's trashcan is the one thing that reaches the board: a deleted
 * sitting's lane is the board's to take away, and its scenes the board's
 * to move (onDeleted).
 */
function SessionLane({
  idStory,
  session: given,
  statusOptions,
  canEdit,
  mutedColor,
  onDeleted,
}: {
  idStory: number;
  session: StoryboardSession;
  statusOptions: StatusOption[];
  /** The viewer tells the story: the band gets a pencil. */
  canEdit: boolean;
  mutedColor: string;
  onDeleted: () => void;
}) {
  const [session, setSession] = useState(given);
  const heading = sessionHeading(session);
  const about = `About ${heading}`;
  const writeUp = [
    { label: "Summary", text: session.summary },
    { label: "Notes", text: session.notes },
    { label: "Lingering questions", text: session.lingeringQuestions },
  ].filter((part) => part.text);
  // On the cover the panel is a dark box like the story page's, so the
  // white text reads; on the plain page it is a panel of the theme's own.
  const onCover = mutedColor !== "fg.muted";

  return (
    <Stack as="section" aria-label={heading} gap="3" flexShrink="0" align="start">
      {/* The root holds the band and the panel, since the trigger lives on
          the band; stretched so both take the row's width, and no wider:
          with a width of zero it asks for none of its own, so the row of
          scenes alone sets the lane's, and the full minimum width then
          fills that. Without this a long write-up would set the lane's
          width instead and run on past its scenes. The panel is in the
          page only while open, so a sitting folded away carries no hidden
          write-up. */}
      <Collapsible.Root alignSelf="stretch" w="0" minW="full" defaultOpen lazyMount unmountOnExit>
        {/* The band runs the row's full width, which may be wider than the
            screen, so everything it says sits at its start where it is
            seen. */}
        <HStack bg="play.accent" color="play.contrast" rounded="full" px="4" py="1" gap="3">
          <Text fontWeight="semibold" truncate>
            {heading}
          </Text>
          {writeUp.length > 0 && (
            <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
              <Tooltip.Trigger asChild>
                <Collapsible.Trigger asChild>
                  <IconButton
                    type="button"
                    aria-label={about}
                    size="xs"
                    variant="ghost"
                    rounded="full"
                    color="inherit"
                    // Open, the ghost recipe would fill it with the gray
                    // palette's subtle shade, against which the band's
                    // contrast colour vanishes. Inverted instead: a solid
                    // circle in the band's contrast colour with the icon in
                    // its accent, which reads as switched on in any theme.
                    _hover={{ bg: "blackAlpha.200" }}
                    _expanded={{
                      bg: "play.contrast",
                      color: "play.accent",
                      _hover: { bg: "play.contrast" },
                    }}
                  >
                    <Info size={16} />
                  </IconButton>
                </Collapsible.Trigger>
              </Tooltip.Trigger>
              <Portal>
                <Tooltip.Positioner>
                  <Tooltip.Content>{about}</Tooltip.Content>
                </Tooltip.Positioner>
              </Portal>
            </Tooltip.Root>
          )}
          {canEdit && (
            <SessionEditPopover
              idStorySession={session.idStorySession}
              heading={heading}
              onSaved={(saved) => setSession({ ...session, ...saved })}
              onDeleted={onDeleted}
            />
          )}
          <HStack gap="3" flexShrink="0" textStyle="xs">
            <LocalDate value={session.startedAt} />
            {session.status !== SESSION_DONE_STATUS && (
              <Text>{sessionStatusText(session.status)}</Text>
            )}
          </HStack>
        </HStack>
        {writeUp.length > 0 && (
          <Collapsible.Content>
            {/* Each part takes an equal share of the row from a readable
                measure up to most of the viewport, and wraps under the
                others when the row (one card's width, for a sitting with
                one scene) has no room for it beside them. */}
            <Flex
              as="section"
              aria-label={about}
              wrap="wrap"
              gap="4"
              mt="3"
              p="4"
              rounded="xl"
              bg={onCover ? "blackAlpha.700" : "bg.panel"}
              borderWidth={onCover ? undefined : "1px"}
            >
              {writeUp.map((part) => (
                <Stack key={part.label} gap="1" flex="1 1 16rem" minW="0" maxW="80vw">
                  <Heading size="xs" textTransform="uppercase" letterSpacing="wider">
                    {part.label}
                  </Heading>
                  <Text textStyle="sm" whiteSpace="pre-wrap">
                    {part.text}
                  </Text>
                </Stack>
              ))}
            </Flex>
          </Collapsible.Content>
        )}
      </Collapsible.Root>
      {session.scenes.length === 0 ? (
        <Text textStyle="sm" color={mutedColor} px="4">
          No scenes to show.
        </Text>
      ) : (
        // align start: a card grown open with its elements is taller than
        // its neighbours, which keep their own height.
        <HStack gap="4" align="start">
          {session.scenes.map((scene) => (
            <SceneCard
              key={scene.idStoryScene}
              idStory={idStory}
              scene={scene}
              statusOptions={statusOptions}
              canEdit={canEdit}
            />
          ))}
        </HStack>
      )}
    </Stack>
  );
}
