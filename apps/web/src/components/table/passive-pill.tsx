"use client";

import { chakra, HStack, IconButton, Portal, Stack, Text, Tooltip } from "@chakra-ui/react";
import { Ban, Image, RotateCw } from "lucide-react";
import {
  elementIdOf,
  SCENE_ELEMENT_DISABLED,
  SCENE_ELEMENT_TAPPED,
  type PlayItem,
} from "@/lib/run";
import { PlayInfoPopover } from "@/components/play/play-pill";

/**
 * One element on the display table (/table/[id]): the players' pill
 * (PlayPill) cut down to what reads from across a room. The name large, the
 * title under it when the storyteller shows the info, and nothing to press:
 * no info popover, no link, no untapping. The storyteller runs this screen
 * from their own table.
 *
 * An element with a picture shows a small picture icon at its end rather
 * than the picture, which would be too small to make out at a distance.
 * The storyteller puts a picture up full size when it matters (the
 * preview.open pulse), and the table shows it over everything. Someone with
 * an account may also open it themselves: given onPreview, the icon is a
 * button that does. A guest's icon stays a mark, whose tooltip says that
 * someone logged in can open the picture themselves.
 *
 * Someone with an account also gets the players' info button beside the
 * picture icon, given onNotesChange: the same popover as on the players'
 * pill (PlayInfoPopover), with the description and the players' notes to
 * write. Only when the storyteller shows the element's info, as there,
 * since without it the description never reaches the page. A guest gets
 * none: the notes are the players' to keep.
 *
 * DISABLED and TAPPED step back as on the players' pill, with the same ban
 * and turned arrow, as plain marks.
 */
export function PassivePill({
  idStory,
  item,
  onPreview,
  onNotesChange,
}: {
  idStory: number;
  item: PlayItem;
  /** Opens the element's picture full size, for this viewer alone; left out, the icon is only a mark. */
  onPreview?: () => void;
  /** The notes have been saved from the info popover; left out, there is no info button. */
  onNotesChange?: (idElement: number, notes: string | null) => void;
}) {
  const isDisabled = item.sceneStatus === SCENE_ELEMENT_DISABLED;
  const isTapped = item.sceneStatus === SCENE_ELEMENT_TAPPED;
  const isDimmed = isDisabled || isTapped;

  // The props PlayPill's HStack shares are written in its order: the same
  // style props in two orders on one page give two class names for one
  // style, and hydration then finds them swapped.
  return (
    <HStack
      gap="3"
      p="3"
      ps="4"
      borderWidth="1px"
      rounded="2xl"
      bg={isDimmed ? "bg.panel/25" : "bg.panel/55"}
      opacity={isDimmed ? 0.7 : undefined}
      backdropFilter="blur(6px)"
      data-scene-status={item.sceneStatus}
    >
      {isDisabled && (
        <chakra.span
          display="inline-flex"
          flexShrink="0"
          color="fg.subtle"
          role="img"
          aria-label="Currently disabled"
        >
          <Ban size={24} />
        </chakra.span>
      )}
      {isTapped && (
        <chakra.span
          display="inline-flex"
          flexShrink="0"
          color="fg.muted"
          role="img"
          aria-label="Tapped"
        >
          <RotateCw size={24} />
        </chakra.span>
      )}
      <Stack
        gap="0"
        flex="1"
        minW="0"
        fontStyle={isDisabled ? "italic" : undefined}
        color={isDimmed ? "fg.muted" : undefined}
      >
        <Text textStyle="3xl" fontWeight="semibold" lineHeight="short" truncate>
          {item.label}
        </Text>
        {item.showInfo === true && item.detail && (
          <Text textStyle="xl" color="fg.muted" truncate>
            {item.detail}
          </Text>
        )}
      </Stack>
      {item.imageUrl &&
        (onPreview ? (
          <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
            <Tooltip.Trigger asChild>
              <IconButton
                aria-label={`Show the picture of ${item.label}`}
                variant="ghost"
                size="lg"
                color="fg.muted"
                flexShrink="0"
                onClick={onPreview}
              >
                <Image />
              </IconButton>
            </Tooltip.Trigger>
            <Portal>
              <Tooltip.Positioner>
                <Tooltip.Content>Show the picture</Tooltip.Content>
              </Tooltip.Positioner>
            </Portal>
          </Tooltip.Root>
        ) : (
          // A guest's mark says why it does not open, in a tooltip, and is
          // focusable so the keyboard reaches it too, as the players' pill's
          // disabled marker is.
          <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
            <Tooltip.Trigger asChild>
              <chakra.span
                display="inline-flex"
                flexShrink="0"
                color="fg.muted"
                role="img"
                aria-label="Has a picture"
                tabIndex={0}
                rounded="sm"
                _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
              >
                <Image size={28} />
              </chakra.span>
            </Tooltip.Trigger>
            <Portal>
              <Tooltip.Positioner>
                <Tooltip.Content>Logged-in users can view images themselves</Tooltip.Content>
              </Tooltip.Positioner>
            </Portal>
          </Tooltip.Root>
        ))}
      {onNotesChange && item.showInfo === true && (
        <PlayInfoPopover
          label={item.label}
          title={item.detail}
          info={item.info}
          idStory={idStory}
          idElement={elementIdOf(item)}
          notes={item.notes ?? null}
          onNotesChange={onNotesChange}
          readOnly={false}
          history={null}
        />
      )}
    </HStack>
  );
}
