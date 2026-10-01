"use client";

import { useId, useState } from "react";
import { Heading, HStack, IconButton, Portal, Stack, Tooltip } from "@chakra-ui/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AttachmentListField } from "@/components/uploads/attachment-list-field";

type Props = {
  idStory: number;
  /** True when the section sits on the dark panel over a cover image. */
  onImage: boolean;
};

/**
 * The story page's Attachments section: the heading, a chevron toggle beside it,
 * and the story's attachment cards. The link input and dropzone stay hidden
 * until the toggle opens them, so the section opens on the pictures rather
 * than on the controls for adding more. A client component of its own because
 * StoryDetails renders on the server and the toggle is state.
 */
export function StoryAttachments({ idStory, onImage }: Props) {
  const headingId = useId();
  const addId = useId();
  const [isAdding, setIsAdding] = useState(false);

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
                setting. The name stays the same either way. The chevron
                points the way the block will move, and open is solid in the
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
              {isAdding ? <ChevronUp /> : <ChevronDown />}
            </IconButton>
          </Tooltip.Trigger>
          <Portal>
            <Tooltip.Positioner>
              <Tooltip.Content>Add Attachments</Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        </Tooltip.Root>
      </HStack>
      <AttachmentListField kind="STORY" idExternal={idStory} showAdd={isAdding} addId={addId} />
    </Stack>
  );
}
