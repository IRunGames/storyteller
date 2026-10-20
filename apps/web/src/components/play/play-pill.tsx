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
import { Ban, ExternalLink, Info, RotateCw } from "lucide-react";
import {
  elementIdOf,
  SCENE_ELEMENT_DISABLED,
  SCENE_ELEMENT_SHOWN,
  SCENE_ELEMENT_TAPPED,
  type PlayItem,
} from "@/lib/run";
import { chatLog } from "@/lib/chat-log";
import { sa_untapPlaySceneElement } from "@/app/(app)/play/[id]/actions";
import { useUser } from "@/components/auth/user-provider";
import { toaster } from "@/components/ui/toaster";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";
import { ElementHistory } from "@/components/elements/element-history";
import { OverflowTooltip } from "@/components/popovers/overflow-tooltip";
import { PlayElementNotesField } from "./play-element-notes-field";
import { PlayUntapButton } from "./play-untap-button";

type Props = {
  idStory: number;
  /** The scene the table is on, which the pill's link belongs to. */
  idStoryScene: number;
  item: PlayItem;
  /** The players' notes on the element have been saved from its info popover. */
  onNotesChange: (idElement: number, notes: string | null) => void;
  /** The link's status has been changed from the pill, or put back after a refusal. */
  onStatusChange: (idElement: number, status: string) => void;
  /** A look at the scene (/preview/scene): a tapped card has its marker alone, and the notes are read, not written. */
  readOnly?: boolean;
  /** The info popover ends with the element's History, as on a scene's preview; the table leaves it out. */
  withHistory?: boolean;
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
 * the element's; lib/run.ts pillLink) carries a link icon at its end,
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
}: Props) {
  const user = useUser();
  const isDisabled = item.sceneStatus === SCENE_ELEMENT_DISABLED;
  const isTapped = item.sceneStatus === SCENE_ELEMENT_TAPPED;
  const showInfo = item.showInfo === true;
  const idElement = elementIdOf(item);

  async function untap() {
    onStatusChange(idElement, SCENE_ELEMENT_SHOWN);
    try {
      const result = await sa_untapPlaySceneElement(idStory, idStoryScene, idElement);
      if (result.ok) {
        onStatusChange(idElement, result.status);
        chatLog.post({ from: user.nickName || user.name, text: `untapped ${item.label}` });
        return;
      }
      onStatusChange(idElement, SCENE_ELEMENT_TAPPED);
      toaster.create({ title: result.error, type: "error" });
    } catch {
      onStatusChange(idElement, SCENE_ELEMENT_TAPPED);
      toaster.create({ title: "The card could not be untapped. Try again.", type: "error" });
    }
  }

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
          <PlayUntapButton label={item.label} onConfirm={() => void untap()} />
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
 * and the description, each only when the element has one, and then the
 * players' notes field. The field is drawn afresh each opening, with the
 * popover, so it starts from the notes as the table holds them now. Read
 * only, the notes are shown as they are, when there are any.
 */
function PlayInfoPopover({
  label,
  title,
  info,
  idStory,
  idElement,
  notes,
  onNotesChange,
  readOnly,
  history,
}: {
  label: string;
  title: string | null;
  info: string | null | undefined;
  idStory: number;
  idElement: number;
  notes: string | null;
  onNotesChange: (idElement: number, notes: string | null) => void;
  readOnly: boolean;
  /** Given, the popover ends with the element's History, less the scene named. */
  history: { idStoryScene: number } | null;
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
              <Stack gap="3">
                {info ? (
                  <Text whiteSpace="pre-wrap">{info}</Text>
                ) : (
                  <Text color="fg.muted">Nothing more is known yet.</Text>
                )}
                {readOnly ? (
                  notes && (
                    <Stack gap="1">
                      <Text fontSize="sm" fontWeight="medium">
                        Notes
                      </Text>
                      <Text whiteSpace="pre-wrap">{notes}</Text>
                    </Stack>
                  )
                ) : (
                  <PlayElementNotesField
                    idStory={idStory}
                    idElement={idElement}
                    notes={notes}
                    onSaved={(saved) => onNotesChange(idElement, saved)}
                  />
                )}
                {history && (
                  <ElementHistory
                    idStory={idStory}
                    idElement={idElement}
                    idStoryScene={history.idStoryScene}
                  />
                )}
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
