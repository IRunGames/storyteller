"use client";

import { useState } from "react";
import { chakra } from "@chakra-ui/react";
import { Image as ImageIcon, Star } from "lucide-react";
import { WithTooltip } from "@/components/buttons/with-tooltip";
import { AttachmentPreviewDialog } from "@/components/uploads/attachment-preview";

type Props = {
  /** What the element is called, for the pill's name and the preview's title. */
  name: string;
  /** Its cover as the storyteller is shown it, or null for none. */
  coverUrl: string | null;
  /** How many finished pictures it holds besides its cover. */
  otherPictures: number;
};

/**
 * An element's pictures on its row of the Prep Work board, after its status
 * pill: a Cover pill, the cover in small with a star, which opens it full
 * size (an annotated one as the players see it), and the count of its other
 * pictures beside a picture icon. Either is left out when there is none.
 * Each says what it is in a tooltip, the count reached by the keyboard too.
 */
export function PrepElementPictures({ name, coverUrl, otherPictures }: Props) {
  const [open, setOpen] = useState(false);
  const others = `${otherPictures} other ${otherPictures === 1 ? "picture" : "pictures"}`;
  return (
    <>
      {coverUrl && (
        <>
          <WithTooltip tooltip="Preview the cover">
            {/* The status pill's height and type, with the picture in it. */}
            <chakra.button
              type="button"
              aria-label={`Preview ${name}'s cover`}
              display="inline-flex"
              alignItems="center"
              gap="1"
              ps="0.5"
              pe="2"
              py="0.5"
              borderWidth="1px"
              borderColor="border.emphasized"
              bg="bg.panel"
              fontSize="xs"
              fontWeight="medium"
              lineHeight="1.4"
              whiteSpace="nowrap"
              cursor="zoom-in"
              _hover={{ borderColor: "fg.muted" }}
              _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
              onClick={() => setOpen(true)}
            >
              <chakra.img src={coverUrl} alt="" boxSize="4" objectFit="cover" />
              <Star size={10} fill="currentColor" aria-hidden />
              Cover
            </chakra.button>
          </WithTooltip>
          <AttachmentPreviewDialog
            open={open}
            onOpenChange={setOpen}
            url={coverUrl}
            label={name}
            tags={[]}
            isCover
            showTags={false}
          />
        </>
      )}
      {otherPictures > 0 && (
        <WithTooltip tooltip={others}>
          <chakra.span
            role="img"
            aria-label={others}
            tabIndex={0}
            display="inline-flex"
            alignItems="center"
            gap="1"
            color="fg.muted"
            fontSize="xs"
            lineHeight="1.4"
            _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
          >
            <ImageIcon size={14} aria-hidden />
            {otherPictures}
          </chakra.span>
        </WithTooltip>
      )}
    </>
  );
}
