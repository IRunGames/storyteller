"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Box, Button, HStack, List, Stack, Text } from "@chakra-ui/react";
import { ChevronsRight, Pencil } from "lucide-react";
import {
  ELEMENT_SEARCH_DELAY_MS,
  ELEMENTS_PAGE_SIZE,
  type ElementKind,
  type StoryElement,
} from "@/lib/elements";
import type { StatusOption } from "@/lib/status";
import { sa_listStoryElements } from "@/app/(app)/(nav)/libraries/actions";
import { StatusPill } from "@/components/status/status-pill";
import { IconLink } from "@/components/links/icon-link";

type Props = {
  idStory: number;
  /** Which kind of element this column holds. */
  kind: ElementKind;
  /** The first page of the story's elements of this kind, loaded by the page. */
  initial: StoryElement[];
  /** What the column's search box holds. */
  filter: string;
  /**
   * The statuses still switched on above the search box. The database is
   * asked for these only, as the Scenes column does.
   */
  shownStatuses: string[];
  /** The elements workflow, for the pills. */
  statusOptions: StatusOption[];
  /** The viewer is the storyteller, so the pills are menus. */
  canEdit: boolean;
  /**
   * Changes when the board has created a row here, so the column asks the
   * database again with what it is narrowed to. 0 until then.
   */
  reloadKey?: number;
};

// One element column of the Prep Work board, one kind of element. The search
// goes back to the database and runs against elements.search_text, in the
// same way, and for the same reasons, as the Scenes column's.
export function PrepElements({
  idStory,
  kind,
  initial,
  filter,
  shownStatuses,
  statusOptions,
  canEdit,
  reloadKey = 0,
}: Props) {
  const [elements, setElements] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length === ELEMENTS_PAGE_SIZE);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [isSearching, setSearching] = useState(false);
  const [, startTransition] = useTransition();

  // The latest search, so a slow reply to an earlier query does not land on
  // top of the results for what the box says now.
  const searchSeq = useRef(0);
  // The page already loaded the unfiltered first page, so an untouched box on
  // first render asks for nothing.
  const searched = useRef(false);

  // The statuses as a string, so the effect re-runs when the set changes
  // rather than on every render that rebuilds the array.
  const statusKey = shownStatuses.join(",");
  const everyStatus = statusOptions.length > 0 && shownStatuses.length === statusOptions.length;

  useEffect(() => {
    const needle = filter.trim();
    if (!searched.current && needle === "" && everyStatus && reloadKey === 0) return;
    searched.current = true;

    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await sa_listStoryElements(idStory, kind, 0, needle, shownStatuses);
        if (seq !== searchSeq.current) return;
        setElements(found);
        setHasMore(found.length === ELEMENTS_PAGE_SIZE);
      } catch {
        // Leave the last results in place; the next keystroke tries again.
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, ELEMENT_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // shownStatuses is rebuilt on every render; statusKey is what actually
    // changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idStory, kind, filter, statusKey, everyStatus, reloadKey]);

  function onMore() {
    const offset = elements.length;
    const seq = searchSeq.current;
    setLoadingMore(true);
    startTransition(async () => {
      try {
        const page = await sa_listStoryElements(
          idStory,
          kind,
          offset,
          filter.trim(),
          shownStatuses,
        );
        // The box moved on while this was in flight; its own search will
        // replace the list.
        if (seq !== searchSeq.current) return;
        setElements((current) => [...current, ...page]);
        setHasMore(page.length === ELEMENTS_PAGE_SIZE);
      } catch {
        // Leave the list as it was; the button stays so they can retry.
      } finally {
        setLoadingMore(false);
      }
    });
  }

  // An element whose status the pill has just moved keeps the new one, so
  // the row does not snap back while the column waits for its next load.
  function onStatusChanged(idElement: number, status: string) {
    setElements((current) =>
      current.map((element) =>
        element.idElement === idElement ? { ...element, status } : element,
      ),
    );
  }

  if (elements.length === 0) {
    const untouched = filter.trim() === "" && everyStatus;
    return (
      <Text color="fg.muted">
        {untouched ? "Nothing here yet." : isSearching ? "Searching…" : "No matches."}
      </Text>
    );
  }

  return (
    <Stack gap="4">
      <List.Root listStyleType="none" gap="3">
        {elements.map((element) => (
          <List.Item key={element.idElement}>
            <Stack gap="1">
              <HStack gap="1" align="start" justify="space-between">
                <Text fontWeight="medium" minW="0">
                  {element.name}
                </Text>
                {canEdit && (
                  <IconLink label="Edit element" href={`/elements/${element.idElement}/edit`}>
                    <Pencil />
                  </IconLink>
                )}
              </HStack>
              {element.title && (
                <Text color="fg.muted" fontSize="sm">
                  {element.title}
                </Text>
              )}
              {element.description && (
                <Text color="fg.muted" fontSize="sm" lineClamp="3">
                  {element.description}
                </Text>
              )}
              <Box pt="1">
                <StatusPill
                  table="elements"
                  id={element.idElement}
                  status={element.status}
                  options={statusOptions}
                  canEdit={canEdit}
                  onChanged={(status) => onStatusChanged(element.idElement, status)}
                />
              </Box>
            </Stack>
          </List.Item>
        ))}
      </List.Root>

      {hasMore && (
        <Box>
          <Button variant="outline" onClick={onMore} loading={isLoadingMore} loadingText="More">
            More
            <ChevronsRight />
          </Button>
        </Box>
      )}
    </Stack>
  );
}
