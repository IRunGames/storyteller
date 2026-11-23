"use client";

import { useState, type ReactNode } from "react";
import {
  Badge,
  Box,
  chakra,
  CloseButton,
  Dialog,
  HStack,
  Image,
  Portal,
  Tag,
  Text,
  Wrap,
} from "@chakra-ui/react";
import { Star, Tag as TagIcon } from "lucide-react";
import { FogCoveredNote } from "@/components/annotations/fog-covered-note";
import { AttachmentTagsPopover } from "./attachment-tags-popover";
import { PreviewBarContext } from "./preview-bar-context";

type ContentProps = {
  url: string;
  /** What the attachment is called: the heading at the top, the image's alt and the dialog's name. */
  label: string;
  tags: string[];
  isCover: boolean;
  /**
   * Given where the viewer may change the attachment, as its storyteller:
   * the tag icon beside the tags becomes the card's tags button, so they are
   * edited from here too. The field's own handlers, as the card's are, so
   * the tags shown here and on the card change together. Without them the
   * tags are only shown.
   */
  editTags?: {
    canCover: boolean;
    onTagsChange: (tags: string[]) => Promise<boolean>;
    onCoverChange: (isCover: boolean) => Promise<boolean>;
  };
  /**
   * False for a picture shown as something else's, as an element's pill
   * shows the attachment it points at: the attachment's tags are not that
   * thing's, so the bar along the bottom is left out.
   */
  showTags?: boolean;
  /**
   * Given where the preview stands in a list, as the run page's library
   * shows its attachments: the up and down arrow keys move to the previous
   * and next picture, and this is told which way. Absent, the keys do
   * nothing.
   */
  onStep?: (direction: -1 | 1) => void;
  /**
   * Controls for the picture, at the start of the foot, before the tags: the
   * annotation controls, where the storyteller may draw on it, which draw
   * their fog switch there as a pill saying whether fog is on
   * (PreviewBarContext), the pencil after it. Mounted only while the preview
   * is open, so controls that look the picture up do so as it opens.
   */
  actions?: ReactNode;
  /**
   * The picture is a players' copy that shows nothing of it, fogged whole
   * (PictureState.fogCovered): the thumbnail and the full-size preview both
   * say so (FogCoveredNote).
   */
  fogCovered?: boolean;
  /**
   * The picture is a players' copy with fog on it somewhere
   * (PictureState.fogActive): the full-size preview's bottom bar marks it
   * "FOG OF WAR ACTIVE" at its start, and the thumbnail says nothing of it.
   * Left to the controls where there are any, since their fog switch says
   * whether fog is on in the same place. Given by the storyteller's reads
   * only.
   */
  fogActive?: boolean;
};

type Props = ContentProps;

/**
 * An attachment's picture on its card, which opens it full size when
 * pressed: a dialog as wide and tall as the image itself, held inside the
 * viewport, with the file's name across the top and the tags along the
 * bottom (AttachmentPreviewDialog).
 *
 * A centred dialog rather than a popover anchored to the card: the card is
 * small and may sit anywhere on the page, and a popover attached to it has
 * nowhere to put a large picture without running off the screen.
 */
export function AttachmentPreview({ url, label, fogCovered, fogActive, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AttachmentPreviewButton
        url={url}
        label={label}
        fogCovered={fogCovered}
        onOpen={() => setOpen(true)}
      />
      <AttachmentPreviewDialog
        open={open}
        onOpenChange={setOpen}
        url={url}
        label={label}
        fogCovered={fogCovered}
        fogActive={fogActive}
        {...rest}
      />
    </>
  );
}

/**
 * The picture as the button that opens its preview, so the whole frame is
 * the target. Its own name says what pressing it does; the image keeps its
 * alt. On its own for a list that keeps one preview dialog for every row,
 * as the run page's library does, so the arrow keys can move between them.
 */
export function AttachmentPreviewButton({
  url,
  label,
  fogCovered = false,
  onOpen,
}: {
  url: string;
  label: string;
  /** The picture is a players' copy fogged whole; see ContentProps. */
  fogCovered?: boolean;
  onOpen: () => void;
}) {
  return (
    // A button, and said to be one, so a form round the list (the
    // attachments field's) is not submitted by a press on the picture.
    // Positioned only to hold the note over a picture covered in fog.
    <chakra.button
      type="button"
      aria-label={`Preview ${label}`}
      position={fogCovered ? "relative" : undefined}
      w="full"
      h="full"
      cursor="zoom-in"
      display="block"
      onClick={onOpen}
    >
      <Image src={url} alt={label} w="full" h="full" objectFit="contain" />
      {fogCovered && <FogCoveredNote />}
    </chakra.button>
  );
}

