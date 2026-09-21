"use client";

import { useState, useTransition } from "react";
import { Stack } from "@chakra-ui/react";
import {
  PAGE_SIZE,
  SECTION_ORDER,
  SECTION_TITLES,
  type SectionKey,
  type StoryCardData,
} from "@/lib/stories";
import { StorySection } from "./story-section";

type Loader = (offset: number) => Promise<StoryCardData[]>;

type Props = {
  initial: Record<SectionKey, StoryCardData[]>;
  /** Server actions, one per section; called with the number already shown. */
  loadMore: Record<SectionKey, Loader>;
  /** Server action that writes the caller's favorite. */
  setFavorite: (idGame: number, isFavorite: boolean) => Promise<{ isFavorite: boolean }>;
};

/**
 * One section's list and its paging bookkeeping. The invariant that matters:
 * `serverOffset` counts the rows the server has handed us, `stories.length` may
 * differ from it after an optimistic change (Favorites gains and loses cards
 * that never came from a page), and `hasMore` comes from the last page's
 * length. Only a loaded page moves `serverOffset`.
 */
type SectionState = {
  stories: StoryCardData[];
  serverOffset: number;
  hasMore: boolean;
  isLoadingMore: boolean;
};
type BoardState = Record<SectionKey, SectionState>;

function initialState(initial: Props["initial"]): BoardState {
  const state = {} as BoardState;
  for (const key of SECTION_ORDER) {
    const stories = initial[key];
    // A page shorter than PAGE_SIZE means the well is dry.
    state[key] = {
      stories,
      serverOffset: stories.length,
      hasMore: stories.length === PAGE_SIZE,
      isLoadingMore: false,
    };
  }
  return state;
}

/**
 * Applies a favorite change everywhere it shows: the heart on every copy of
 * the story, and membership of the Favorites list (prepended on add, removed
 * on remove). Pure, so the failure path can call it again with the old value.
 *
 * Deliberately leaves `serverOffset` alone: nothing here came from a page, so
 * the next More must still ask for the row after the last one the server sent.
 */
function withFavorite(state: BoardState, story: StoryCardData, isFavorite: boolean): BoardState {
  const flip = (list: StoryCardData[]) =>
    list.map((s) => (s.idGame === story.idGame ? { ...s, isFavorite } : s));

  const next = {} as BoardState;
  for (const key of SECTION_ORDER) next[key] = { ...state[key], stories: flip(state[key].stories) };

  const favorites = next.favorites.stories;
  if (isFavorite && !favorites.some((s) => s.idGame === story.idGame)) {
    next.favorites.stories = [{ ...story, isFavorite: true }, ...favorites];
  } else if (!isFavorite) {
    next.favorites.stories = favorites.filter((s) => s.idGame !== story.idGame);
  }
  return next;
}

// The Stories page below its header. Owns all three lists because a heart
// clicked in one section changes another; every write and every further page
// still goes through a server action that re-checks the session.
export function StoriesBoard({ initial, loadMore, setFavorite }: Props) {
  const [board, setBoard] = useState(() => initialState(initial));
  const [pendingFavorites, setPendingFavorites] = useState<ReadonlySet<number>>(new Set());
  const [, startTransition] = useTransition();

  function onMore(key: SectionKey) {
    // The server pages by row count, not by what the client happens to show:
    // an optimistic favorite would otherwise skip or repeat a row.
    const offset = board[key].serverOffset;
    setBoard((b) => ({ ...b, [key]: { ...b[key], isLoadingMore: true } }));
    startTransition(async () => {
      try {
        const page = await loadMore[key](offset);
        setBoard((b) => {
          // The page may still contain a card an optimistic favorite already
          // put in the list: keep one copy, so a story never appears twice.
          const seen = new Set(b[key].stories.map((s) => s.idGame));
          const fresh = page.filter((s) => !seen.has(s.idGame));
          return {
            ...b,
            [key]: {
              stories: [...b[key].stories, ...fresh],
              serverOffset: b[key].serverOffset + page.length,
              hasMore: page.length === PAGE_SIZE,
              isLoadingMore: false,
            },
          };
        });
      } catch {
        // Leave the section as it was; the button stays so they can retry.
        setBoard((b) => ({ ...b, [key]: { ...b[key], isLoadingMore: false } }));
      }
    });
  }

  function onToggleFavorite(story: StoryCardData, isFavorite: boolean) {
    if (pendingFavorites.has(story.idGame)) return;
    setPendingFavorites((p) => new Set(p).add(story.idGame));
    setBoard((b) => withFavorite(b, story, isFavorite));
    startTransition(async () => {
      try {
        await setFavorite(story.idGame, isFavorite);
      } catch {
        // Put it back the way it was.
        setBoard((b) => withFavorite(b, story, !isFavorite));
      } finally {
        setPendingFavorites((p) => {
          const next = new Set(p);
          next.delete(story.idGame);
          return next;
        });
      }
    });
  }

  return (
    <Stack gap="10">
      {SECTION_ORDER.map((key) => {
        const { stories, hasMore, isLoadingMore } = board[key];
        // Favorites earn their place at the top; an empty block there would
        // only push My Stories down for everyone who has not hearted anything.
        // But an empty list with more on the server is a paging state, not an
        // empty one — keep the section so its More button can fetch the rest.
        if (key === "favorites" && stories.length === 0 && !hasMore) return null;
        return (
          <StorySection
            key={key}
            title={SECTION_TITLES[key]}
            stories={stories}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onMore={() => onMore(key)}
            onToggleFavorite={onToggleFavorite}
            pendingFavorites={pendingFavorites}
          />
        );
      })}
    </Stack>
  );
}
