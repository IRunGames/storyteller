"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Box,
  Button,
  chakra,
  Grid,
  HStack,
  List,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { ChevronsRight } from "lucide-react";
import { SCENE_SEARCH_DELAY_MS, SCENES_PAGE_SIZE, type StoryScene } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";
import { sa_listStoryScenes } from "@/app/(app)/(nav)/libraries/actions";
import { StatusPill } from "@/components/status/status-pill";
import { LocalDate } from "@/components/dates/local-date";
import { SceneInfoPopover } from "./scene-info-popover";

type Props = {
  idStory: number;
  /** The first page of the story's scenes, loaded by the page. */
  initial: StoryScene[];
  /** What the column's search box holds. */
  filter: string;
  /**
   * The statuses still switched on above the search box. The database is
   * asked for these only, so a status switched off takes its scenes out of
   * every page, not just the one already loaded.
   */
  shownStatuses: string[];
  /** The story_scenes workflow, for the pills. */
  statusOptions: StatusOption[];
  /** The viewer is the storyteller, so the pills are menus. */
  canEdit: boolean;
};

// A real button, so it takes focus and a tap; Text polymorphed with `as`
// keeps the paragraph's prop types, which have no `type`.
const NumberButton = chakra("button");

/**
 * Which sitting a scene was played in: "Session 3" on the card, with the
 * sitting's full name behind it. A tooltip rather than a click-popover — it
 * is one short line, and this is a label rather than something to open — and
 * the trigger is a button so it takes focus and a tap.
 *
 * No aria-label: the words on it are already what it is, and the tooltip
 * becomes the description, so a screen reader reads "Session 3" and then the
 * name rather than a name that does not match the visible text.
 */
function SessionNumber({ number, heading }: { number: number; heading: string }) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <NumberButton
          type="button"
          color="fg.muted"
          fontSize="xs"
          lineHeight="1.4"
          whiteSpace="nowrap"
          justifySelf="center"
          cursor="default"
        >
          Session {number}
        </NumberButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{heading}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}

