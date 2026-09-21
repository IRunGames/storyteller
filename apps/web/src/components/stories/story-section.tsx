"use client";

import { useId } from "react";
import { Box, Button, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { StoryCardData } from "@/lib/stories";
import { StoryCard } from "./story-card";

type Props = {
  title: string;
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
      <Heading id={headingId} size="xl">
        {title}
      </Heading>

      {stories.length === 0 ? (
        <Text color="fg.muted">Nothing here yet.</Text>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} gap="4">
          {stories.map((story) => (
            <StoryCard
              key={story.idGame}
              story={story}
              onToggleFavorite={onToggleFavorite}
              favoritePending={pendingFavorites.has(story.idGame)}
            />
          ))}
        </SimpleGrid>
      )}

      {hasMore && (
        <Box>
          <Button variant="outline" onClick={onMore} loading={isLoadingMore} loadingText="More">
            More
          </Button>
        </Box>
      )}
    </Stack>
  );
}
