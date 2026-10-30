"use client";

import { useState } from "react";
import { Avatar, Heading, HStack, List, Stack, Text } from "@chakra-ui/react";
import type { StoryPlayer } from "@/lib/stories";
import { useUser } from "@/components/auth/user-provider";
import { EmailInvitePopover } from "./email-invite-popover";
import { InvitePlayersPopover } from "./invite-players-popover";
import { JoinStoryButton } from "./join-story-button";
import { LeaveStoryButton } from "./leave-story-button";
import { RemovePlayerButton } from "./remove-player-button";

type Props = {
  idStory: number;
  /** The id the section's aria-labelledby points at; the heading carries it. */
  headingId: string;
  /** Who is seated when the page loads; the popover adds to them from here. */
  initial: StoryPlayer[];
  /** The caller created the story, so they may invite players to it. */
  isOwner: boolean;
  /**
   * The story is looking for players and still active, so anyone without a
   * seat may take one. The storyteller and those already seated get no Join.
   */
  isOpenToJoin?: boolean;
  /** The colour for secondary text; the story page passes the panel's. */
  mutedColor?: string;
};

// The Players section of a story's page: the heading, with the Invite
// Players popover beside it for the storyteller (or Join for anyone else
// while the story is looking for players), and the list under them.
// The heading is here rather than in StoryDetails because the list is state:
// a save in the popover, or a Join, shows the new players at once, without a
// round trip through the page, and the buttons and the list they feed have
// to share an owner for that. The invite action returns the rows in the
// order the list keeps; a Join adds the caller at the end.
export function StoryPlayers({
  idStory,
  headingId,
  initial,
  isOwner,
  isOpenToJoin = false,
  mutedColor = "fg.muted",
}: Props) {
  const me = useUser();
  const [players, setPlayers] = useState(initial);
  const isSeated = players.some((player) => player.idUser === me.id);
  const drop = (idUser: string) =>
    setPlayers((current) => current.filter((seated) => seated.idUser !== idUser));

  return (
    <Stack gap="4">
      <HStack justify="space-between" gap="4">
        <Heading id={headingId} size="xl">
          Players
        </Heading>
        {isOpenToJoin && !isOwner && !isSeated && (
          <JoinStoryButton
            idStory={idStory}
            onJoined={(player) => setPlayers((current) => [...current, player])}
          />
        )}
        {isOwner && (
          <HStack gap="2" wrap="wrap" justify="flex-end">
            <EmailInvitePopover idStory={idStory} />
            <InvitePlayersPopover
              idStory={idStory}
              onInvited={(added) => setPlayers((current) => [...current, ...added])}
            />
          </HStack>
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
          {players.map((player) => {
            // The viewer's own seat: their picture, but "Me!" for the name,
            // and the one place they can give the seat up themselves.
            const isMe = player.idUser === me.id;
            return (
              <List.Item key={player.idUser}>
                <HStack gap="2">
                  <Avatar.Root size="sm">
                    <Avatar.Fallback name={player.name} />
                    {player.image && <Avatar.Image src={player.image} alt={player.name} />}
                  </Avatar.Root>
                  <Text whiteSpace="nowrap">{isMe ? "Me!" : player.name}</Text>
                  {isMe && (
                    <LeaveStoryButton idStory={idStory} onLeft={() => drop(player.idUser)} />
                  )}
                  {/* The storyteller seats players and the storyteller
                      unseats them, so the button is theirs alone. */}
                  {isOwner && (
                    <RemovePlayerButton
                      idStory={idStory}
                      player={player}
                      onRemoved={() => drop(player.idUser)}
                    />
                  )}
                </HStack>
              </List.Item>
            );
          })}
        </List.Root>
      )}
    </Stack>
  );
}
