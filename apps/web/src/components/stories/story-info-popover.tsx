"use client";

import { Image, Stack, Text } from "@chakra-ui/react";
import { formatPlayerCount, systemLabel, type StoryCardData } from "@/lib/stories";
import { sa_getStory } from "@/app/(app)/(nav)/stories/actions";
import { InfoPopover } from "@/components/popovers/info-popover";
import { LocalDate } from "@/components/dates/local-date";

type Props = {
  idStory: number;
  /** The button's colour, for a caller on a panel of its own. */
  color?: string;
};

// What the info button beside a story's name opens: its cover, system,
// storyteller, players, when it was last played and its summary, as the
// story page lists them. InfoPopover owns the button, the panel and the
// fetch; the button beside the heading opens the story's own page in a new
// tab, so a table left open stays where it is.
export function StoryInfoPopover({ idStory, color }: Props) {
  return (
    <InfoPopover<StoryCardData>
      label="Story info"
      color={color}
      load={() => sa_getStory(idStory)}
      missingText="This story is no longer here."
      errorText="Could not load the story."
      heading={(story) => story?.title ?? "Story"}
      popoutHref={`/stories/${idStory}`}
    >
      {(story) => <StoryDetail story={story} />}
    </InfoPopover>
  );
}

function StoryDetail({ story }: { story: StoryCardData }) {
  const system = systemLabel(story);
  return (
    <Stack gap="3">
      {story.imageUrl && (
        // Decoration beside a heading that already names the story, so the
        // alt is empty and the image reads as presentation.
        // Shown whole, at the panel's width and its own height, rather than
        // cropped to a strip: the panel scrolls when it runs long.
        <Image src={story.imageUrl} alt="" rounded="md" w="full" h="auto" />
      )}
      <Stack gap="0" textStyle="sm" color="fg.muted">
        {system && <Text>{system}</Text>}
        {story.storytellerName && <Text>Storyteller: {story.storytellerName}</Text>}
        <Text>{formatPlayerCount(story.playerCount)}</Text>
        <Text>
          Last played: <LocalDate value={story.lastPlayed} />
        </Text>
      </Stack>
      {story.summary && (
        <Text textStyle="sm" whiteSpace="pre-wrap">
          {story.summary}
        </Text>
      )}
    </Stack>
  );
}
