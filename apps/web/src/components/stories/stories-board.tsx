"use client";

import { useState, useTransition } from "react";
import { PAGE_SIZE, SECTION_EMPTY_TEXT, SECTION_TITLES, type StoryCardData } from "@/lib/stories";
import { sa_listLookingForPlayers } from "@/app/(app)/(nav)/stories/actions";
import { StorySection } from "./story-section";
import { useFavorites } from "./use-favorites";

type Props = {
  /** The first page of stories looking for players, as the page loaded it. */
  initial: StoryCardData[];
};

/**
 * The list on Find a Story: every active story whose storyteller has opened
 * it to new players, paged with More (sa_listLookingForPlayers). The
 * invariant that matters for paging: `serverOffset` counts the rows the
 * server has handed over, and `hasMore` comes from the last page's length;
 * only a loaded page moves `serverOffset`.
 *
 * A heart here fills at once and goes back if the save is refused
 * (useFavorites); the story lands on the Stories page's Favorites, which is
 * not on this page, so nothing else moves.
 */
export function StoriesBoard({ initial }: Props) {
  const [stories, setStories] = useState(initial);
  // A page shorter than PAGE_SIZE means the well is dry.
  const [paging, setPaging] = useState({
    serverOffset: initial.length,
    hasMore: initial.length === PAGE_SIZE,
    isLoadingMore: false,
  });
  const favorites = useFavorites((story, isFavorite) =>
    setStories((current) =>
      current.map((s) => (s.idStory === story.idStory ? { ...s, isFavorite } : s)),
    ),
  );
  const [, startTransition] = useTransition();

  function onMore() {
    // The server pages by row count, not by what the client happens to show.
    const offset = paging.serverOffset;
    setPaging((p) => ({ ...p, isLoadingMore: true }));
    startTransition(async () => {
      try {
        const page = await sa_listLookingForPlayers(offset);
        setStories((current) => {
          // A story the list already holds is kept once, so none appears twice.
          const seen = new Set(current.map((s) => s.idStory));
          return [...current, ...page.filter((s) => !seen.has(s.idStory))];
        });
        setPaging((p) => ({
          serverOffset: p.serverOffset + page.length,
          hasMore: page.length === PAGE_SIZE,
          isLoadingMore: false,
        }));
      } catch {
        // Leave the list as it was; the button stays so they can retry.
        setPaging((p) => ({ ...p, isLoadingMore: false }));
      }
    });
  }

  return (
    <StorySection
      title={SECTION_TITLES.open}
      emptyText={SECTION_EMPTY_TEXT.open}
      stories={stories}
      hasMore={paging.hasMore}
      isLoadingMore={paging.isLoadingMore}
      onMore={onMore}
      onToggleFavorite={favorites.toggle}
      pendingFavorites={favorites.pending}
    />
  );
}
