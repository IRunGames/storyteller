"use client";

import {
  Box,
  CloseButton,
  Dialog,
  HStack,
  Image,
  Portal,
  Tag,
  Text,
  VisuallyHidden,
  Wrap,
} from "@chakra-ui/react";
import { Star, Tag as TagIcon } from "lucide-react";

type Props = {
  url: string;
  /** What the attachment is called, for the image's alt and the dialog's name. */
  label: string;
  tags: string[];
  isCover: boolean;
};

/**
 * An attachment's picture on its card, which opens it full size when
 * pressed: a dialog as wide and tall as the image itself, held inside the
 * viewport, with the tags along the bottom.
 *
 * A centred dialog rather than a popover anchored to the card: the card is
 * small and may sit anywhere on the page, and a popover attached to it has
 * nowhere to put a large picture without running off the screen.
 */
export function AttachmentPreview({ url, label, tags, isCover }: Props) {
  return (
    <Dialog.Root placement="center">
      <Dialog.Trigger asChild>
        {/* The picture is the button, so the whole frame is the target. Its
            own name says what pressing it does; the image keeps its alt. */}
        <Box
          as="button"
          aria-label={`Preview ${label}`}
          w="full"
          h="full"
          cursor="zoom-in"
          display="block"
        >
          <Image src={url} alt={label} w="full" h="full" objectFit="contain" />
        </Box>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          {/* w and h auto, so the dialog takes the image's own size; the max
              sizes keep a large picture on screen, scaled down whole. */}
          <Dialog.Content w="auto" h="auto" maxW="90vw" overflow="hidden">
            <VisuallyHidden>
              <Dialog.Title>{label}</Dialog.Title>
            </VisuallyHidden>
            <Image src={url} alt={label} maxW="90vw" maxH="80vh" objectFit="contain" mx="auto" />
            <HStack gap="2" px="4" py="3" borderTopWidth="1px" align="center">
              <Box color="fg.muted" flexShrink={0}>
                <TagIcon size={16} />
              </Box>
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
            </HStack>
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
