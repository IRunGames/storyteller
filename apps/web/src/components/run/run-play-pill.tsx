"use client";

import { useState } from "react";
import {
  Box,
  chakra,
  Heading,
  HStack,
  IconButton,
  Menu,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { ChevronDown, Info, Slash } from "lucide-react";
import {
  ELEMENT_SHOWING,
  elementIdOf,
  isElementShowing,
  pillText,
  SCENE_ELEMENT_DISABLED,
  SCENE_ELEMENT_HIDDEN,
  SCENE_ELEMENT_TAPPED,
  withShowing,
  type PlayItem,
  type SceneElementStatus,
} from "@/lib/run";
import {
  sa_setSceneElementShowing,
  sa_setSceneElementShowInfo,
  sa_setSceneElementStatus,
} from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";
import { RunElementImagePopover } from "./run-element-image-popover";
import { RunElementPanel } from "./run-element-panel";
import { RunSceneStatusMenu } from "./run-scene-status-menu";

type Props = {
  idStory: number;
  /** The scene the table is on; null for none. */
  idStoryScene: number | null;
  item: PlayItem;
  /** The tag of the stack this pill is drawn in; null for the Default stack. */
  stackTag: string | null;
  /** The scene's other stacks, which the panel's Move to offers. */
  otherStacks: string[];
  /** The element has been taken out of the scene from its panel's −. */
  onRemove: (key: string) => void;
  /** The item's scene_elements status has changed, or is being changed. */
  onStatusChange: (key: string, status: string) => void;
  /** The item has been edited from its panel, or its info toggle pressed. */
  onItemChange: (item: PlayItem) => void;
};

/**
 * One item in a stack of the play space. An element linked to the scene
 * leads with its info toggle (whether the players see its description) and
 * its status menu (RunSceneStatusMenu), its name is a dropdown of the fields
 * it can show, and a chevron at its end opens the element panel
 * (RunElementPanel) in place under it. It shows its scene status: hidden
 * from the players (INVISIBLE) with the theme's highlight round it as a
 * border and a glow, tapped (TAPPED) a shade dimmer, switched off (DISABLED)
 * in grey italics; the menu's icon says which either way. It has no ✕:
 * taking an element out of the scene is the panel's − beside In this scene.
 * Anything the page alone holds is just its name.
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
  const isTapped = status === SCENE_ELEMENT_TAPPED;
  // The column's default, for a link the page holds without having read it.
  const showInfo = item.showInfo ?? true;
  const [open, setOpen] = useState(false);

  // The status menu: the pill changes at once and goes back if the action
  // refuses.
  async function chooseStatus(next: SceneElementStatus) {
    if (!linked || status === undefined || next === status) return;
    onStatusChange(item.key, next);
    try {
      const result = await sa_setSceneElementStatus(idStory, idStoryScene, elementIdOf(item), next);
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

  // The info toggle, the same way: pressed at once, back if refused.
  async function toggleInfo() {
    if (!linked) return;
    const next = !showInfo;
    onItemChange({ ...item, showInfo: next });
    try {
      const result = await sa_setSceneElementShowInfo(
        idStory,
        idStoryScene,
        elementIdOf(item),
        next,
      );
      if (result.ok) return;
      onItemChange({ ...item, showInfo });
      toaster.create({ title: result.error, type: "error" });
    } catch {
      onItemChange({ ...item, showInfo });
      toaster.create({ title: "That could not be changed. Try again.", type: "error" });
    }
  }

  // The name's dropdown: the pill shows the chosen field at once and goes
  // back if the action refuses, as the status menu does.
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
  const infoLabel = showInfo ? "Showing info to users" : "Info not showing – click to show";

  return (
    <Stack
      gap="0"
      borderWidth={isHidden ? "2px" : "1px"}
      borderColor={isHidden ? "run.hidden" : undefined}
      boxShadow={isHidden ? "0 0 10px 1px var(--chakra-colors-run-hidden)" : undefined}
      rounded="2xl"
      bg="bg.panel/55"
      backdropFilter="blur(6px)"
      data-scene-status={status}
    >
      <HStack gap="2" p="2" ps={linked ? "1" : "3"}>
        {/* The toggle and the status lead, left of the name: what the
            players see of the element is the first thing the storyteller
            reads on the pill. Pulled in towards the name: the buttons' own
            padding already spaces them, so the row's gap on top of that
            read as a hole. */}
        {linked && (
          <HStack gap="0" flexShrink="0" me="-1.5">
            <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
              <Tooltip.Trigger asChild>
                <IconButton
                  aria-label={infoLabel}
                  aria-pressed={showInfo}
                  size="xs"
                  variant={showInfo ? "solid" : "ghost"}
                  rounded="full"
                  onClick={() => void toggleInfo()}
                >
                  {/* Lucide has no crossed-out Info, so its Slash is laid
                      over it when the info is kept back, as PlayerCount does
                      for nobody. Ban is the DISABLED status beside this. */}
                  <Box as="span" position="relative" display="inline-flex">
                    <Info />
                    {!showInfo && (
                      <Box as="span" position="absolute" inset="0" display="inline-flex">
                        <Slash />
                      </Box>
                    )}
                  </Box>
                </IconButton>
              </Tooltip.Trigger>
              <Portal>
                <Tooltip.Positioner>
                  <Tooltip.Content>{infoLabel}</Tooltip.Content>
                </Tooltip.Positioner>
              </Portal>
            </Tooltip.Root>
            <RunSceneStatusMenu
              label={item.label}
              status={status}
              onChange={(next) => void chooseStatus(next)}
            />
          </HStack>
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
          // In the picture's place, beside the status: a + to give the
          // element one from the story's or the scene's attachments.
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
          // Hidden from the players, or tapped: the text a shade dimmer, the
          // border and glow round the pill saying which.
          color={isDisabled ? "fg.subtle" : isHidden || isTapped ? "fg.muted" : undefined}
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
        {/* The chevron at the end opens the panel under the pill, and turns
            over while it is open. */}
        {linked && (
          <PrepIconButton
            label={`About ${item.label}`}
            expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <chakra.span
              display="inline-flex"
              transition="transform 0.15s"
              transform={open ? "rotate(180deg)" : undefined}
            >
              <ChevronDown />
            </chakra.span>
          </PrepIconButton>
        )}
      </HStack>
      {/* Mounted only while open, so each opening loads the element afresh.
          A region named as the chevron is, so it is found by what opened it. */}
      {linked && open && (
        <Box
          role="region"
          aria-label={`About ${item.label}`}
          borderTopWidth="1px"
          px="3"
          pt="2"
          pb="3"
        >
          <RunElementPanel
            idStory={idStory}
            idStoryScene={idStoryScene}
            idElement={elementIdOf(item)}
            label={item.label}
            heading={(text) => (
              <Heading as="h3" size="sm">
                {text}
              </Heading>
            )}
            onSceneStatusChange={(next) => onStatusChange(item.key, next)}
            onItemChange={onItemChange}
            onImageChange={(imageUrl) => onItemChange({ ...item, imageUrl })}
            onRemovedFromScene={() => onRemove(item.key)}
            stackTag={stackTag}
            otherStacks={otherStacks}
          />
        </Box>
      )}
    </Stack>
  );
}