// The Scenes column of the Prep Work board. Unlike the other columns the
// search is not a filter over the rows in hand: it goes back to the database
// and runs against story_scenes.search_text, so a scene is found by its
// status, its title or anything written in its description, whether or not
// its page has been loaded yet.
export function PrepScenes({
  idStory,
  initial,
  filter,
  shownStatuses,
  statusOptions,
  canEdit,
}: Props) {
  const [scenes, setScenes] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length === SCENES_PAGE_SIZE);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [isSearching, setSearching] = useState(false);
  const [, startTransition] = useTransition();

  // Which search is the latest: a slow reply to an earlier query must not
  // land on top of the results for what the box says now.
  const searchSeq = useRef(0);
  // The page already loaded the unfiltered first page, so an untouched box on
  // first render asks for nothing. Every later change does, including the one
  // back to empty.
  const searched = useRef(false);

  // The statuses as a string, so the effect below re-runs when the set
  // changes rather than on every render that rebuilds the array.
  const statusKey = shownStatuses.join(",");
  const everyStatus = statusOptions.length > 0 && shownStatuses.length === statusOptions.length;

  useEffect(() => {
    const needle = filter.trim();
    // Nothing has been touched yet: the page already loaded the first page
    // unfiltered, with every status on.
    if (!searched.current && needle === "" && everyStatus) return;
    searched.current = true;

    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await sa_listStoryScenes(idStory, 0, needle, shownStatuses);
        if (seq !== searchSeq.current) return;
        setScenes(found);
        setHasMore(found.length === SCENES_PAGE_SIZE);
      } catch {
        // Leave the last results in place; the next keystroke tries again.
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, SCENE_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // shownStatuses is rebuilt on every render; statusKey is what actually
    // changed. eslint cannot see through that, hence the disable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idStory, filter, statusKey, everyStatus]);

  function onMore() {
    const offset = scenes.length;
    const seq = searchSeq.current;
    setLoadingMore(true);
    startTransition(async () => {
      try {
        const page = await sa_listStoryScenes(idStory, offset, filter.trim(), shownStatuses);
        // The box moved on while this was in flight; its own search will
        // replace the list, so this page is no longer wanted.
        if (seq !== searchSeq.current) return;
        setScenes((current) => [...current, ...page]);
        setHasMore(page.length === SCENES_PAGE_SIZE);
      } catch {
        // Leave the list as it was; the button stays so they can retry.
      } finally {
        setLoadingMore(false);
      }
    });
  }

  // A scene whose status the pill has just moved keeps the new one, so the
  // row does not snap back while the column waits for its next load.
  function onStatusChanged(idStoryScene: number, status: string) {
    setScenes((current) =>
      current.map((scene) => (scene.idStoryScene === idStoryScene ? { ...scene, status } : scene)),
    );
  }

  if (scenes.length === 0) {
    const untouched = filter.trim() === "" && everyStatus;
    return (
      <Text color="fg.muted">
        {untouched ? "No scenes yet." : isSearching ? "Searching…" : "No matches."}
      </Text>
    );
  }

  return (
    <Stack gap="4">
      <List.Root listStyleType="none" gap="3">
        {scenes.map((scene) => (
          <List.Item key={scene.idStoryScene}>
            <Stack gap="1">
              <HStack gap="1" align="start" justify="space-between">
                {/* A finished scene is numbered where it came in its
                    sitting; one still to play has no number yet and its
                    title starts the line. */}
                <Text fontWeight="medium" minW="0">
                  {scene.sceneNumber === null
                    ? scene.title
                    : `${scene.sceneNumber}. ${scene.title}`}
                </Text>
                {/* The card shows the first lines of what the storyteller
                    wrote; the panel behind this button shows all of it. */}
                <SceneInfoPopover
                  idStoryScene={scene.idStoryScene}
                  statusOptions={statusOptions}
                  canEdit={canEdit}
                  onStatusChanged={(status) => onStatusChanged(scene.idStoryScene, status)}
                />
              </HStack>

              {/* The description runs to several lines in the database — the
                  NPCs in the scene and anything of note — and the column is
                  narrow, so the card shows the opening and the rest waits
                  for the scene to be opened. */}
              {scene.description && (
                <Text color="fg.muted" fontSize="sm" lineClamp="3">
                  {scene.description}
                </Text>
              )}

              {/* Where the scene has got to, along the foot of the card: the
                  status, the sitting it was played in, and the day it reached
                  that status. Three columns rather than a row with a spacer,
                  so the sitting sits in the middle of the card however wide
                  the status and the date happen to be. */}
              <Grid templateColumns="1fr auto 1fr" alignItems="center" gap="2" pt="1">
                <Box justifySelf="start">
                  <StatusPill
                    table="story_scenes"
                    id={scene.idStoryScene}
                    status={scene.status}
                    options={statusOptions}
                    canEdit={canEdit}
                    onChanged={(status) => onStatusChanged(scene.idStoryScene, status)}
                  />
                </Box>
                {scene.sessionNumber !== null && scene.sessionHeading !== null && (
                  <SessionNumber number={scene.sessionNumber} heading={scene.sessionHeading} />
                )}
                {scene.statusAt && (
                  <Text
                    color="fg.muted"
                    fontSize="xs"
                    whiteSpace="nowrap"
                    gridColumn="3"
                    justifySelf="end"
                  >
                    <LocalDate value={scene.statusAt} />
                  </Text>
                )}
              </Grid>
            </Stack>
          </List.Item>
        ))}
      </List.Root>

      {hasMore && (
        <Box>
          <Button variant="outline" onClick={onMore} loading={isLoadingMore} loadingText="More">
            More
            <ChevronsRight />
          </Button>
        </Box>
      )}
    </Stack>
  );
}
