"use client";

import type { ReactNode } from "react";
import { Box, HStack } from "@chakra-ui/react";
import { Minus, Plus } from "lucide-react";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";

type Props = {
  /** The picture's address, or null for none. */
  imageUrl: string | null;
  /** What is pictured, for the preview's name. */
  label: string;
  /** What the + is called: "Add picture" for an element, "Add cover" for the scene. */
  addLabel: string;
  /** What the − is called. */
  removeLabel: string;
  /** The picker is open below the rows; the + reports it and turns solid. */
  picking: boolean;
  onPickingChange: (open: boolean) => void;
  /**
   * The −. Left out while a removal is out, so a second press cannot send
   * it twice, and where nothing may change.
   */
  onRemove?: () => void;
  /** False where nothing may change, in a complete scene: the + is left out. */
  canChange?: boolean;
  /** Drawn over the thumbnail's lower corner: the scene card's cover star. */
  corner?: ReactNode;
  /** The thumbnail's side, a spacing token; wider where a corner control sits on it. */
  size?: "10" | "14";
};

/**
 * One row's picture in the element panel: the attachment it points at as a
 * small icon, which opens it full size, with a − to take it away; or, with
 * none, a + that opens a picker in place below the rows. The element's own
 * picture and the scene's cover are both shown this way, so the two rows
 * read alike.
 */
export function RunPictureCell({
  imageUrl,
  label,
  addLabel,
  removeLabel,
  picking,
  onPickingChange,
  onRemove,
  canChange = true,
  corner,
  size = "10",
}: Props) {
  if (imageUrl) {
    return (
      <HStack gap="1">
        {/* Pressed, it opens full size, as the pill's picture does; the
            attachment's tags are not this thing's, so they are left out. */}
        <Box
          position="relative"
          boxSize={size}
          flexShrink="0"
          rounded="sm"
          overflow="hidden"
          bg="bg.muted"
        >
          <AttachmentPreview
            url={imageUrl}
            label={label}
            tags={[]}
            isCover={false}
            showTags={false}
          />
          {corner}
        </Box>
        {canChange && onRemove && (
          <PrepIconButton label={removeLabel} onClick={onRemove} outlined>
            <Minus />
          </PrepIconButton>
        )}
      </HStack>
    );
  }
  if (!canChange) return null;
  return (
    <PrepIconButton
      label={addLabel}
      expanded={picking}
      onClick={() => onPickingChange(!picking)}
      outlined
    >
      <Plus />
    </PrepIconButton>
  );
}
