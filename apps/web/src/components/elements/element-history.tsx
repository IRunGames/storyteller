"use client";

import { useState } from "react";
import { Button, chakra, Heading, HStack, List, Stack, Text } from "@chakra-ui/react";
import { BookOpen, ChevronDown } from "lucide-react";
import { LocalDate } from "@/components/dates/local-date";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { sa_listElementHistory, type ElementHistoryRow } from "./actions";

type Props = {
  idStory: number;
  idElement: number;
  /** The scene the panel is on, left out of the list; null for none. */
  idStoryScene: number | null;
};

/**
 * The History section at the foot of an element's panel: a book and the
 * word, with a chevron at the end that opens it, turning over and going
 * solid while open as the pill's own chevron does (PrepIconButton
 * expanded). Open, it lists the story's other scenes the element has been
 * in, most recently played first (sa_listElementHistory), five at a time
 * with Load more under them. Read on first opening and kept, so closing
 * and opening again costs nothing.
 */
export function ElementHistory({ idStory, idElement, idStoryScene }: Props) {
  const [open, setOpen] = useState(false);
  // null until the first page has been read; `more` while a page is coming.
  const [rows, setRows] = useState<ElementHistoryRow[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load(offset: number) {
    setLoading(true);
    setFailed(false);
    try {
      const page = await sa_listElementHistory(idStory, idElement, idStoryScene, offset);
      if (page === null) {
        setFailed(true);
        return;
      }
      setRows((current) => [...(offset === 0 ? [] : (current ?? [])), ...page.rows]);
      setHasMore(page.hasMore);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows === null && !loading) void load(0);
  }

  return (
    <Stack gap="2">
      <HStack justify="space-between" gap="2">
        <HStack gap="2" color="fg.muted">
          <BookOpen size={16} />
          <Heading as="h3" size="xs" color="fg.muted">
            History
          </Heading>
        </HStack>
        <PrepIconButton label="History" expanded={open} onClick={toggle}>
          <chakra.span
            display="inline-flex"
            transition="transform 0.15s"
            transform={open ? "rotate(180deg)" : undefined}
          >
            <ChevronDown />
          </chakra.span>
        </PrepIconButton>
      </HStack>
      {open &&
        (failed && rows === null ? (
          <Text fontSize="sm" color="fg.muted">
            The history could not be read.
          </Text>
        ) : rows === null ? (
          <Text fontSize="sm" color="fg.muted">
            Loading…
          </Text>
        ) : rows.length === 0 ? (
          <Text fontSize="sm" color="fg.muted">
            Not in any other scene yet.
          </Text>
        ) : (
          <Stack gap="2">
            <List.Root gap="1" listStyleType="none" aria-label="History">
              {rows.map((row) => (
                <List.Item key={row.idStoryScene}>
                  <Text fontSize="sm" fontWeight="medium" truncate>
                    {row.title}
                  </Text>
                  {/* The sitting and the day it was played; a scene never
                      played has neither, and says so. */}
                  <Text fontSize="xs" color="fg.muted" truncate>
                    {row.at ? (
                      <>
                        {row.sessionHeading && <>{row.sessionHeading} · </>}
                        <LocalDate value={new Date(row.at)} />
                      </>
                    ) : (
                      "Not played yet"
                    )}
                  </Text>
                </List.Item>
              ))}
            </List.Root>
            {hasMore && (
              <Button
                size="xs"
                variant="outline"
                alignSelf="flex-start"
                loading={loading}
                onClick={() => void load(rows.length)}
              >
                Load more
              </Button>
            )}
          </Stack>
        ))}
    </Stack>
  );
}
