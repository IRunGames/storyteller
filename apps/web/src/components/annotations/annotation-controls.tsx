"use client";

import { useContext, useId, useState } from "react";
import type { PictureState } from "@/lib/annotations";
import { Button, HStack, Popover, Portal, Stack, Text } from "@chakra-ui/react";
import { Brush, CloudFog } from "lucide-react";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { WithTooltip } from "@/components/buttons/with-tooltip";
import { PreviewBarContext } from "@/components/uploads/preview-bar-context";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { CHANGE_FAILED } from "@/lib/messages";
import { useLatest } from "@/hooks/use-latest";
import { sa_getPictureState, sa_setAnnotated } from "./actions";
import { AnnotatorDialog } from "./annotator-dialog";

// How often, and how many times at most, the picture is read again while its
// players' copy is being rendered: a render takes a second or two, and one
// that keeps up with a long drawing a little longer.
const FOLLOW_MS = 2000;
const FOLLOW_TRIES = 20;

type Props = {
  /** The picture: an attachment the app uploaded. */
  idAttachment: number;
  /** What is pictured, for the annotator's title. */
  label: string;
  /** Whether it is annotated now: the players are shown the players' copy. */
  isAnnotated: boolean;
  /** It was annotated, or no longer is: shown at once, and put back if refused. */
  onAnnotatedChange?: (annotated: boolean) => void;
  /**
   * The picture as the server now holds it, read after a press of Annotate
   * for players goes through and after the annotator is left, and again
   * while its players' copy is behind: for the page to show the copy, and
   * the toggle to follow a drawing a change in the annotator turned on.
   */
  onPictureChange?: (picture: PictureState) => void;
  /**
   * False inside a dialog, such as a picture's preview, which makes the page
   * behind it inert: the question is then drawn in place.
   */
  portalled?: boolean;
};

/**
 * A picture's controls for annotating it, wherever the storyteller sees it:
 * Annotate for players, pressed while the players are shown the players'
 * copy rather than the picture (sa_setAnnotated) wherever an element shows
 * it, and the brush that opens the annotator over the picture, where any
 * change made annotates it too. Turned on the first time, the fog covers the
 * picture whole, so nothing is given away before the storyteller reveals it.
 *
 * Turning it on is one press. Turning it off shows the players the picture
 * as it is, which they may keep once they have seen it, so the press asks
 * first, in a popover beside the button as a deletion's does.
 *
 * At the start of a full-size preview's bottom bar (PreviewBarContext) the
 * switch is a pill that says whether fog is on, the cloud in it filled or
 * outlined as the bare cloud's is, so the storyteller reads the picture's
 * state where they look at it; the pencil follows it. The words follow the
 * switch, not whether any fog is left on the picture: a picture annotated
 * with all its fog cleared still says FOG OF WAR ACTIVE.
 */
export function AnnotationControls({
  idAttachment,
  label,
  isAnnotated,
  onAnnotatedChange,
  onPictureChange,
  portalled = true,
}: Props) {
  const report = useLatest(onPictureChange);
  const inPreviewBar = useContext(PreviewBarContext);

  // Reads the picture back, and again every FOLLOW_MS while its players'
  // copy is behind, a while at most; told to whoever holds it each time.
  async function follow() {
    for (let tries = 0; tries < FOLLOW_TRIES; tries++) {
      const picture = await sa_getPictureState(idAttachment).catch(() => null);
      if (!picture) return;
      const { behind, ...state } = picture;
      report.current?.(state);
      if (!behind) return;
      await new Promise((resolve) => setTimeout(resolve, FOLLOW_MS));
    }
  }

  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const triggerId = useId();
  const [annotated, choose] = useOptimisticAction(
    isAnnotated,
    async (next) => {
      const result = await sa_setAnnotated(idAttachment, next);
      if (!result.ok) return result;
      void follow();
      return { ok: true };
    },
    { onShow: onAnnotatedChange, failed: CHANGE_FAILED },
  );

  const question = (
    <Popover.Positioner>
      <Popover.Content w="sm">
        <Popover.Arrow />
        <Popover.Header fontWeight="semibold">
          <Popover.Title>Show the players the original picture (no fog)?</Popover.Title>
        </Popover.Header>
        <Popover.Body>
          <Stack gap="3">
            <Text fontSize="sm">
              The players will be shown the element picture without fog or markup. The fog and
              annotations are not lost, just hidden.
            </Text>
            <HStack justify="space-between" gap="2">
              <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                colorPalette="red"
                onClick={() => {
                  setAsking(false);
                  choose(false);
                }}
              >
                Show it
              </Button>
            </HStack>
          </Stack>
        </Popover.Body>
      </Popover.Content>
    </Popover.Positioner>
  );

  const tooltip = annotated
    ? "The players see this picture with its fog and pen marks. Click here to disable fog of war"
    : "Annotations and Fog not shown. Click to turn on for players to see.";
  const cloud = <CloudFog fill={annotated ? "currentColor" : "none"} />;

  return (
    <HStack gap="1">
      {/* The button is always the popover's trigger, so it stays the one
          element whichever way it is pressed; a press while not annotated
          turns annotating on rather than opening the question. */}
      <Popover.Root
        open={asking}
        onOpenChange={(details) => {
          if (!details.open) setAsking(false);
          else if (annotated) setAsking(true);
          else choose(true);
        }}
        ids={{ trigger: triggerId }}
        // From the bar's start the question opens along the bar, not off its edge.
        positioning={{ placement: inPreviewBar ? "top-start" : "top-end" }}
      >
        {inPreviewBar ? (
          // Named by its words, which say the state; aria-pressed says it is a switch.
          <WithTooltip tooltip={tooltip} popoverTrigger={triggerId}>
            <Button
              size="xs"
              rounded="full"
              px="3"
              gap="2"
              colorPalette="blue"
              variant={annotated ? "subtle" : "outline"}
              aria-pressed={annotated}
            >
              {cloud}
              {annotated ? "FOG OF WAR ACTIVE" : "FOG OF WAR OFF"}
            </Button>
          </WithTooltip>
        ) : (
          <IconButtonWithTooltip
            label="Annotate for players"
            tooltip={tooltip}
            aria-pressed={annotated}
            outlined={!annotated}
            variant={annotated ? "subtle" : "outline"}
            popoverTrigger={triggerId}
          >
            {cloud}
          </IconButtonWithTooltip>
        )}
        {portalled ? <Portal>{question}</Portal> : question}
      </Popover.Root>
      <IconButtonWithTooltip
        label="Open annotator"
        tooltip="Edit Annotations | Fog"
        outlined
        onClick={() => setOpen(true)}
      >
        <Brush />
      </IconButtonWithTooltip>
      <AnnotatorDialog
        idAttachment={idAttachment}
        label={label}
        open={open}
        onOpenChange={setOpen}
        onLeave={() => void follow()}
      />
    </HStack>
  );
}
