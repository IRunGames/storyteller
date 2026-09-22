"use client";

import { useState, type MouseEvent } from "react";
import {
  Button,
  Card,
  Dialog,
  IconButton,
  Portal,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { X } from "lucide-react";
import { formatNewsDate, type NewsItem } from "@/lib/news";
import { sa_markNewsRead } from "@/app/(app)/(nav)/home/actions";

type Props = {
  item: NewsItem;
  /** The user has read the item; the section takes the card away. */
  onDismiss: (item: NewsItem) => void;
};

// Nothing to do on a failure: a mark that did not land only means the item
// comes back on the next visit, and a toast for that would be noise.
function markRead(id: number) {
  sa_markNewsRead([id]).catch(() => {});
}

// One announcement on the home page. It is read in one of two ways, and only
// those two: a click anywhere on the card opens the full story in a
// full-screen dialog, and the close icon in the top-left corner marks it
// without opening. Merely being on screen counts for nothing, so an item a
// person has not looked at waits for them. Opening marks the item at once,
// so a reload mid-read does not bring it back; the card itself goes when the
// dialog closes, so the story is not pulled out from under the reader.
//
// The title is the dialog's real trigger, a button, so keyboard and screen
// reader users have one thing to press; the card's own onClick is a pointer
// convenience on top of it. Clicks inside the dialog bubble back up to the
// card through the portal, so the content stops them, or closing the dialog
// would reopen it.
export function NewsCard({ item, onDismiss }: Props) {
  const [open, setOpen] = useState(false);

  function onOpenChange(details: { open: boolean }) {
    setOpen(details.open);
    if (details.open) markRead(item.idNews);
    else onDismiss(item);
  }

  function onClose(event: MouseEvent) {
    // Otherwise the click also reaches the card and opens the story.
    event.stopPropagation();
    markRead(item.idNews);
    onDismiss(item);
  }

  return (
    <Card.Root
      as="article"
      aria-label={item.title}
      position="relative"
      cursor="pointer"
      _hover={{ boxShadow: "md" }}
      transition="box-shadow 0.15s"
      onClick={() => {
        if (!open) onOpenChange({ open: true });
      }}
    >
      {/* Room on the left for the close icon, which floats over that corner. */}
      <Card.Body gap="2" pl="12">
        <Dialog.Root
          open={open}
          onOpenChange={onOpenChange}
          size="full"
          scrollBehavior="inside"
        >
          <Dialog.Trigger asChild>
            {/* A plain button so the title reads as a title but is the one
                thing to press to open the story. The trigger has opened the
                dialog by the time this click would reach the card, so it
                stops here rather than opening, and marking, a second time. */}
            <Button
              type="button"
              variant="plain"
              size="md"
              fontWeight="semibold"
              px="0"
              h="auto"
              justifyContent="flex-start"
              textAlign="left"
              whiteSpace="normal"
              onClick={(event) => event.stopPropagation()}
            >
              {item.title}
            </Button>
          </Dialog.Trigger>
          <Portal>
            <Dialog.Backdrop />
            <Dialog.Positioner>
              <Dialog.Content onClick={(event) => event.stopPropagation()}>
                <Dialog.Header>
                  <Dialog.Title>{item.title}</Dialog.Title>
                </Dialog.Header>
                <Dialog.Body>
                  <Text textStyle="xs" color="fg.muted" mb="3">
                    {formatNewsDate(item.startsAt)}
                  </Text>
                  <Text>{item.body}</Text>
                </Dialog.Body>
                <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
                  <Tooltip.Trigger asChild>
                    <Dialog.CloseTrigger asChild>
                      <IconButton
                        type="button"
                        aria-label="Close"
                        variant="ghost"
                        size="sm"
                        rounded="full"
                        position="absolute"
                        top="2"
                        right="2"
                      >
                        <X size={18} />
                      </IconButton>
                    </Dialog.CloseTrigger>
                  </Tooltip.Trigger>
                  <Portal>
                    <Tooltip.Positioner>
                      <Tooltip.Content>Close</Tooltip.Content>
                    </Tooltip.Positioner>
                  </Portal>
                </Tooltip.Root>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
        <Text textStyle="xs" color="fg.muted">
          {formatNewsDate(item.startsAt)}
        </Text>
        <Card.Description lineClamp={3}>{item.body}</Card.Description>
      </Card.Body>
      {/* Last in the DOM so a screen reader reaches the title first. The
          label names the item so neighbouring cards' buttons stay distinct. */}
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
        <Tooltip.Trigger asChild>
          <IconButton
            type="button"
            aria-label={`Close ${item.title}`}
            variant="ghost"
            size="sm"
            rounded="full"
            position="absolute"
            top="2"
            left="2"
            onClick={onClose}
          >
            <X size={18} />
          </IconButton>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Mark as read</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
    </Card.Root>
  );
}
