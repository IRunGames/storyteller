"use client";

import { useState, useTransition } from "react";
import { Box, Button, HStack, List, Stack, Text } from "@chakra-ui/react";
import { ChevronsRight, Pencil } from "lucide-react";
import { ELEMENTS_PAGE_SIZE, type ElementKind, type StoryElement } from "@/lib/elements";
import { SEARCH_DELAY_MS } from "@/lib/search";
import type { StatusOption } from "@/lib/status";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { sa_listStoryElements } from "@/components/prep/actions";
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
  const [, startTransition] = useTransition();

  const needle = filter.trim();
  // The statuses as a string, so the search re-runs when the set changes
  // rather than on every render that rebuilds the array.
  const statusKey = shownStatuses.join(",");
  const everyStatus = statusOptions.length > 0 && shownStatuses.length === statusOptions.length;
  // As the Scenes column: nothing is asked until the box, the pills or the
  // board's + move away from what the page opened with.
  const key = `${needle}|${statusKey}|${reloadKey}`;
  const [openedWith] = useState(key);
  const search = useDebouncedSearch(
    () => sa_listStoryElements(idStory, kind, 0, needle, shownStatuses),
    {
      key: `${idStory}|${kind}|${key}`,
      delay: SEARCH_DELAY_MS,
      enabled: key !== openedWith,
      onResult: (found) => {
        setElements(found);
        setHasMore(found.length === ELEMENTS_PAGE_SIZE);
      },
    },
  );

  function onMore() {
    const offset = elements.length;
    const asked = search.count();
    setLoadingMore(true);
    startTransition(async () => {
      try {
        const page = await sa_listStoryElements(idStory, kind, offset, needle, shownStatuses);
        // The box moved on while this was in flight; its own search will
        // replace the list.
        if (asked !== search.count()) return;
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
    const untouched = needle === "" && everyStatus;
    return (
      <Text color="fg.muted">
        {untouched ? "Nothing here yet." : search.isSearching ? "Searching…" : "No matches."}
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
                <Text fontSize="sm" color="fg.muted">
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
