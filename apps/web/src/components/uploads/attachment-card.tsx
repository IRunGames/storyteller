"use client";

import { useState } from "react";
import { Box, Button, HStack, Link, Portal, Spacer, Text, Tooltip } from "@chakra-ui/react";
import { Link as LinkIcon, Star } from "lucide-react";
import type { Attachment } from "@/lib/attachments";
import { AttachmentPreview } from "./attachment-preview";
import { AttachmentRemoveButton } from "./attachment-remove-button";
import { AttachmentTagsPopover } from "./attachment-tags-popover";

type Props = {
  row: Attachment;
  /** How the row is named to a screen reader and in each button's label. */
  label: string;
  /** What fills the frame when the row has no url yet. */
  placeholder: string;
  /** False on a create form, where there is no object to be the cover of. */
  canTag: boolean;
  onRetry: () => void;
  onRemove: () => void;
  onCoverChange: (isCover: boolean) => Promise<boolean>;
  onTagsChange: (tags: string[]) => Promise<boolean>;
};

/** The address without its scheme: the band is narrow, and https:// says nothing. */
function shortAddress(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/**
 * One attachment in the field's grid: the picture as large as the frame
 * allows, whole rather than cropped, under a band carrying its address, then
 * the row's controls. The field owns the row and every handler; this only
 * draws it.
 */
export function AttachmentCard({
  row,
  label,
  placeholder,
  canTag,
  onRetry,
  onRemove,
  onCoverChange,
  onTagsChange,
}: Props) {
  const isReady = row.status === "READY";
  const canCover = isReady && canTag;
  // The Cover button's own refusal, shown on the card it was pressed on. The
  // popover reports its refusals inside itself.
  const [coverError, setCoverError] = useState<string | null>(null);

  async function toggleCover() {
    setCoverError(null);
    if (!(await onCoverChange(!row.isCover))) {
      setCoverError("The cover could not be changed. Please try again.");
    }
  }

  return (
    <Box
      role="listitem"
      borderWidth="1px"
      rounded="md"
      overflow="hidden"
      display="flex"
      flexDirection="column"
    >
      <Box position="relative" h="40" bg="bg.muted">
        {row.url ? (
          // Shown whole at the largest size that fits (contain, not cover: a
          // map or a handout is no use with its edges cut off), and pressing
          // it opens the picture full size.
          <AttachmentPreview url={row.url} label={label} tags={row.tags} isCover={row.isCover} />
        ) : (
          <Box h="full" display="flex" alignItems="center" justifyContent="center">
            <Text fontSize="xs" color="fg.muted">
              {placeholder}
            </Text>
          </Box>
        )}
        {/* blackAlpha and white rather than theme tokens: the band sits over
            an arbitrary picture, so it has to read the same over light and
            dark ones in every theme. */}
        <HStack
          position="absolute"
          top="0"
          insetX="0"
          gap="1.5"
          px="2"
          py="1"
          bg="blackAlpha.700"
          color="white"
          fontSize="xs"
        >
          <LinkIcon size={12} />
          {row.url ? (
            <Link
              href={row.url}
              target="_blank"
              rel="noreferrer"
              color="white"
              truncate
              minW="0"
              title={row.url}
            >
              {/* An upload's address is a Blob key nobody chose; the name of
                  the file it came from is what the storyteller knows it by. */}
              {row.fileName ?? shortAddress(row.url)}
            </Link>
          ) : (
            <Text truncate minW="0">
              {row.fileName ?? label}
            </Text>
          )}
        </HStack>
      </Box>

      {row.status === "ERROR" && (
        <Text fontSize="xs" color="fg.error" px="2" pt="2">
          That file could not be uploaded.
        </Text>
      )}
      {coverError && (
        <Text fontSize="xs" color="fg.error" px="2" pt="2">
          {coverError}
        </Text>
      )}

      <HStack gap="1" p="2">
        {canTag && (
          <AttachmentTagsPopover
            label={label}
            tags={row.tags}
            isCover={row.isCover}
            canCover={canCover}
            onTagsChange={onTagsChange}
            onCoverChange={onCoverChange}
          />
        )}
        {canCover && (
          // A toggle, so its name stays put and aria-pressed carries the
          // state; the filled star says the same thing to the eye. Only on a
          // READY row of a saved object: anything else has no picture to
          // show, or no object to be the cover of yet. The tooltip says what
          // pressing it does, which on the cover is taking the cover away.
          <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
            <Tooltip.Trigger asChild>
              <Button
                size="xs"
                variant={row.isCover ? "solid" : "outline"}
                type="button"
                aria-label={`Cover ${label}`}
                aria-pressed={row.isCover}
                onClick={() => void toggleCover()}
              >
                <Star size={14} fill={row.isCover ? "currentColor" : "none"} />
                Cover
              </Button>
            </Tooltip.Trigger>
            <Portal>
              <Tooltip.Positioner>
                <Tooltip.Content>
                  {row.isCover ? "Stop using this as the cover image" : "Make this the cover image"}
                </Tooltip.Content>
              </Tooltip.Positioner>
            </Portal>
          </Tooltip.Root>
        )}
        {row.status === "ERROR" && (
          <Button size="xs" type="button" aria-label={`Retry ${label}`} onClick={onRetry}>
            Retry
          </Button>
        )}
        <Spacer />
        <AttachmentRemoveButton
          label={label}
          isUploaded={row.isUploaded}
          isCover={row.isCover}
          onRemove={onRemove}
        />
      </HStack>
    </Box>
  );
}
