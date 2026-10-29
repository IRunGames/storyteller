"use client";

import { useState } from "react";
import { Badge, Button, HStack, IconButton, List, Spinner, Stack, Text } from "@chakra-ui/react";
import { UserX } from "lucide-react";
import {
  sa_listLinkPlayers,
  sa_removeLinkPlayer,
  type LinkPlayer,
  type LinkPlayerStatus,
} from "@/app/(app)/run/[id]/actions";

const STATUS_TEXT: Record<NonNullable<LinkPlayerStatus>, string> = {
  PRESENT: "At the table",
  AWAY: "Away",
  WAITING: "Waiting",
  LEFT: "Left",
};

/**
 * The bottom of the link button's popover: who has come in by the link,
 * where each is, and a way to take them out. Nothing is loaded until the
 * storyteller asks, since most opens of the popover are to copy the link.
 *
 * Removing asks first, in the row itself: the remove button gives way to
 * Remove and Keep. A guest removed is deleted, so the question says so.
 * `onRemoved` lets the button recount its chip.
 */
export function LinkPlayers({ idStory, onRemoved }: { idStory: number; onRemoved: () => void }) {
  const [players, setPlayers] = useState<LinkPlayer[] | "loading" | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  async function load() {
    setPlayers("loading");
    setFailed(false);
    try {
      setPlayers(await sa_listLinkPlayers(idStory));
    } catch {
      setPlayers(null);
      setFailed(true);
    }
  }

  async function remove(player: LinkPlayer) {
    setRemoving(player.idUser);
    try {
      const result = await sa_removeLinkPlayer(idStory, player.idUser);
      if (!result.ok) setFailed(true);
    } catch {
      setFailed(true);
    }
    setRemoving(null);
    setConfirming(null);
    onRemoved();
    await load();
  }

  if (players === null) {
    return (
      <Stack gap="2" align="start">
        {failed && (
          <Text textStyle="sm" color="fg.error">
            Who joined could not be loaded.
          </Text>
        )}
        <Button size="xs" variant="outline" onClick={() => void load()}>
          Show who joined
        </Button>
      </Stack>
    );
  }
  if (players === "loading") return <Spinner size="sm" aria-label="Getting who joined" />;

  return (
    <Stack gap="2">
      <Text textStyle="sm" fontWeight="semibold">
        Joined by the link
      </Text>
      {failed && (
        <Text textStyle="sm" color="fg.error">
          That could not be done. Try again.
        </Text>
      )}
      {players.length === 0 ? (
        <Text textStyle="sm" color="fg.muted">
          No one has joined by the link yet.
        </Text>
      ) : (
        <List.Root variant="plain" gap="1" aria-label="Joined by the link">
          {players.map((player) => (
            <List.Item key={player.idUser}>
              {confirming === player.idUser ? (
                <HStack gap="2" w="full">
                  <Text textStyle="sm" flex="1" minW="0">
                    {player.isGuest
                      ? `Remove ${player.name}? A guest is deleted.`
                      : `Remove ${player.name} from the story?`}
                  </Text>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setConfirming(null)}
                    disabled={removing !== null}
                  >
                    Keep
                  </Button>
                  <Button
                    size="xs"
                    colorPalette="red"
                    onClick={() => void remove(player)}
                    loading={removing === player.idUser}
                  >
                    Remove
                  </Button>
                </HStack>
              ) : (
                <HStack gap="2" w="full">
                  <Text textStyle="sm" flex="1" minW="0" truncate>
                    {player.name}
                  </Text>
                  {player.isGuest && (
                    <Badge size="sm" variant="subtle">
                      Guest
                    </Badge>
                  )}
                  <Text textStyle="xs" color="fg.muted">
                    {player.status ? STATUS_TEXT[player.status] : "Not here"}
                  </Text>
                  <IconButton
                    aria-label={`Remove ${player.name}`}
                    size="2xs"
                    variant="ghost"
                    onClick={() => setConfirming(player.idUser)}
                  >
                    <UserX />
                  </IconButton>
                </HStack>
              )}
            </List.Item>
          ))}
        </List.Root>
      )}
    </Stack>
  );
}
