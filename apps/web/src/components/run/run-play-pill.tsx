"use client";

import {
  Box,
  chakra,
  HStack,
  Image,
  Portal,
  Stack,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@chakra-ui/react";
import { Eye, EyeOff, Lock, RefreshCw, X } from "lucide-react";
import {
  elementIdOf,
  SCENE_ELEMENT_DISABLED,
  SCENE_ELEMENT_HIDDEN,
  SCENE_ELEMENT_SHOWN,
  type PlayItem,
} from "@/lib/run";
import { sa_setSceneElementShown } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { RunElementInfoPopover } from "./run-element-info-popover";

type Props = {
  idStory: number;
  /** The scene the table is on; null for none. */
  idStoryScene: number | null;
  item: PlayItem;
  /** The tag of the stack this pill is drawn in; null for the Default stack. */
  stackTag: string | null;
  /** The scene's other stacks, which the info popover's Move to offers. */
  otherStacks: string[];
  onRemove: (key: string) => void;
  /** The item's scene_elements status has changed, or is being changed. */
  onStatusChange: (key: string, status: string) => void;
  /** The item has been edited from its info popover. */
  onItemChange: (item: PlayItem) => void;
};

/**
 * One item in a stack of the play space. An element linked to the scene
 * also carries its eye and its info button, and shows its scene status:
 * hidden from the players (INVISIBLE) with the theme's highlight round it
 * as a border and a glow, switched off (DISABLED) in grey italics. Anything
 * the page alone holds is just its name and the ✕.
 */
export function RunPlayPill({
  idStory,
  idStoryScene,
  item,
  stackTag,
  otherStacks,
  onRemove,
  onStatusChange,
  onItemChange,
}: Props) {
  const status = item.sceneStatus;
  const linked = status !== undefined && idStoryScene !== null;
  const isHidden = status === SCENE_ELEMENT_HIDDEN;
  const isDisabled = status === SCENE_ELEMENT_DISABLED;

  // The eye: shown is the usual state, so a press hides from whatever status
  // the link is in, and a press on a hidden one shows it as READY. A disabled
  // one has a lock in the eye's place, whose press unlocks it to READY too.
  // The pill changes at once and goes back if the action refuses.
  async function toggleShown() {
    if (!linked || status === undefined) return;
    const shown = isHidden || isDisabled;
    onStatusChange(item.key, shown ? SCENE_ELEMENT_SHOWN : SCENE_ELEMENT_HIDDEN);
    try {
      const result = await sa_setSceneElementShown(idStory, idStoryScene, elementIdOf(item), shown);
      if (result.ok) {
        onStatusChange(item.key, result.status);
        return;
      }
      onStatusChange(item.key, status);
      toaster.create({ title: result.error, type: "error" });
    } catch {
      onStatusChange(item.key, status);
      toaster.create({ title: "That could not be changed. Try again.", type: "error" });
    }
  }

  return (
    <HStack
      gap="2"
      p="2"
      borderWidth={isHidden ? "2px" : "1px"}
      borderColor={isHidden ? "run.hidden" : undefined}
      boxShadow={isHidden ? "0 0 10px 1px var(--chakra-colors-run-hidden)" : undefined}
      rounded="2xl"
      ps={linked ? "1" : "3"}
      bg="bg.panel/55"
      backdropFilter="blur(6px)"
      data-scene-status={status}
    >
      {/* The eye leads, left of the name: whether the players can see the
          element is the first thing the storyteller reads on the pill. Named
          for what a press does, which changes with the state; the icon shows
          the state itself. */}
      {linked && (
        // Pulled in towards the name: the button's own padding already
        // spaces it, so the row's gap on top of that read as a hole.
        <Box flexShrink="0" me="-1.5">
          <PrepIconButton
            label={
              isDisabled
                ? `Unlock ${item.label}`
                : isHidden
                  ? `Show ${item.label} to the players`
                  : `Hide ${item.label} from the players`
            }
            onClick={() => void toggleShown()}
          >
            {isDisabled ? <Lock /> : isHidden ? <EyeOff /> : <Eye />}
          </PrepIconButton>
        </Box>
      )}
      {item.imageUrl && (
        <Image src={item.imageUrl} alt="" boxSize="12" rounded="sm" objectFit="cover" />
      )}
      <Stack
        gap="0"
        flex="1"
        minW="0"
        fontStyle={isDisabled ? "italic" : undefined}
        // Hidden from the players: the text a shade dimmer, the border and
        // glow round the pill saying why.
        color={isDisabled ? "fg.subtle" : isHidden ? "fg.muted" : undefined}
      >
        {item.realName === undefined ? (
          <Text fontWeight="medium" truncate>
            {item.label}
          </Text>
        ) : (
          // An initial name: bold, in the second highlight, so the
          // storyteller sees at a glance this is what the players know it as.
          // The whole name and its reveal icon are the tooltip's trigger, so
          // pointing anywhere at it gives the name proper. Only as wide as the
          // name, so the empty end of the pill does not raise it. It takes
          // focus, so a keyboard reaches it too, and a screen reader hears
          // the real name after the initial one.
          <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
            <Tooltip.Trigger asChild>
              <HStack
                gap="1"
                minW="0"
                maxW="full"
                alignSelf="flex-start"
                tabIndex={0}
                color={isDisabled ? undefined : "run.initialName"}
                rounded="sm"
                _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
              >
                <Text fontWeight="bold" truncate>
                  {item.label}
                </Text>
                <chakra.span display="inline-flex" flexShrink="0" aria-hidden>
                  <RefreshCw size={14} />
                </chakra.span>
                <VisuallyHidden>, real name {item.realName}</VisuallyHidden>
              </HStack>
            </Tooltip.Trigger>
            <Portal>
              <Tooltip.Positioner>
                <Tooltip.Content>{item.realName}</Tooltip.Content>
              </Tooltip.Positioner>
            </Portal>
          </Tooltip.Root>
        )}
        {item.detail && (
          <Text fontSize="sm" color={isDisabled || isHidden ? "fg.subtle" : "fg.muted"} truncate>
            {item.detail}
          </Text>
        )}
      </Stack>
      {linked && (
        <RunElementInfoPopover
          idStory={idStory}
          idStoryScene={idStoryScene}
          idElement={elementIdOf(item)}
          label={item.label}
          onSceneStatusChange={(next) => onStatusChange(item.key, next)}
          onItemChange={onItemChange}
          stackTag={stackTag}
          otherStacks={otherStacks}
        />
      )}
      <PrepIconButton
        label={`Remove ${item.label} from the play space`}
        onClick={() => onRemove(item.key)}
      >
        <X />
      </PrepIconButton>
    </HStack>
  );
}
