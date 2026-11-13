"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import {
  Alert,
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  Input,
  InputGroup,
  Portal,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import type { SortingState } from "@tanstack/react-table";
import { ChevronsRight, LayoutGrid, List, Search } from "lucide-react";
import type { StoryCardData } from "@/lib/stories";
import {
  MY_STORIES_PAGE_SIZE,
  type MyStoryListQuery,
  type StorySortKey,
} from "@/lib/story-list-schemas";
import { sa_listMyStoryPage, sa_setFavorite } from "@/app/(app)/(nav)/stories/actions";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { StoryCardGrid } from "./story-section";
import { StoryTable } from "./story-table";

/** Where the Stories page keeps its view, among the user's preferences. */
export const STORIES_VIEW_KEY = "stories.view";

/** How long the search box waits after the last keystroke before asking the server. */
export const STORY_SEARCH_DELAY_MS = 400;

type View = "cards" | "list";

const VIEWS: { view: View; label: string; icon: React.ReactNode }[] = [
  { view: "cards", label: "Icon view", icon: <LayoutGrid /> },
  { view: "list", label: "List view", icon: <List /> },
];

/** The stories a query brought, with the query they are for. */
type Listed = { key: string; stories: StoryCardData[]; hasMore: boolean };

type Props = {
  /** The first page, as the page loaded it with the default query. */
  initial: StoryCardData[];
};

/**
 * The Stories page: every story the user runs, plays in or has favorited,
 * as cards (Icon view) or a table (List view, StoryTable) by the toggle in
 * the upper right, which is kept as the user's preference. A search box
 * over the stories' titles, summaries and standard tags, the Show inactive
 * switch and the table's column headers all change the query, which
 * sa_listMyStoryPage answers sorted, searched and paged in the database;
 * the cards show the same rows in the same order. More brings the next
 * rows of the same query. The search waits for the typing to stop.
 *
 * Each answer is kept with the query it was for, so a query still on its
 * way shows the last rows dimmed rather than nothing, and an answer that
 * arrives after the query has moved on is dropped.
 */
