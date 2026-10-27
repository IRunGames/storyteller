"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Popover, Stack, Text } from "@chakra-ui/react";
import { Plus } from "lucide-react";
import type { LikedSystem } from "@/lib/profile";
import { PLAYER_SEARCH_DELAY_MS } from "@/lib/stories";
import { sa_addLikedSystem, sa_searchSystems } from "./actions";

type Props = {
  /** Called with the whole liked list once a system has been added. */
  onAdded: (systems: LikedSystem[]) => void;
};

/**
 * The + Add System button on the Systems tab and the search it opens. The
 * popover lists systems as it opens and narrows them as the user types; a
 * click adds one at once, and it drops out of the matches because the search
 * never offers a system already liked. The popover stays open so several can
 * be added in a row.
 */
export function ProfileAddSystemPopover({ onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<LikedSystem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  // Which search is the latest, so a slow reply to an earlier query never
  // overwrites the matches for what the box says now.
  const searchSeq = useRef(0);

  // A beat after the last keystroke rather than on each one, as the
  // invite-players search does. Only while open: a closed popover asks for
  // nothing.
  useEffect(() => {
    if (!open) return;
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const found = await sa_searchSystems(query);
        if (seq === searchSeq.current) setMatches(found);
      } catch {
        // Leave the last matches in place; the next keystroke tries again.
      }
    }, PLAYER_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open, query]);

  function close() {
    setOpen(false);
    setQuery("");
    setMatches(null);
    setError(null);
  }

  async function add(system: LikedSystem) {
    if (adding !== null) return;
    setAdding(system.idSystem);
    setError(null);
    try {
      const result = await sa_addLikedSystem(system.idSystem);
      if (!result.ok) {
        setError(Object.values(result.errors)[0]);
        return;
      }
      onAdded(result.systems);
      setMatches((current) => current?.filter((m) => m.idSystem !== system.idSystem) ?? null);
    } catch {
      setError("The system could not be added. Try again.");
    } finally {
      setAdding(null);
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => (details.open ? setOpen(true) : close())}
      positioning={{ placement: "bottom-end" }}
    >
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm">
          <Plus />
          Add System
        </Button>
      </Popover.Trigger>
      {/* Not portalled, unlike the standards' other floating layers: it
          opens inside the profile dialog, which hides everything outside
          itself from assistive technology and traps focus within, so a
          portalled popover could be neither read nor typed into. */}
      <Popover.Positioner>
        <Popover.Content w="sm">
          <Popover.Arrow />
          <Popover.Header fontWeight="semibold">
            <Popover.Title>Add a system</Popover.Title>
          </Popover.Header>
          <Popover.Body pt="0">
            <Stack gap="3">
              {error && (
                <Alert.Root role="alert" status="error" size="sm">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              )}
              <Input
                type="search"
                size="sm"
                aria-label="Search systems"
                placeholder="Name, edition or setting"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {matches !== null &&
                (matches.length > 0 ? (
                  <Stack gap="0" maxH="64" overflowY="auto">
                    {matches.map((system) => (
                      <Button
                        key={system.idSystem}
                        variant="ghost"
                        size="sm"
                        justifyContent="flex-start"
                        fontWeight="normal"
                        loading={adding === system.idSystem}
                        onClick={() => void add(system)}
                      >
                        {system.label}
                      </Button>
                    ))}
                  </Stack>
                ) : (
                  <Text textStyle="sm" color="fg.muted">
                    No systems match.
                  </Text>
                ))}
            </Stack>
          </Popover.Body>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  );
}
