"use client";

import { useId, type ReactNode } from "react";
import { Box, Button, Grid, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { ChevronsRight } from "lucide-react";
import type { StoryCardData } from "@/lib/stories";
import { StoryCard } from "./story-card";

type Props = {
  title: string;
  /** Rendered on the heading row, beside the title: a filter switch, say. */
  headerControl?: ReactNode;
  /** Rendered at the far right of the heading row: a New story button, say. */
  headerAction?: ReactNode;
  /** What to say when there are no stories; a hint with a link, say. */
  emptyText?: ReactNode;
  stories: StoryCardData[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onMore: () => void;
  onToggleFavorite: (story: StoryCardData, isFavorite: boolean) => void;
  /** Ids whose favorite toggle is in flight; their hearts are disabled. */
  pendingFavorites: ReadonlySet<number>;
};

// One titled block of the Stories page. Purely presentational: StoriesBoard
// owns the lists, the paging and the favorite toggling, because a heart in
// one section changes what another section shows.
export function StorySection({
  title,
  headerControl,
  headerAction,
  emptyText = "Nothing here yet.",
  stories,
  hasMore,
  isLoadingMore,
  onMore,
  onToggleFavorite,
  pendingFavorites,
}: Props) {
  const headingId = useId();

  return (
    <Stack as="section" aria-labelledby={headingId} gap="4">
      {/* The control belongs to the title, so it sits beside it; the action
          is about the whole section and takes the far edge. */}
      <HStack justify="space-between" align="center" wrap="wrap" gap="4">
        <HStack align="center" wrap="wrap" gap="6">
          <Heading id={headingId} size="xl">
            {title}
          </Heading>
          {headerControl}
        </HStack>
        {headerAction}
      </HStack>

      {stories.length === 0 ? (
        <Text color="fg.muted">{emptyText}</Text>
      ) : (
        // Two regimes. Up to lg the grid has a fixed column count and the
        // cards stretch to fill it: one tall card on a phone, two on a
        // tablet. From lg up a card may grow only from 16rem to 20rem, and
        // any further width becomes another column rather than wider cards.
        <Grid
          templateColumns={{
            base: "1fr",
            md: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(auto-fill, minmax(16rem, 20rem))",
          }}
          gap="4"
        >
          {stories.map((story) => (
            <StoryCard
              key={story.idStory}
              story={story}
              onToggleFavorite={onToggleFavorite}
              favoritePending={pendingFavorites.has(story.idStory)}
            />
          ))}
        </Grid>
      )}

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
