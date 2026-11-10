"use client";

import { useId, useState } from "react";
import { Box, Heading, HStack, IconButton, Portal, Stack, Tooltip } from "@chakra-ui/react";
import { Plus } from "lucide-react";
import { COVERS_FILTER } from "@/lib/attachments";
import { PrepAttachments } from "@/components/prep/prep-attachments";
import { allSelected, StatusSearch } from "@/components/status/status-search";

type Props = {
  idStory: number;
  /** True when the section sits on the dark panel over a cover image. */
  onImage: boolean;
};

/**
 * The story page's Attachments section: the heading, a + beside it, the Prep
 * Work board's Covers pill and search box (StatusSearch), and the story's
 * attachment cards as the board's Attachments column shows them
 * (PrepAttachments): ten at a time with More under them, narrowed by the
 * search, the cover left out when the pill is off. A story's attachments
 * run long, and every card drawn fetches its picture, so the page draws
 * what the board does rather than every card at once. The link input and
 * dropzone stay hidden until the + opens them, and the + closes them again,
 * so the section opens on the pictures rather than on the controls for
 * adding more. A client component of its own because StoryDetails renders
 * on the server and the toggle and the filter are state.
 */
export function StoryAttachments({ idStory, onImage }: Props) {
  const headingId = useId();
  const addId = useId();
  const [isAdding, setIsAdding] = useState(false);
  const [filter, setFilter] = useState(() => allSelected([COVERS_FILTER]));

  return (
    <Stack as="section" aria-labelledby={headingId} gap="4">
      <HStack gap="2" align="center">
        <Heading id={headingId} size="xl">
          Attachments
        </Heading>
        <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
          <Tooltip.Trigger asChild>
            {/* A disclosure, so aria-expanded and aria-controls rather than
                aria-pressed: it shows and hides a block, it does not hold a
                setting. The name and the + stay the same either way, as the
                session panel's cover image + does; open is solid in the
                theme's accent, as the Cover button is when it is on. Closed,
                it is coloured like the Library button over a cover. */}
            <IconButton
              aria-label="Add Attachments"
              aria-expanded={isAdding}
              aria-controls={addId}
              variant={isAdding ? "solid" : "ghost"}
              size="sm"
              rounded="full"
              color={onImage && !isAdding ? "whiteAlpha.900" : undefined}
              _hover={onImage && !isAdding ? { bg: "whiteAlpha.200" } : undefined}
              onClick={() => setIsAdding((open) => !open)}
            >
              <Plus />
            </IconButton>
          </Tooltip.Trigger>
          <Portal>
            <Tooltip.Positioner>
              <Tooltip.Content>Add Attachments</Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        </Tooltip.Root>
      </HStack>
      {/* The controls at the board's column width, so the pill and the box
          do not stretch across the page. */}
      <Box maxW="sm">
        <StatusSearch
          label="Attachments"
          options={[COVERS_FILTER]}
          value={filter}
          onChange={setFilter}
          groupLabel="Filter Attachments"
        />
      </Box>
      <PrepAttachments
        idStory={idStory}
        filter={filter.query}
        showCovers={filter.statuses.includes(COVERS_FILTER.key)}
        showAdd={isAdding}
        addId={addId}
      />
    </Stack>
  );
}
