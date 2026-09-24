"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Checkbox,
  HStack,
  Input,
  Popover,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { UserPlus } from "lucide-react";
import { PLAYER_SEARCH_DELAY_MS, type PlayerMatch, type StoryPlayer } from "@/lib/stories";
import { sa_addStoryPlayers, sa_searchPlayers } from "@/app/(app)/(nav)/stories/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  idGame: number;
  /** Called with the rows the action seated, so the list can show them. */
  onInvited: (added: StoryPlayer[]) => void;
};

// The Invite Players button under a story's players and the popover it
// opens: a search box, the matches as checkboxes, and Save or Cancel.
//
// The selection is a Map keyed by user id rather than a flag on each match,
// because the matches change with every search and a name ticked under one
// query must stay ticked when the next query no longer lists it. The
// summary line above the buttons is how the storyteller sees what is still
// chosen once it has scrolled out of the results.
export function InvitePlayersPopover({ idGame, onInvited }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<PlayerMatch[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Map<string, PlayerMatch>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  // Which search is the latest. A slow reply to an earlier query must not
  // overwrite the matches for what the box says now.
  const searchSeq = useRef(0);

  // The search runs a beat after the last keystroke rather than on each one,
  // so typing a name is one request, not one per letter. A blank box asks
  // nothing: there is no "everyone" list. Its matches are cleared in
  // onQueryChange, from the event, rather than here, so the effect never
  // sets state on its own.
  useEffect(() => {
    const needle = query.trim();
    const seq = ++searchSeq.current;
    if (needle === "") return;
    const timer = setTimeout(async () => {
      try {
        const found = await sa_searchPlayers(idGame, needle);
        if (seq !== searchSeq.current) return;
        setMatches(found);
        setSearched(true);
      } catch {
        // Leave the last matches in place; the next keystroke tries again.
      }
    }, PLAYER_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [idGame, query]);

  function onQueryChange(value: string) {
    setQuery(value);
    if (value.trim() === "") {
      setMatches([]);
      setSearched(false);
    }
  }

  function close() {
    setOpen(false);
    setQuery("");
    setMatches([]);
    setSearched(false);
    setSelected(new Map());
    setError(null);
  }

  function toggle(match: PlayerMatch, checked: boolean) {
    setSelected((current) => {
      const next = new Map(current);
      if (checked) next.set(match.idUser, match);
      else next.delete(match.idUser);
      return next;
    });
  }

  async function save() {
    if (selected.size === 0 || isSaving) return;
    setSaving(true);
    setError(null);
    try {
      const added = await sa_addStoryPlayers(idGame, [...selected.keys()]);
      onInvited(added);
      const count = selected.size;
      close();
      toaster.create({
        title: `Invited ${count} ${count === 1 ? "player" : "players"}.`,
        type: "success",
      });
    } catch {
      // The popover stays open with the selection intact so they can retry.
      setError("Could not invite the players. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const chosen = [...selected.values()].map((match) => match.name);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => (details.open ? setOpen(true) : close())}
      positioning={{ placement: "bottom-start" }}
    >
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus size={16} />
          Invite Players
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="sm">
            <Popover.Arrow />
            {/* Popover.Title, not bare text: it is what the dialog's
                aria-labelledby points at, so the popover gets a name. */}
            <Popover.Header fontWeight="semibold">
              <Popover.Title>Invite players</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              <Stack gap="4">
                {error && (
                  // role="alert", which Chakra's Alert does not set itself, so
                  // the failure is announced where the storyteller's focus is
                  // and the test can find it by role.
                  <Alert.Root role="alert" status="error" size="sm">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{error}</Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                )}

                <Input
                  type="search"
                  aria-label="Search players"
                  placeholder="Name, nickname or email"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                />

                {matches.length > 0 ? (
                  <Stack gap="2">
                    {matches.map((match) => (
                      <Checkbox.Root
                        key={match.idUser}
                        checked={selected.has(match.idUser)}
                        onCheckedChange={(details) => toggle(match, details.checked === true)}
                      >
                        <Checkbox.HiddenInput />
                        <Checkbox.Control />
                        <Checkbox.Label>
                          <HStack gap="2">
                            <Avatar.Root size="xs">
                              <Avatar.Fallback name={match.name} />
                              {match.image && <Avatar.Image src={match.image} alt="" />}
                            </Avatar.Root>
                            <Stack gap="0">
                              <Text textStyle="sm">{match.name}</Text>
                              <Text textStyle="xs" color="fg.muted">
                                {match.email}
                              </Text>
                            </Stack>
                          </HStack>
                        </Checkbox.Label>
                      </Checkbox.Root>
                    ))}
                  </Stack>
                ) : (
                  searched && (
                    <Text textStyle="sm" color="fg.muted">
                      No one matches.
                    </Text>
                  )
                )}

                {chosen.length > 0 && <Text textStyle="sm">Inviting: {chosen.join(", ")}</Text>}

                <HStack justify="flex-end" gap="2">
                  <Button type="button" variant="ghost" size="sm" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={save}
                    disabled={selected.size === 0}
                    loading={isSaving}
                  >
                    Save
                  </Button>
                </HStack>
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
