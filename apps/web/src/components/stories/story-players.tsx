"use client";

import { useState } from "react";
import { Avatar, Heading, HStack, List, Stack, Text } from "@chakra-ui/react";
import type { StoryPlayer } from "@/lib/stories";
import { InvitePlayersPopover } from "./invite-players-popover";
import { RemovePlayerButton } from "./remove-player-button";

type Props = {
  idStory: number;
  /** The id the section's aria-labelledby points at; the heading carries it. */
  headingId: string;
  /** Who is seated when the page loads; the popover adds to them from here. */
  initial: StoryPlayer[];
  /** The caller created the story, so they may invite players to it. */
  isOwner: boolean;
  /** The colour for secondary text; the story page passes the panel's. */
  mutedColor?: string;
};

// The Players section of a story's page: the heading, with the Invite
// Players popover beside it for the storyteller, and the list under them.
// The heading is here rather than in StoryDetails because the list is state:
// a save in the popover shows the new players at once, without a round trip
// through the page, and the popover and the list it feeds have to share an
// owner for that. The action returns the rows in the order the list keeps.
export function StoryPlayers({
  idStory,
  headingId,
  initial,
  isOwner,
  mutedColor = "fg.muted",
}: Props) {
  const [players, setPlayers] = useState(initial);

  return (
    <Stack gap="4">
      <HStack justify="space-between" gap="4">
        <Heading id={headingId} size="xl">
          Players
        </Heading>
        {isOwner && (
          <InvitePlayersPopover
            idStory={idStory}
            onInvited={(added) => setPlayers((current) => [...current, ...added])}
          />
        )}
      </HStack>

      {players.length === 0 ? (
        <Text color={mutedColor}>No players yet.</Text>
      ) : (
        // A table of people rather than a queue of them: the names flow
        // across the panel and wrap, so a party of six takes two lines
        // instead of six. Still a list to a screen reader, which is what it
        // is; only the layout changes.
        <List.Root
          listStyleType="none"
          display="flex"
          flexDirection="row"
          flexWrap="wrap"
          gap="3"
          columnGap="5"
        >
          {players.map((player) => (
            <List.Item key={player.idUser}>
              <HStack gap="2">
                <Avatar.Root size="sm">
                  <Avatar.Fallback name={player.name} />
                  {player.image && <Avatar.Image src={player.image} alt={player.name} />}
                </Avatar.Root>
                <Text whiteSpace="nowrap">{player.name}</Text>
                {/* The storyteller seats players and the storyteller unseats
                    them, so the button is theirs alone. */}
                {isOwner && (
                  <RemovePlayerButton
                    idStory={idStory}
                    player={player}
                    onRemoved={() =>
                      setPlayers((current) =>
                        current.filter((seated) => seated.idUser !== player.idUser),
                      )
                    }
                  />
                )}
              </HStack>
            </List.Item>
          ))}
        </List.Root>
      )}
    </Stack>
  );
}
