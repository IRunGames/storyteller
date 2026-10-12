"use client";

import { Box, chakra, HStack, Menu, Portal, Stack, Text } from "@chakra-ui/react";
import { ChevronDown, Eye, EyeOff, Lock } from "lucide-react";
import {
  ELEMENT_SHOWING,
  elementIdOf,
  isElementShowing,
  pillText,
  SCENE_ELEMENT_DISABLED,
  SCENE_ELEMENT_HIDDEN,
  SCENE_ELEMENT_SHOWN,
  withShowing,
  type PlayItem,
} from "@/lib/run";
import { sa_setSceneElementShowing, sa_setSceneElementShown } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";
import { RunElementImagePopover } from "./run-element-image-popover";
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
  /** The element has been taken out of the scene from its info popover's −. */
  onRemove: (key: string) => void;
  /** The item's scene_elements status has changed, or is being changed. */
  onStatusChange: (key: string, status: string) => void;
  /** The item has been edited from its info popover. */
  onItemChange: (item: PlayItem) => void;
};

/**
 * One item in a stack of the play space. An element linked to the scene
 * also carries its eye and its info button, its name is a dropdown of the
 * fields it can show, and it shows its scene status:
 * hidden from the players (INVISIBLE) with the theme's highlight round it
 * as a border and a glow, switched off (DISABLED) in grey italics. It has no
 * ✕: taking an element out of the scene is the info popover's − beside In
 * this scene. Anything the page alone holds is just its name.
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

  // The name's dropdown: the pill shows the chosen field at once and goes
  // back if the action refuses, as the eye does.
  async function chooseShowing(next: string) {
    if (!linked || !isElementShowing(next) || next === item.showing) return;
    onItemChange(withShowing(item, next));
    try {
      const result = await sa_setSceneElementShowing(
        idStory,
        idStoryScene,
        elementIdOf(item),
        next,
      );
      if (result.ok) return;
      onItemChange(item);
      toaster.create({ title: result.error, type: "error" });
    } catch {
      onItemChange(item);
      toaster.create({ title: "That could not be changed. Try again.", type: "error" });
    }
  }

  const fields = item.fields;
  const highlighted = fields && item.showing ? pillText(fields, item.showing).highlighted : false;

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
      {item.imageUrl ? (
        // Pressed, the picture opens full size, as an attachment's does in
        // the library; its tags are the attachment's, not the element's, so
        // the preview leaves them out.
        <Box boxSize="12" flexShrink="0" rounded="sm" overflow="hidden">
          <AttachmentPreview
            url={item.imageUrl}
            label={item.label}
            tags={[]}
            isCover={false}
            showTags={false}
          />
        </Box>
      ) : (
        // In the picture's place, beside the eye: a + to give the element
        // one from the story's or the scene's attachments.
        linked && (
          <Box flexShrink="0" me="-1.5">
            <RunElementImagePopover
              idStory={idStory}
              idStoryScene={idStoryScene}
              idElement={elementIdOf(item)}
              label={item.label}
              onPicked={(imageUrl) => onItemChange({ ...item, imageUrl })}
            />
          </Box>
        )
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
        {!linked || !fields ? (
          <Text fontWeight="medium" truncate>
            {item.label}
          </Text>
        ) : (
          // The name is the dropdown's trigger: it lists each of the
          // element's fields as field:value, and the one chosen is what the
          // pill shows in this scene. Anything but the name proper is bold
          // in the second highlight, so the storyteller sees at a glance the
          // players know it by something else. Only as wide as the name, so
          // the empty end of the pill does not open it.
          <Menu.Root positioning={{ placement: "bottom-start" }}>
            <Menu.Trigger asChild>
              <chakra.button
                type="button"
                display="flex"
                alignItems="center"
                gap="1"
                minW="0"
                maxW="full"
                alignSelf="flex-start"
                textAlign="start"
                cursor="pointer"
                color={highlighted && !isDisabled ? "run.initialName" : undefined}
                fontWeight={highlighted ? "bold" : "medium"}
                rounded="sm"
                aria-label={`${item.label}, choose what the pill shows`}
                _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
              >
                <Text as="span" truncate>
                  {item.label}
                </Text>
                {/* The caret says the name is a select. It never shrinks, so
                    a long name truncates before the caret is pushed off. */}
                <chakra.span display="inline-flex" flexShrink="0" aria-hidden>
                  <ChevronDown size={14} />
                </chakra.span>
              </chakra.button>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner>
                <Menu.Content>
                  <Menu.RadioItemGroup
                    value={item.showing}
                    onValueChange={(e) => void chooseShowing(e.value)}
                  >
                    {ELEMENT_SHOWING.map((field) => (
                      // A field the element has left empty cannot be shown,
                      // so it is listed but not offered.
                      <Menu.RadioItem key={field} value={field} disabled={!fields[field]}>
                        <Menu.ItemIndicator />
                        <Menu.ItemText>
                          {field}:{fields[field] || "—"}
                        </Menu.ItemText>
                      </Menu.RadioItem>
                    ))}
                  </Menu.RadioItemGroup>
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
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
          placement="bottom-end"
          onSceneStatusChange={(next) => onStatusChange(item.key, next)}
          onItemChange={onItemChange}
          onImageChange={(imageUrl) => onItemChange({ ...item, imageUrl })}
          onRemovedFromScene={() => onRemove(item.key)}
          stackTag={stackTag}
          otherStacks={otherStacks}
        />
      )}
    </HStack>
  );
}
