"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Stack, Switch } from "@chakra-ui/react";
import {
  PAGE_SIZE,
  SECTION_EMPTY_TEXT,
  SECTION_TITLES,
  type SectionKey,
  type StoryCardData,
} from "@/lib/stories";
import { StorySection } from "./story-section";

type Loader = (offset: number) => Promise<StoryCardData[]>;

/**
 * Server actions, one per section; called with the number already shown.
 * My Stories also takes the "Show inactive" switch's state.
 */
type Loaders = {
  favorites: Loader;
  mine: (offset: number, showInactive: boolean) => Promise<StoryCardData[]>;
  open: Loader;
};

// K is the sections a page shows (STORIES_SECTIONS, FIND_SECTIONS), so a page
// must hand over exactly the first pages and loaders for those and no others.
type Props<K extends SectionKey> = {
  /** Which blocks to show, in order. */
  sections: readonly K[];
  initial: Record<K, StoryCardData[]>;
  loadMore: Pick<Loaders, K>;
  /** Something for a section's heading row, far right: the New story button. */
  headerActions?: Partial<Record<K, ReactNode>>;
  /** Server action that writes the caller's favorite. */
  setFavorite: (idStory: number, isFavorite: boolean) => Promise<{ isFavorite: boolean }>;
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
type BoardState<K extends SectionKey> = Record<K, SectionState>;

function initialState<K extends SectionKey>(
  sections: readonly K[],
  initial: Record<K, StoryCardData[]>,
): BoardState<K> {
  const state = {} as BoardState<K>;
  for (const key of sections) {
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
 * on remove) when that list is on the page. Pure, so the failure path can call
 * it again with the old value.
 *
 * Deliberately leaves `serverOffset` alone: nothing here came from a page, so
 * the next More must still ask for the row after the last one the server sent.
 */
function withFavorite<K extends SectionKey>(
  state: BoardState<K>,
  sections: readonly K[],
  story: StoryCardData,
  isFavorite: boolean,
): BoardState<K> {
  const flip = (list: StoryCardData[]) =>
    list.map((s) => (s.idStory === story.idStory ? { ...s, isFavorite } : s));

  const next = {} as BoardState<K>;
  for (const key of sections) next[key] = { ...state[key], stories: flip(state[key].stories) };

  // Widened because a generic K cannot say whether "favorites" is among the
  // keys; on Find a Story it is not, and the heart just fills.
  const favorites: SectionState | undefined = (next as Partial<BoardState<SectionKey>>).favorites;
  if (!favorites) return next;

  if (isFavorite && !favorites.stories.some((s) => s.idStory === story.idStory)) {
    favorites.stories = [{ ...story, isFavorite: true }, ...favorites.stories];
  } else if (!isFavorite) {
    favorites.stories = favorites.stories.filter((s) => s.idStory !== story.idStory);
  }
  return next;
}

// The Stories page and Find a Story below their headers. Owns every list it
// shows because a heart clicked in one section changes another; every write
// and every further page still goes through a server action that re-checks
// the session.
export function StoriesBoard<K extends SectionKey>({
  sections,
  initial,
  loadMore,
  headerActions,
  setFavorite,
}: Props<K>) {
  const [board, setBoard] = useState(() => initialState(sections, initial));
  const [pendingFavorites, setPendingFavorites] = useState<ReadonlySet<number>>(new Set());
  const [showInactive, setShowInactive] = useState(false);
  const [, startTransition] = useTransition();

  // Widened to every loader: `sections` and `loadMore` share K, so a shown
  // section always has its loader, but a generic K cannot tell TypeScript
  // which key carries the loader with the extra argument. My Stories is the
  // one whose result depends on client state, bound here so the paging code
  // below does not need to know which section has a switch.
  function load(key: K, offset: number, inactive = showInactive) {
    const loaders = loadMore as Loaders;
    const byKey: Record<SectionKey, Loader> = {
      favorites: loaders.favorites,
      mine: (o) => loaders.mine(o, inactive),
      open: loaders.open,
    };
    return byKey[key](offset);
  }

  function onMore(key: K) {
    // The server pages by row count, not by what the client happens to show:
    // an optimistic favorite would otherwise skip or repeat a row.
    const offset = board[key].serverOffset;
    setBoard((b) => ({ ...b, [key]: { ...b[key], isLoadingMore: true } }));
    startTransition(async () => {
      try {
        const page = await load(key, offset);
        setBoard((b) => {
          // The page may still contain a card an optimistic favorite already
          // put in the list: keep one copy, so a story never appears twice.
          const seen = new Set(b[key].stories.map((s) => s.idStory));
          const fresh = page.filter((s) => !seen.has(s.idStory));
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

  // Flipping the switch changes which rows the server counts, so My Stories
  // starts over from offset 0 rather than paging on from where it was.
  function onToggleInactive(inactive: boolean) {
    // Only ever called from the switch, which only My Stories renders.
    const mine = "mine" as K;
    setShowInactive(inactive);
    setBoard((b) => ({ ...b, [mine]: { ...b[mine], isLoadingMore: true } }));
    startTransition(async () => {
      try {
        const page = await load(mine, 0, inactive);
        setBoard((b) => ({
          ...b,
          [mine]: {
            stories: page,
            serverOffset: page.length,
            hasMore: page.length === PAGE_SIZE,
            isLoadingMore: false,
          },
        }));
      } catch {
        // Keep what was showing; the switch still reflects the request, so
        // flipping it again retries.
        setBoard((b) => ({ ...b, [mine]: { ...b[mine], isLoadingMore: false } }));
      }
    });
  }

  function onToggleFavorite(story: StoryCardData, isFavorite: boolean) {
    if (pendingFavorites.has(story.idStory)) return;
    setPendingFavorites((p) => new Set(p).add(story.idStory));
    setBoard((b) => withFavorite(b, sections, story, isFavorite));
    startTransition(async () => {
      try {
        await setFavorite(story.idStory, isFavorite);
      } catch {
        // Put it back the way it was.
        setBoard((b) => withFavorite(b, sections, story, !isFavorite));
      } finally {
        setPendingFavorites((p) => {
          const next = new Set(p);
          next.delete(story.idStory);
          return next;
        });
      }
    });
  }

  return (
    <Stack gap="10">
      {sections.map((key) => {
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
            emptyText={SECTION_EMPTY_TEXT[key]}
            headerControl={
              key === "mine" ? (
                <Switch.Root
                  checked={showInactive}
                  onCheckedChange={(details) => onToggleInactive(details.checked)}
                  size="sm"
                >
                  {/* Chakra renders a checkbox input; role="switch" is the
                      ARIA pattern for an on/off toggle and what tests query. */}
                  <Switch.HiddenInput role="switch" />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Label>Show inactive</Switch.Label>
                </Switch.Root>
              ) : undefined
            }
            headerAction={headerActions?.[key]}
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
