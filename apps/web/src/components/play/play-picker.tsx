"use client";

import { useId, useState } from "react";
import NextLink from "next/link";
import { Field, HStack, Link, NativeSelect, Text } from "@chakra-ui/react";
import type { PlayableStory } from "@/app/(app)/(nav)/play/actions";
import { PlayButton } from "@/components/stories/story-play-button";

type Props = {
  /** The caller's active stories, newest first, loaded by the page. */
  stories: PlayableStory[];
};

// The way in from the Play primer: pick a story, press Play. A native select
// like the new-story form's, since the list is plain text and the browser's
// own control is the most accessible one on a phone.
//
// Play is the same control the story cards and the story page use
// (PlayButton): greyed out until a story is chosen, then the storyteller's
// opens the session popover, where they choose a session or make a new one,
// and a player's goes to the table, which sends them on to the waiting room
// if no session is open. It counts and glows for the chosen story as a card
// does.
export function PlayPicker({ stories }: Props) {
  const [idStory, setIdStory] = useState("");
  const storySelectId = useId();

  if (stories.length === 0) {
    return (
      <Text color="fg.muted">
        You are not in any story yet. Join one on the Stories page, or{" "}
        <Link asChild variant="underline">
          <NextLink href="/stories/new">start one</NextLink>
        </Link>
        .
      </Text>
    );
  }

  const story = stories.find((s) => String(s.idStory) === idStory) ?? null;

  return (
    <HStack align="flex-end" gap="3" wrap="wrap">
      <Field.Root maxW="sm">
        <Field.Label htmlFor={storySelectId}>My Story...</Field.Label>
        <NativeSelect.Root>
          <NativeSelect.Field
            id={storySelectId}
            value={idStory}
            onChange={(event) => setIdStory(event.target.value)}
          >
            <option value="">Choose a story</option>
            {stories.map((s) => (
              <option key={s.idStory} value={s.idStory}>
                {s.title}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>

      {/* Keyed by the story, so a popover left open for one never carries
          over to the next. */}
      <PlayButton key={story?.idStory ?? "none"} story={story} size="md" />
    </HStack>
  );
}