/**
 * The preview itself, controlled, so a list can show one dialog for
 * whichever of its pictures is being looked at and swap the picture under
 * it as the arrow keys move. The picture's name heads it, the tags foot it.
 */
export function AttachmentPreviewDialog({
  open,
  onOpenChange,
  url,
  label,
  tags,
  isCover,
  editTags,
  showTags = true,
  onStep,
  actions,
  fogCovered = false,
  fogActive = false,
}: ContentProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const shownActions = open ? actions : undefined;
  const picture = (
    <Image src={url} alt={label} maxW="90vw" maxH="80vh" objectFit="contain" mx="auto" />
  );
  return (
    <Dialog.Root
      placement="center"
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          {/* w and h auto, so the dialog takes the image's own size; the max
              sizes keep a large picture on screen, scaled down whole. The
              arrow keys are read here, where focus is held while the
              dialog is open, and kept from scrolling the page behind. */}
          <Dialog.Content
            w="auto"
            h="auto"
            maxW="90vw"
            overflow="hidden"
            onKeyDown={(event) => {
              if (!onStep) return;
              // A dialog opened from the controls (the annotator) is drawn
              // in a portal, but its keys still bubble here through React:
              // the arrows pressed there are its own.
              if (!event.currentTarget.contains(event.target as Node)) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                onStep(event.key === "ArrowDown" ? 1 : -1);
              }
            }}
          >
            {/* The name across the top, with room kept on the right for the
                close button that floats over the corner. */}
            <Dialog.Header px="4" py="3" pe="12" borderBottomWidth="1px">
              <Dialog.Title fontSize="sm" fontWeight="semibold" truncate>
                {label}
              </Dialog.Title>
            </Dialog.Header>
            {fogCovered ? (
              // Framed as tight as the picture, so the note is centered on
              // it rather than on the dialog.
              <Box position="relative" w="fit-content" mx="auto">
                {picture}
                <FogCoveredNote />
              </Box>
            ) : (
              picture
            )}
            {(showTags || shownActions || fogActive) && (
              <HStack
                data-testid="preview-foot"
                gap="2"
                px="4"
                py="3"
                borderTopWidth="1px"
                align="center"
              >
                {shownActions ? (
                  <PreviewBarContext.Provider value={true}>
                    {shownActions}
                  </PreviewBarContext.Provider>
                ) : (
                  fogActive && (
                    <Badge
                      variant="subtle"
                      colorPalette="blue"
                      rounded="full"
                      px="3"
                      flexShrink="0"
                    >
                      FOG OF WAR ACTIVE
                    </Badge>
                  )
                )}
                {showTags && (
                  <>
                    {editTags ? (
                      <AttachmentTagsPopover
                        label={label}
                        tags={tags}
                        isCover={isCover}
                        canCover={editTags.canCover}
                        onTagsChange={editTags.onTagsChange}
                        onCoverChange={editTags.onCoverChange}
                        // In the dialog, which makes the page behind it inert.
                        portalled={false}
                      />
                    ) : (
                      <Box color="fg.muted" flexShrink={0}>
                        <TagIcon size={16} />
                      </Box>
                    )}
                    {isCover || tags.length > 0 ? (
                      <Wrap gap="2" role="list" aria-label="Tags">
                        {isCover && (
                          <Tag.Root role="listitem" colorPalette="yellow" variant="solid">
                            <Tag.StartElement>
                              <Star fill="currentColor" />
                            </Tag.StartElement>
                            <Tag.Label>Cover</Tag.Label>
                          </Tag.Root>
                        )}
                        {tags.map((tag) => (
                          <Tag.Root role="listitem" key={tag}>
                            <Tag.Label>{tag}</Tag.Label>
                          </Tag.Root>
                        ))}
                      </Wrap>
                    ) : (
                      <Text fontSize="sm" color="fg.muted">
                        No tags
                      </Text>
                    )}
                  </>
                )}
              </HStack>
            )}
            <Dialog.CloseTrigger asChild>
              {/* Over the picture, so it carries the cards' dark band rather
                  than a theme colour that might vanish into the image. */}
              <CloseButton
                size="sm"
                aria-label="Close preview"
                bg="blackAlpha.700"
                color="white"
                _hover={{ bg: "blackAlpha.800" }}
              />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
