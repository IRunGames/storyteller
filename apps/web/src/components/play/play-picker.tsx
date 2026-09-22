"use client";

import { useId, useState } from "react";
import NextLink from "next/link";
import {
  Button,
  Field,
  HStack,
  Link,
  NativeSelect,
  Text,
} from "@chakra-ui/react";
import type { PlayableStory } from "@/app/(app)/(nav)/play/actions";

type Props = {
  /** The caller's active stories, loaded by the page. */
  stories: PlayableStory[];
};

// The way in from the Play primer: pick a story, press Play. A native select
// like the new-story form's, since the list is plain text and the browser's
// own control is the most accessible one on a phone.
//
// Play is a real link once a story is chosen, so the browser can open it in a
// new tab and middle-click works. Before that it is a disabled button rather
// than an aria-disabled link: a link with no href to give is not a link, and
// nothing here needs to stay focusable while there is nothing to do.
export function PlayPicker({ stories }: Props) {
  const [idGame, setIdGame] = useState("");
  const selectId = useId();

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

  return (
    <HStack align="flex-end" gap="3" wrap="wrap">
      <Field.Root maxW="sm">
        <Field.Label htmlFor={selectId}>Story</Field.Label>
        <NativeSelect.Root>
          <NativeSelect.Field
            id={selectId}
            value={idGame}
            onChange={(event) => setIdGame(event.target.value)}
          >
            <option value="">Choose a story</option>
            {stories.map((story) => (
              <option key={story.idGame} value={story.idGame}>
                {story.gameTitle}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>

      {idGame ? (
        <Button asChild>
          <NextLink href={`/play/${idGame}`}>Play</NextLink>
        </Button>
      ) : (
        <Button disabled>Play</Button>
      )}
    </HStack>
  );
}