export function MyStories({ initial }: Props) {
  const preferences = useUserPreferences();
  const view: View = preferences.get(STORIES_VIEW_KEY) === "list" ? "list" : "cards";

  const [search, setSearch] = useState("");
  const [needle, setNeedle] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pendingFavorites, setPendingFavorites] = useState<ReadonlySet<number>>(new Set());
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // The search waits for the typing to stop, so a title is one query rather
  // than one per letter.
  useEffect(() => {
    const timer = setTimeout(() => setNeedle(search.trim()), STORY_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const sort = sorting[0];
  const query: Omit<MyStoryListQuery, "offset"> = {
    search: needle,
    showInactive,
    sortBy: (sort?.id ?? "recent") as StorySortKey,
    sortDesc: sort?.desc ?? true,
  };
  const key = JSON.stringify(query);

  const [listed, setListed] = useState<Listed>(() => ({
    key,
    stories: initial,
    hasMore: initial.length === MY_STORIES_PAGE_SIZE,
  }));
  // The key the rows on show belong to, read by the effect without making
  // the rows a reason to run it.
  const listedKey = useRef(listed.key);
  const remember = useCallback((next: Listed) => {
    listedKey.current = next.key;
    setListed(next);
  }, []);

  // A new query asks for its first page; the rows on show stay until it lands.
  useEffect(() => {
    if (listedKey.current === key) return;
    let live = true;
    sa_listMyStoryPage({ ...JSON.parse(key), offset: 0 }).then(
      (page) => {
        if (!live) return;
        remember({ key, stories: page, hasMore: page.length === MY_STORIES_PAGE_SIZE });
      },
      () => {
        if (live) setFailedKey(key);
      },
    );
    return () => {
      live = false;
    };
  }, [key, remember]);

  const loading = listed.key !== key && failedKey !== key;

  async function onMore() {
    setLoadingMore(true);
    try {
      const page = await sa_listMyStoryPage({ ...query, offset: listed.stories.length });
      if (listedKey.current !== key) return;
      const seen = new Set(listed.stories.map((story) => story.idStory));
      remember({
        key,
        stories: [...listed.stories, ...page.filter((story) => !seen.has(story.idStory))],
        hasMore: page.length === MY_STORIES_PAGE_SIZE,
      });
    } catch {
      // The button stays, so More can be pressed again.
    } finally {
      setLoadingMore(false);
    }
  }

  // The heart turns at once and turns back if the save is refused. A row
  // sorted by favorite stays where it is until the next query.
  const onToggleFavorite = useCallback(async (story: StoryCardData, isFavorite: boolean) => {
    const flip = (to: boolean) =>
      setListed((current) => ({
        ...current,
        stories: current.stories.map((s) =>
          s.idStory === story.idStory ? { ...s, isFavorite: to } : s,
        ),
      }));
    setPendingFavorites((p) => new Set(p).add(story.idStory));
    flip(isFavorite);
    try {
      await sa_setFavorite(story.idStory, isFavorite);
    } catch {
      flip(!isFavorite);
    } finally {
      setPendingFavorites((p) => {
        const next = new Set(p);
        next.delete(story.idStory);
        return next;
      });
    }
  }, []);

  const toggle = (
    <HStack role="group" aria-label="View" gap="1">
      {VIEWS.map((option) => (
        <Tooltip.Root key={option.view} openDelay={200} positioning={{ placement: "top" }}>
          <Tooltip.Trigger asChild>
            <IconButton
              type="button"
              aria-label={option.label}
              aria-pressed={view === option.view}
              size="sm"
              variant={view === option.view ? "solid" : "outline"}
              onClick={() => void preferences.set(STORIES_VIEW_KEY, option.view)}
            >
              {option.icon}
            </IconButton>
          </Tooltip.Trigger>
          <Portal>
            <Tooltip.Positioner>
              <Tooltip.Content>{option.label}</Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        </Tooltip.Root>
      ))}
    </HStack>
  );

  return (
    <Stack as="section" aria-labelledby="my-stories-heading" gap="4">
      {/* The title and its switch at the start; the search, New story and
          the view toggle at the far end of the same line. */}
      <HStack justify="space-between" align="center" wrap="wrap" gap="4">
        <HStack align="center" wrap="wrap" gap="6">
          <Heading id="my-stories-heading" size="xl">
            My Stories
          </Heading>
          <Switch.Root
            checked={showInactive}
            onCheckedChange={(details) => setShowInactive(details.checked)}
            size="sm"
          >
            {/* Chakra renders a checkbox input; role="switch" is the ARIA
                pattern for an on/off toggle and what tests query. */}
            <Switch.HiddenInput role="switch" />
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Label>Show inactive</Switch.Label>
          </Switch.Root>
        </HStack>
        <HStack gap="3" wrap="wrap" ms="auto">
          <InputGroup startElement={<Search size={14} />} w={{ base: "full", sm: "64" }}>
            <Input
              type="search"
              size="sm"
              aria-label="Search stories"
              placeholder="Search stories"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>
          <Button asChild>
            <NextLink href="/stories/new">New story</NextLink>
          </Button>
          {toggle}
        </HStack>
      </HStack>

      {failedKey === key && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              The stories could not be loaded. Change something to try again.
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <Box opacity={loading ? 0.6 : 1} transition="opacity 0.15s" aria-busy={loading}>
        {listed.stories.length === 0 ? (
          <Text color="fg.muted">
            {needle !== ""
              ? "No story matches that search."
              : "You have no stories yet. Start one with New story."}
          </Text>
        ) : view === "list" ? (
          <StoryTable
            stories={listed.stories}
            sorting={sorting}
            onSortingChange={setSorting}
            onToggleFavorite={onToggleFavorite}
            pendingFavorites={pendingFavorites}
          />
        ) : (
          <StoryCardGrid
            stories={listed.stories}
            onToggleFavorite={onToggleFavorite}
            pendingFavorites={pendingFavorites}
          />
        )}
      </Box>

      {listed.hasMore && !loading && (
        <Box>
          <Button variant="outline" onClick={() => void onMore()} loading={loadingMore}>
            More
            <ChevronsRight />
          </Button>
        </Box>
      )}
    </Stack>
  );
}
