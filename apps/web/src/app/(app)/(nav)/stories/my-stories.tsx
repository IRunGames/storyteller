"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import {
  Box,
  Button,
  Heading,
  HStack,
  Input,
  InputGroup,
  Stack,
  Switch,
  Text,
} from "@chakra-ui/react";
import type { SortingState } from "@tanstack/react-table";
import { ChevronsRight, Search } from "lucide-react";
import { STORY_SEARCH_DELAY_MS } from "@/lib/search";
import { PAGE_SIZE, SECTION_TITLES, type StoryCardData } from "@/lib/stories";
import {
  MY_STORIES_PAGE_SIZE,
  type MyStoryListQuery,
  type StorySortKey,
} from "@/lib/story-list-schemas";
import { sa_listFavoriteStories, sa_listMyStoryPage } from "@/components/stories/actions";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { STORIES_VIEW_KEY } from "@/lib/preference-keys";
import { FormError } from "@/components/forms/form-error";
import { WithTooltip } from "@/components/buttons/with-tooltip";
import { ViewToggle, type CardsOrList } from "@/components/buttons/view-toggle";
import { activeStoryLimitMessage, type StoryAllowance } from "@/lib/story-limits";
import { StoryCardGrid, StorySection } from "@/components/stories/story-section";
import { useFavorites } from "@/components/stories/use-favorites";
import { StoryTable } from "./story-table";

type View = CardsOrList;

/** The stories a query brought, with the query they are for. */
type Listed = { key: string; stories: StoryCardData[]; hasMore: boolean };

/**
 * The favorites on show. `serverOffset` counts the rows the server has sent,
 * which a heart does not change, so the next page starts after the last row
 * sent rather than after the last card on show.
 */
type Favorites = { stories: StoryCardData[]; serverOffset: number; hasMore: boolean };

type Props = {
  /** The first page, as the page loaded it with the default query. */
  initial: StoryCardData[];
  /** The first page of the user's favorites, for the Favorites section. */
  initialFavorites: StoryCardData[];
  /**
   * The active stories the user owns and how many they may (sa_getStoryAllowance):
   * New story is closed at the limit, and opens again as one is made inactive here.
   */
  allowance: StoryAllowance;
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
 *
 * In Icon view the user's favorites also come first, as a Favorites section
 * of their own (sa_listFavoriteStories) that is left out while there are
 * none; the List view has its Favorite column instead. The search and Show
 * inactive are My Stories' alone. A heart on either list changes both.
 */
export function MyStories({ initial, initialFavorites, allowance }: Props) {
  const preferences = useUserPreferences();
  const view: View = preferences.get(STORIES_VIEW_KEY) === "list" ? "list" : "cards";

  const [search, setSearch] = useState("");
  const [needle, setNeedle] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [favorites, setFavorites] = useState<Favorites>(() => ({
    stories: initialFavorites,
    serverOffset: initialFavorites.length,
    hasMore: initialFavorites.length === PAGE_SIZE,
  }));
  const [loadingMoreFavorites, setLoadingMoreFavorites] = useState(false);

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

  // A story retired or brought back from its status pill keeps its row,
  // with the new state: taking a retired one out from under the pill would
  // lose the way to bring it back. The next search lists it as it now is.
  // The user's own active stories, kept up as the pills move them, so New
  // story opens the moment one is made inactive. A story they play in but do
  // not run is not theirs to count.
  const [activeOwned, setActiveOwned] = useState(allowance.active);
  const canCreate = activeOwned < allowance.limit;
  const onActiveChange = useCallback((story: StoryCardData, isActive: boolean) => {
    setListed((current) => ({
      ...current,
      stories: current.stories.map((s) => (s.idStory === story.idStory ? { ...s, isActive } : s)),
    }));
    if (story.isOwner && story.isActive !== isActive) {
      setActiveOwned((count) => count + (isActive ? 1 : -1));
    }
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

  async function onMoreFavorites() {
    setLoadingMoreFavorites(true);
    try {
      const page = await sa_listFavoriteStories(favorites.serverOffset);
      setFavorites((current) => {
        // A heart may already have put a story of this page on show.
        const seen = new Set(current.stories.map((story) => story.idStory));
        return {
          stories: [...current.stories, ...page.filter((story) => !seen.has(story.idStory))],
          serverOffset: current.serverOffset + page.length,
          hasMore: page.length === PAGE_SIZE,
        };
      });
    } catch {
      // The button stays, so More can be pressed again.
    } finally {
      setLoadingMoreFavorites(false);
    }
  }

  // The heart turns at once and turns back if the save is refused
  // (useFavorites). A row sorted by favorite stays where it is until the
  // next query, while the Favorites section gains the story at its top or
  // loses it at once.
  const { pending: pendingFavorites, toggle: onToggleFavorite } = useFavorites((story, to) => {
    setListed((current) => ({
      ...current,
      stories: current.stories.map((s) =>
        s.idStory === story.idStory ? { ...s, isFavorite: to } : s,
      ),
    }));
    setFavorites((current) => {
      const others = current.stories.filter((s) => s.idStory !== story.idStory);
      return { ...current, stories: to ? [{ ...story, isFavorite: true }, ...others] : others };
    });
  });

  const toggle = (
    <ViewToggle value={view} onChange={(next) => void preferences.set(STORIES_VIEW_KEY, next)} />
  );

  // A section with no cards but more on the server is part way through
  // paging, not empty, so it stays for its More.
  const showFavorites = view === "cards" && (favorites.stories.length > 0 || favorites.hasMore);

  return (
    <Stack gap="10">
      {showFavorites && (
        <StorySection
          title={SECTION_TITLES.favorites}
          stories={favorites.stories}
          hasMore={favorites.hasMore}
          isLoadingMore={loadingMoreFavorites}
          onMore={() => void onMoreFavorites()}
          onToggleFavorite={onToggleFavorite}
          pendingFavorites={pendingFavorites}
        />
      )}
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
            {canCreate ? (
              <Button asChild>
                <NextLink href="/stories/new">New story</NextLink>
              </Button>
            ) : (
              // aria-disabled rather than disabled, so the tooltip that says
              // why still opens on hover and on focus.
              <WithTooltip tooltip={activeStoryLimitMessage(allowance.limit)}>
                <Button aria-disabled opacity={0.5} cursor="not-allowed">
                  New story
                </Button>
              </WithTooltip>
            )}
            {toggle}
          </HStack>
        </HStack>

        {failedKey === key && (
          <FormError message="The stories could not be loaded. Change something to try again." />
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
              onActiveChange={onActiveChange}
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
    </Stack>
  );
}
