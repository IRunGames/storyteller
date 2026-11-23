"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { Box, HStack, Image, List, Stack, Text } from "@chakra-ui/react";
import { ArrowRight } from "lucide-react";
import type { LibraryItem } from "@/lib/scene-elements";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import {
  AttachmentPreviewButton,
  AttachmentPreviewDialog,
} from "@/components/uploads/attachment-preview";

/**
 * One list of the library: the items one to a line, each with its picture
 * when it has one, its name and detail, whatever controls its tab draws
 * before the arrow, and the arrow. An attachment's picture opens full size
 * in one dialog for the whole list, which the arrow keys step through.
 */
export function LibraryList({
  items,
  filtered,
  onAdd,
  renderArrow,
  renderActions,
  editTagsFor,
  previewActionsFor,
}: {
  items: LibraryItem[] | null;
  filtered: boolean;
  /** An element's arrow, which puts it in the play space. */
  onAdd?: (item: LibraryItem) => void;
  /** In place of the element's arrow: an attachment's, which attaches it, or the Recycle that detaches it. */
  renderArrow?: (item: LibraryItem) => ReactNode;
  /**
   * Controls drawn before an item's arrow: an element's info button, an
   * attachment's tags and Cover.
   */
  renderActions?: (item: LibraryItem) => ReactNode;
  /** An attachment's tag handlers, so its full-size preview edits them too. */
  editTagsFor?: (item: LibraryItem) => ComponentProps<typeof AttachmentPreviewDialog>["editTags"];
  /** Controls at the foot of an attachment's full-size preview: its annotation controls. */
  previewActionsFor?: (item: LibraryItem) => ReactNode;
}) {
  // The attachment whose picture is open full size, by key. One dialog for
  // the whole list rather than one per row, so the arrow keys can move it
  // from picture to picture (AttachmentPreviewDialog's onStep).
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  if (items === null) return <Text color="fg.muted">Loading…</Text>;
  if (items.length === 0) {
    return <Text color="fg.muted">{filtered ? "No matches." : "Nothing here yet."}</Text>;
  }

  // The rows with a picture to preview, in the list's order; the keys step
  // through these, so a row still uploading is passed over.
  const previewable = items.filter((item) => item.imageUrl !== null && item.attachment);
  const previewed = previewable.find((item) => item.key === previewKey) ?? null;
  const step = (direction: -1 | 1) => {
    const at = previewable.findIndex((item) => item.key === previewKey);
    const next = previewable[at + direction];
    if (next) setPreviewKey(next.key);
  };

  return (
    // Full width: inside the attachments field the list sits in a column that
    // does not stretch its children, and at its content's width a long name
    // would push the controls out of the panel instead of truncating.
    <>
      <List.Root listStyleType="none" gap="2" w="full">
        {items.map((item) => (
          <List.Item key={item.key}>
            <HStack gap="2" align="center">
              {item.imageUrl &&
                (item.attachment ? (
                  // An attachment's picture opens full size with its tags, the
                  // same preview its card on the library page opens.
                  <Box boxSize="8" flexShrink="0" rounded="sm" overflow="hidden" bg="bg.muted">
                    <AttachmentPreviewButton
                      url={item.imageUrl}
                      label={item.label}
                      fogCovered={item.fogCovered === true}
                      onOpen={() => setPreviewKey(item.key)}
                    />
                  </Box>
                ) : (
                  // Decoration beside the name, which says what it is.
                  <Image src={item.imageUrl} alt="" boxSize="8" rounded="sm" objectFit="cover" />
                ))}
              <Stack gap="0" flex="1" minW="0">
                <Text fontWeight="medium" truncate>
                  {item.label}
                </Text>
                {item.detail && (
                  <Text fontSize="sm" color="fg.muted" truncate>
                    {item.detail}
                  </Text>
                )}
              </Stack>
              {renderActions?.(item)}
              {renderArrow
                ? renderArrow(item)
                : onAdd && (
                    <IconButtonWithTooltip
                      label={`Add ${item.label} to the play space`}
                      onClick={() => onAdd(item)}
                    >
                      <ArrowRight />
                    </IconButtonWithTooltip>
                  )}
            </HStack>
          </List.Item>
        ))}
      </List.Root>
      {previewed?.imageUrl && previewed.attachment && (
        <AttachmentPreviewDialog
          open
          onOpenChange={(open) => {
            if (!open) setPreviewKey(null);
          }}
          url={previewed.imageUrl}
          label={previewed.label}
          tags={previewed.attachment.tags}
          isCover={previewed.attachment.isCover}
          fogCovered={previewed.fogCovered === true}
          fogActive={previewed.fogActive === true}
          editTags={editTagsFor?.(previewed)}
          actions={previewActionsFor?.(previewed)}
          onStep={step}
        />
      )}
    </>
  );
}
