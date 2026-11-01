"use client";

import { useState, useTransition } from "react";
import NextLink from "next/link";
import { Button, Link } from "@chakra-ui/react";
import { PAGE_SIZE, SECTION_TITLES, type StoryCardData } from "@/lib/stories";
import { withRedirect } from "@/lib/safe-redirect";
import { USER_TYPES } from "@/lib/user-types";
import { UserTypeVisibility } from "@/components/auth/user-type-visibility";
import { StorySection } from "@/components/stories/story-section";
import { sa_listFavoriteStories, sa_setFavorite } from "@/app/(app)/(nav)/stories/actions";

type Props = {
  /** The first page of the caller's favorites, loaded by the page. */
  initial: StoryCardData[];
};

// The home page's Favorites block. A cut-down StoriesBoard: only one
// list, and every card on it is a favorite, so a heart click can only ever
// remove. The bookkeeping rule is the same one the board follows —
// `serverOffset` counts rows the server sent, not cards on screen, so a
// removal never makes the next page skip a row.
export function HomeFavorites({ initial }: Props) {
  const [stories, setStories] = useState(initial);
  const [serverOffset, setServerOffset] = useState(initial.length);
  const [hasMore, setHasMore] = useState(initial.length === PAGE_SIZE);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [pendingFavorites, setPendingFavorites] = useState<ReadonlySet<number>>(new Set());
  const [, startTransition] = useTransition();

  function onMore() {
    const offset = serverOffset;
    setLoadingMore(true);
    startTransition(async () => {
      try {
        const page = await sa_listFavoriteStories(offset);
        setStories((current) => {
          const seen = new Set(current.map((s) => s.idStory));
          return [...current, ...page.filter((s) => !seen.has(s.idStory))];
        });
        setServerOffset(offset + page.length);
        setHasMore(page.length === PAGE_SIZE);
      } catch {
        // Leave the list as it was; the button stays so they can retry.
      } finally {
        setLoadingMore(false);
      }
    });
  }

  function onToggleFavorite(story: StoryCardData, isFavorite: boolean) {
    if (isFavorite || pendingFavorites.has(story.idStory)) return;
    setPendingFavorites((p) => new Set(p).add(story.idStory));
    const before = stories;
    setStories((current) => current.filter((s) => s.idStory !== story.idStory));
    startTransition(async () => {
      try {
        await sa_setFavorite(story.idStory, false);
      } catch {
        // Put the card back where it was.
        setStories(before);
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
    <StorySection
      title={SECTION_TITLES.favorites}
      emptyText={
        <>
          Nothing here yet. Heart a story on the{" "}
          <Link asChild variant="underline">
            <NextLink href="/stories">Stories page</NextLink>
          </Link>{" "}
          and it will show up here.
        </>
      }
      // A storyteller with nothing hearted yet is likely new, so the way to
      // their first story is right here. New story lands on the story's own
      // page as a rule; from here it goes on to the Stories page, where the
      // story sits among the rest and the hearts are. Players never see
      // it: they have no stories to create.
      emptyAction={
        <UserTypeVisibility showAbove={USER_TYPES.paidPlayer}>
          <Button asChild size="sm" variant="outline">
            <NextLink href={withRedirect("/stories/new", "/stories")}>
              Go create your first story
            </NextLink>
          </Button>
        </UserTypeVisibility>
      }
      stories={stories}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      onMore={onMore}
      onToggleFavorite={onToggleFavorite}
      pendingFavorites={pendingFavorites}
    />
  );
}
