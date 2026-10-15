"use client";

import { useId } from "react";
import {
  Box,
  chakra,
  HStack,
  IconButton,
  Popover,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { ExternalLink, Info, RotateCw } from "lucide-react";
import { SCENE_ELEMENT_DISABLED, SCENE_ELEMENT_TAPPED, type PlayItem } from "@/lib/run";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";

type Props = {
  item: PlayItem;
};

/**
 * One element in the players' play space: its picture and the name the
 * storyteller chose to show (element_showing). The storyteller's pill
 * (RunPlayPill) with everything that changes the element taken off: the
 * players only look. Whatever field the pill shows is drawn the same way:
 * the storyteller's highlight for a name other than the element's own would
 * tell the players that "a hooded figure" has another name, which is the
 * storyteller's to reveal.
 *
 * What more the players get is the storyteller's to give out too
 * (scene_elements.show_info). With it on, the title goes under the name and
 * an info button opens a popover with the description; with it off the pill
 * is the picture and the name alone, and the description never reaches the
 * page (lib/realtime/events.ts keeps it off the wire).
 *
 * An element switched off in the scene (DISABLED) is in grey italics; one
 * used up for now (TAPPED) is dimmed, with a turned-arrow marker at its
 * end; a hidden one never reaches this table.
 *
 * An element with an external link (the link's own for this scene, else
 * the element's; lib/run.ts pillLink) carries a link icon at its end,
 * before the info button, which opens the address in a new tab; its
 * tooltip is the words given for the link, else the address.
 */
export function PlayPill({ item }: Props) {
  const isDisabled = item.sceneStatus === SCENE_ELEMENT_DISABLED;
  const isTapped = item.sceneStatus === SCENE_ELEMENT_TAPPED;
  const showInfo = item.showInfo === true;

  return (
    <HStack
      gap="2"
      p="2"
      ps="3"
      borderWidth="1px"
      rounded="2xl"
      bg="bg.panel/55"
      backdropFilter="blur(6px)"
      data-scene-status={item.sceneStatus}
    >
      {item.imageUrl && (
        <Box boxSize="12" flexShrink="0" rounded="sm" overflow="hidden">
          <AttachmentPreview
            url={item.imageUrl}
            label={item.label}
            tags={[]}
            isCover={false}
            showTags={false}
          />
        </Box>
      )}
      <Stack
        gap="0"
        flex="1"
        minW="0"
        fontStyle={isDisabled ? "italic" : undefined}
        color={isDisabled ? "fg.subtle" : isTapped ? "fg.muted" : undefined}
      >
        <Text fontWeight="medium" truncate>
          {item.label}
        </Text>
        {showInfo && item.detail && (
          <Text fontSize="sm" color={isDisabled ? "fg.subtle" : "fg.muted"} truncate>
            {item.detail}
          </Text>
        )}
      </Stack>
      {isTapped && (
        <chakra.span
          display="inline-flex"
          flexShrink="0"
          color="fg.muted"
          role="img"
          aria-label="Tapped"
        >
          <RotateCw size={16} />
        </chakra.span>
      )}
      {item.link && <PlayLinkButton label={item.label} link={item.link} />}
      {showInfo && <PlayInfoPopover label={item.label} title={item.detail} info={item.info} />}
    </HStack>
  );
}

/**
 * The pill's link icon: an anchor in the icon button's clothes, opening the
 * link in a new tab. The accessible name says whose link it is; the tooltip
 * says what it is.
 */
function PlayLinkButton({ label, link }: { label: string; link: NonNullable<PlayItem["link"]> }) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton asChild size="xs" variant="ghost" rounded="full">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Link for ${label}: ${link.text}`}
          >
            <ExternalLink />
          </a>
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{link.text}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}

/**
 * The pill's info button: a popover with what the storyteller lets the
 * players know of the element, under the name the pill shows. The title
 * and the description, each only when the element has one.
 */
function PlayInfoPopover({
  label,
  title,
  info,
}: {
  label: string;
  title: string | null;
  info: string | null | undefined;
}) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();

  return (
    // Mounted only while open, so a table of pills does not hold a hidden
    // copy of every name. Zag then cannot link the dialog to its title as
    // the machine starts (attachment-tags-popover.tsx), so the content is
    // named outright.
    <Popover.Root
      ids={{ trigger: triggerId }}
      positioning={{ placement: "bottom-end" }}
      lazyMount
      unmountOnExit
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton aria-label={`About ${label}`} size="xs" variant="ghost" rounded="full">
              <Info />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>About {label}</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content aria-label={label} w="sm" maxH="70vh" overflowY="auto">
            <Popover.Arrow />
            <Popover.Header>
              <Popover.Title fontWeight="semibold">{label}</Popover.Title>
              {title && (
                <Text fontSize="sm" color="fg.muted">
                  {title}
                </Text>
              )}
            </Popover.Header>
            <Popover.Body>
              {info ? (
                <Text whiteSpace="pre-wrap">{info}</Text>
              ) : (
                <Text color="fg.muted">Nothing more is known yet.</Text>
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
