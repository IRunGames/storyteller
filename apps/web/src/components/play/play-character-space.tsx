"use client";

import type { ReactNode } from "react";
import { Box, Grid, Heading, Stack, Text } from "@chakra-ui/react";
import { PlaySampleCharacter } from "./play-sample-character";

type Props = {
  /** The panel's id, which the header's Character toggle points at. */
  id: string;
};

// The bottom of the table's left side: the player's character, then what
// they know about them and about the game so far. All placeholders until
// characters and notes are stored; each says what it will hold. Side by side
// on a wide window, stacked on a narrow one, where the panel scrolls.
export function PlayCharacterSpace({ id }: Props) {
  return (
    <Box as="section" id={id} aria-labelledby={`${id}-heading`} p="4">
      {/* The panel is named for a screen reader; sighted readers see the
          three parts' own headings, which say the same thing. */}
      <Heading id={`${id}-heading`} srOnly>
        Character
      </Heading>
      <Grid
        templateColumns={{ base: "1fr", lg: "minmax(18rem, 24rem) 1fr 1fr" }}
        gap="6"
        alignItems="start"
      >
        <PlaySampleCharacter />
        <PlaceholderSection title="Character background">
          Who your character was before the story began: where they come from, what they want, and
          the people and secrets they carry with them.
        </PlaceholderSection>
        <PlaceholderSection title="Scene / session notes">
          Your notes on the scene being played and on the session so far: names, clues, promises
          made, and the questions still open.
        </PlaceholderSection>
      </Grid>
    </Box>
  );
}

function PlaceholderSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="2">
      <Heading as="h3" size="sm">
        {title}
      </Heading>
      <Box borderWidth="1px" borderStyle="dashed" rounded="lg" p="4" minH="32">
        <Text textStyle="sm" color="fg.muted">
          {children}
        </Text>
      </Box>
    </Stack>
  );
}
