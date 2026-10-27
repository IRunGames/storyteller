"use client";

import { useEffect, useState } from "react";
import { SimpleGrid, Skeleton, Text } from "@chakra-ui/react";
import { StoryCard } from "@/components/stories/story-card";
import type { StoryCardData } from "@/lib/stories";
import { sa_listOwnedStories, sa_listPlayingStories } from "./actions";

type Props = {
  /** Which stories: the ones the user tells, or the ones they play in. */
  list: "owned" | "playing";
  emptyText: string;
};

const LOADERS = { owned: sa_listOwnedStories, playing: sa_listPlayingStories };

/**
 * The My Stories and Playing tabs: the user's non-archived stories as the
 * Stories page draws them. Loaded when the tab is first shown rather than
 * with the dialog, since most openings never look at them. The cards carry no
 * favourite heart: the profile shows what someone tells and plays, and
 * favourites are managed on the Stories page.
 */
export function ProfileStoriesTab({ list, emptyText }: Props) {
  const [stories, setStories] = useState<StoryCardData[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    LOADERS[list]()
      .then((rows) => {
        if (current) setStories(rows);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [list]);

  if (failed) {
    return (
      <Text role="alert" color="fg.error">
        These stories could not be loaded. Close the profile and open it again.
      </Text>
    );
  }

  if (stories === null) {
    return (
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
        <Skeleton aspectRatio={4 / 3} rounded="xl" />
        <Skeleton aspectRatio={4 / 3} rounded="xl" />
      </SimpleGrid>
    );
  }

  if (stories.length === 0) return <Text color="fg.muted">{emptyText}</Text>;

  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
      {stories.map((story) => (
        <StoryCard key={story.idStory} story={story} />
      ))}
    </SimpleGrid>
  );
}
