"use client";

import { Box, chakra, HStack, IconButton, Portal, Stack, Text, Tooltip } from "@chakra-ui/react";
import { Ban, ExternalLink, RotateCw } from "lucide-react";
import {
  elementIdOf,
  SCENE_ELEMENT_DISABLED,
  SCENE_ELEMENT_SHOWN,
  SCENE_ELEMENT_TAPPED,
  type SceneItem,
} from "@/lib/scene-elements";
import { sa_untapPlaySceneElement } from "@/components/play/actions";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { ScenePictureControls } from "@/components/annotations/scene-picture-controls";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";
import { OverflowTooltip } from "@/components/popovers/overflow-tooltip";
import { PlayInfoPopover } from "@/components/table-shell/play-info-popover";
import { PlayUntapButton } from "./play-untap-button";

type Props = {
  idStory: number;
  /** The scene the table is on, which the pill's link belongs to. */
  idStoryScene: number;
  item: SceneItem;
  /** The players' notes on the element have been saved from its info popover. */
  onNotesChange: (idElement: number, notes: string | null) => void;
  /** The link's status has been changed from the pill, or put back after a refusal. */
  onStatusChange: (idSceneElement: number, status: string) => void;
  /** A look at the scene (scenePreviewPath): a tapped card has its marker alone, and the notes are read, not written. */
  readOnly?: boolean;
  /** The info popover ends with the element's History, as on a scene's preview; the table leaves it out. */
  withHistory?: boolean;
  /**
   * The story's storyteller looking at a scene's preview: the picture's
   * preview offers the annotation controls for the picture behind it, which
   * the players are shown as its players' copy (ScenePictureControls).
   */
  canAnnotate?: boolean;
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
 * an info button opens a popover with the description and, under it, the
 * players' own notes on the element to write and save
 * (PlayElementNotesField); with it off the pill is the picture and the name
 * alone, and the description never reaches the page
 * (lib/realtime/events.ts keeps it off the wire).
 *
 * An element switched off in the scene (DISABLED) or used up for now
 * (TAPPED) steps back: the pill more see-through and its text dimmer. The
 * first is in italics too, with a ban at its start whose tooltip says so;
 * the second has a turned-arrow marker at its start and Tapped as the
 * pill's own tooltip; a hidden one never reaches this table. With the
 * info showing, the tapped marker is a button (PlayUntapButton): a player
 * readies the card again, once asked, which moves its link
 * (sa_untapPlaySceneElement), is logged against the link with who did it,
 * and is said in the table chat. The pill readies at once and goes back if
 * the action refuses.
 *
 * An element with an external link (the link's own for this scene, else
 * the element's; lib/scene-elements.ts pillLink) carries a link icon at its end,
 * before the info button, which opens the address in a new tab; its
 * tooltip is the words given for the link, else the address. It goes with
 * the info: with show_info off the link is kept back too, off the wire
 * (lib/realtime/events.ts) and off the pill.
 */
export function PlayPill({
  idStory,
  idStoryScene,
  item,
  onNotesChange,
  onStatusChange,
  readOnly = false,
  withHistory = false,
  canAnnotate = false,
}: Props) {
  const isDisabled = item.sceneStatus === SCENE_ELEMENT_DISABLED;
  const isTapped = item.sceneStatus === SCENE_ELEMENT_TAPPED;
  const showInfo = item.showInfo === true;
  const idElement = elementIdOf(item);
  // The link the pill stands for, which the untap names: an element may be
  // in the scene more than once. A pill always has one here; -1 is never sent.
  const idSceneElement = item.idSceneElement ?? -1;

  // The untap readies the card at once and puts it back tapped if the
  // action refuses (useOptimisticAction); the table owns the item's status.
  const [, chooseStatus] = useOptimisticAction<string>(
    item.sceneStatus ?? SCENE_ELEMENT_TAPPED,
    async () => {
      const result = await sa_untapPlaySceneElement(idStory, idStoryScene, idSceneElement);
      return result.ok ? { ok: true, value: result.status } : result;
    },
    {
      onShow: (next) => onStatusChange(idSceneElement, next),
      failed: "The card could not be untapped. Try again.",
    },
  );
  const untap = () => chooseStatus(SCENE_ELEMENT_SHOWN);

  // Tapped or switched off, the pill steps back: more see-through, so the
  // cover shows through it, and its text a shade dimmer, rather than
  // standing out as the cards in play do.
  const isDimmed = isDisabled || isTapped;

  const pill = (
    <HStack
      gap="2"
      p="2"
      ps="3"
      borderWidth="1px"
      rounded="2xl"
      bg={isDimmed ? "bg.panel/25" : "bg.panel/55"}
      opacity={isDimmed ? 0.7 : undefined}
      backdropFilter="blur(6px)"
      data-scene-status={item.sceneStatus}
    >
      {/* Switched off: a ban leads the pill, before everything, so the
          grey italics are not mistaken for a tapped element's dimming.
          Focusable, so the keyboard reaches its tooltip too. */}
      {isDisabled && (
        <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
          <Tooltip.Trigger asChild>
            <chakra.span
              display="inline-flex"
              flexShrink="0"
              color="fg.subtle"
              role="img"
              aria-label="Currently disabled"
              tabIndex={0}
              rounded="sm"
              _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
            >
              <Ban size={16} />
            </chakra.span>
          </Tooltip.Trigger>
          <Portal>
            <Tooltip.Positioner>
              <Tooltip.Content>Currently disabled</Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        </Tooltip.Root>
      )}
      {/* Tapped: the turned arrow leads the pill too. With the info showing
          it is the button that readies the card; without, a marker alone. */}
      {isTapped &&
        (showInfo && !readOnly ? (
          <PlayUntapButton label={item.label} onConfirm={untap} />
        ) : (
          <chakra.span
            display="inline-flex"
            flexShrink="0"
            color="fg.muted"
            role="img"
            aria-label="Tapped"
          >
            <RotateCw size={16} />
          </chakra.span>
        ))}
      {item.imageUrl && (
        <Box boxSize="12" flexShrink="0" rounded="sm" overflow="hidden">
          <AttachmentPreview
            url={item.imageUrl}
            label={item.label}
            tags={[]}
            isCover={false}
            showTags={false}
            actions={
              canAnnotate && item.idSceneElement != null ? (
                <ScenePictureControls
                  idStory={idStory}
                  idSceneElement={item.idSceneElement}
                  label={item.label}
                  portalled={false}
                />
              ) : undefined
            }
          />
        </Box>
      )}
      <Stack
        gap="0"
        flex="1"
        minW="0"
        fontStyle={isDisabled ? "italic" : undefined}
        color={isDimmed ? "fg.muted" : undefined}
      >
        <Text fontWeight="medium" truncate>
          {item.label}
        </Text>
        {/* The title, with the whole of it as a tooltip when it is cut off. */}
        {showInfo && item.detail && (
          <OverflowTooltip fontSize="sm" color="fg.muted">
            {item.detail}
          </OverflowTooltip>
        )}
      </Stack>
      {showInfo && item.link && <PlayLinkButton label={item.label} link={item.link} />}
      {showInfo && (
        <PlayInfoPopover
          label={item.label}
          title={item.detail}
          info={item.info}
          idStory={idStory}
          idElement={idElement}
          notes={item.notes ?? null}
          onNotesChange={onNotesChange}
          readOnly={readOnly}
          history={withHistory ? { idStoryScene } : null}
        />
      )}
    </HStack>
  );

  // Tapped: the dimming and the marker are easy to miss, so the whole pill
  // says so on hover; the buttons inside keep their own tooltips.
  if (!isTapped) return pill;
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>{pill}</Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>Tapped</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}

/**
 * The pill's link icon: an anchor in the icon button's clothes, opening the
 * link in a new tab. The accessible name says whose link it is; the tooltip
 * says what it is.
 */
function PlayLinkButton({ label, link }: { label: string; link: NonNullable<SceneItem["link"]> }) {
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
