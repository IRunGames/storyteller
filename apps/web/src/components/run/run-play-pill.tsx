"use client";

import { useState } from "react";
import { Box, chakra, Heading, HStack, Menu, Portal, Stack, Text } from "@chakra-ui/react";
import { ChevronDown, Dices } from "lucide-react";
import {
  DEFAULT_ELEMENT_SHOWING,
  ELEMENT_SHOWING,
  elementIdOf,
  isElementShowing,
  pillText,
  SCENE_ELEMENT_DISABLED,
  SCENE_ELEMENT_HIDDEN,
  SCENE_ELEMENT_SHOWN,
  SCENE_ELEMENT_TAPPED,
  withShowing,
  type ElementShowing,
  type SceneItem,
  type SceneElementStatus,
} from "@/lib/scene-elements";
import {
  sa_pulseSceneElement,
  sa_setSceneElementShowing,
  sa_setSceneElementShowInfo,
  sa_setSceneElementStatus,
} from "@/components/scene-elements/actions";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { useSceneItemsContext } from "@/components/table-shell/scene-items-context";
import { CHANGE_FAILED } from "@/lib/messages";
import { OverflowTooltip } from "@/components/popovers/overflow-tooltip";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";
import { RunElementImagePopover } from "./run-element-image-popover";
import { RunElementPanel } from "./run-element-panel";
import { ElementStatBlocks } from "@/components/stat-blocks/stat-block-view";
import { RunInfoToggle } from "./run-info-toggle";
import { RunPictureTack } from "./run-picture-tack";
import { ScenePictureControls } from "@/components/annotations/scene-picture-controls";
import { FogMark } from "./run-fog-mark";
import type { PictureState } from "@/lib/annotations";
import { RunSceneStatusMenu } from "./run-scene-status-menu";
import { glass } from "@/theme";

type Props = {
  idStory: number;
  /** The scene the table is on; null for none. */
  idStoryScene: number | null;
  item: SceneItem;
  /** The tag of the stack this pill is drawn in; null for the Default stack. */
  stackTag: string | null;
  /** Every stack of the scene, in order, which the panel's stacks menu offers. */
  sceneStacks: string[];
  /**
   * Whether this is the picture the storyteller last put up on the players'
   * table, which the thumbnail's glow and tack show. The table's state, not
   * the item's: a pulse is not written anywhere (sa_pulseSceneElement), and
   * one picture is up at a time, so the table keeps the one key.
   */
  pictureUp?: boolean;
  /**
   * The tack was pressed: this picture goes up (true) or comes down, or goes
   * back after a refusal. Left out where there is no table to put it up on,
   * such as a scene's edit page, and the thumbnail then has no tack.
   */
  onPictureUpChange?: (key: string, up: boolean) => void;
  /**
   * The scene is complete: the pill is there to read. Its name is plain,
   * its info toggle only says which way it is, it has no status menu, tack
   * or +, and its panel opens locked, with nothing that edits.
   */
  locked?: boolean;
};

/** The pill with its picture marked annotated, or not. */
function withAnnotated(item: SceneItem, annotated: boolean): SceneItem {
  const { annotated: _was, ...rest } = item;
  return annotated ? { ...rest, annotated: true } : rest;
}

/**
 * The pill with its picture as read back by its annotation controls: shown
 * as the players see it once its copy is rendered, and marked annotated.
 */
function withPicture(item: SceneItem, picture: PictureState): SceneItem {
  return withAnnotated(
    { ...item, imageUrl: picture.shownUrl ?? item.imageUrl },
    picture.isAnnotated,
  );
}

/**
 * One item in a stack of the play space. An element linked to the scene
 * leads with its info toggle (whether the players see its description) and
 * its status menu (RunSceneStatusMenu), its name is a dropdown of the fields
 * it can show, and a chevron at its end opens the element panel
 * (RunElementPanel) in place under it; a die before the chevron, on an
 * element whose link carries a stat block, opens the blocks alone
 * (ElementStatBlocks) instead, one or the other at a time. Its thumbnail carries a tack
 * (RunPictureTack) that puts the picture up full size on the players' table
 * and takes it down, a pulse over the story's topic rather than anything
 * written, with the theme's second highlight glowing round the thumbnail
 * while it is up. It shows its scene status: hidden
 * from the players (INVISIBLE) with the theme's highlight round it as a
 * border and a glow, tapped (TAPPED) a shade dimmer, switched off (DISABLED)
 * in grey italics; the menu's icon says which either way. It has no ✕:
 * taking an element out of the scene is the panel's − beside In this scene.
 * Anything the page alone holds is just its name. Every change to the item
 * goes to the table's play space (useSceneItemsContext), which owns it.
 */
export function RunPlayPill({
  idStory,
  idStoryScene,
  item,
  stackTag,
  sceneStacks,
  pictureUp = false,
  onPictureUpChange,
  locked = false,
}: Props) {
  const { replace, setStatus } = useSceneItemsContext();
  const status = item.sceneStatus;
  const linked = status !== undefined && idStoryScene !== null;
  // What may be pressed to change the link: linked, and the scene not complete.
  const live = linked && !locked;
  const isHidden = status === SCENE_ELEMENT_HIDDEN;
  const isDisabled = status === SCENE_ELEMENT_DISABLED;
  const isTapped = status === SCENE_ELEMENT_TAPPED;
  // The column's default, for a link the page holds without having read it.
  const showInfo = item.showInfo ?? true;
  // What is open under the pill: the whole panel, its stat blocks, or nothing.
  const [open, setOpen] = useState<"about" | "stats" | null>(null);
  const toggle = (which: "about" | "stats") =>
    setOpen((current) => (current === which ? null : which));
  const rolls = item.hasStatBlocks === true && item.idSceneElement !== undefined;
  // The link the pill stands for, with everything its actions name: an
  // element may be in the scene more than once, so the actions name the
  // link, not the element. Null for an element the page alone holds, whose
  // handlers below do nothing.
  const link =
    status !== undefined && idStoryScene !== null && item.idSceneElement !== undefined
      ? { idStoryScene, idSceneElement: item.idSceneElement, status }
      : null;
  function linkIds(): [idStoryScene: number, idSceneElement: number] {
    if (!link) throw new Error("The element is not linked to the scene.");
    return [link.idStoryScene, link.idSceneElement];
  }

  // Every change to the link is shown at once and goes back if the action
  // refuses (useOptimisticAction); the table owns the item, so each tells
  // the play space what to show rather than keeping a copy here.
  const [, chooseImage] = useOptimisticAction(
    pictureUp,
    (next) =>
      sa_pulseSceneElement(idStory, ...linkIds(), {
        action: next ? "preview.open" : "preview.close",
      }),
    {
      onShow: (up) => onPictureUpChange?.(item.key, up),
      failed: "That could not be sent. Try again.",
    },
  );
  function toggleImage() {
    if (!link || !onPictureUpChange) return;
    chooseImage(!pictureUp);
  }

  const [, chooseStatus] = useOptimisticAction<string>(
    link?.status ?? SCENE_ELEMENT_SHOWN,
    async (next) => {
      const result = await sa_setSceneElementStatus(idStory, ...linkIds(), next);
      return result.ok ? { ok: true, value: result.status } : result;
    },
    { onShow: (next) => setStatus(item.key, next), failed: CHANGE_FAILED },
  );
  function pickStatus(next: SceneElementStatus) {
    if (!link || next === link.status) return;
    chooseStatus(next);
  }

  const [, chooseInfo] = useOptimisticAction(
    showInfo,
    (next) => sa_setSceneElementShowInfo(idStory, ...linkIds(), next),
    { onShow: (next) => replace({ ...item, showInfo: next }), failed: CHANGE_FAILED },
  );
  function toggleInfo() {
    if (!link) return;
    chooseInfo(!showInfo);
  }

  // The name's dropdown: which of the element's fields the pill shows.
  const [, chooseShowing] = useOptimisticAction<ElementShowing>(
    item.showing ?? DEFAULT_ELEMENT_SHOWING,
    (next) => sa_setSceneElementShowing(idStory, ...linkIds(), next),
    { onShow: (next) => replace(withShowing(item, next)), failed: CHANGE_FAILED },
  );
  function pickShowing(next: string) {
    if (!link || !isElementShowing(next) || next === item.showing) return;
    chooseShowing(next);
  }

  const fields = item.fields;
  const highlighted = fields && item.showing ? pillText(fields, item.showing).highlighted : false;

  return (
    <Stack
      gap="0"
      borderWidth={isHidden ? "2px" : "1px"}
      borderColor={isHidden ? "run.hidden" : undefined}
      boxShadow={isHidden ? "0 0 10px 1px var(--chakra-colors-run-hidden)" : undefined}
      rounded="2xl"
      css={glass}
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
            <RunInfoToggle showInfo={showInfo} onToggle={live ? toggleInfo : undefined} />
            {live && (
              <RunSceneStatusMenu label={item.label} status={status} onChange={pickStatus} />
            )}
          </HStack>
        )}
        {item.imageUrl ? (
          // Pressed, the picture opens full size, as an attachment's does in
          // the library; its tags are the attachment's, not the element's, so
          // the preview leaves them out, and offers the picture's annotation
          // controls in their place. The fog mark says it is annotated. The frame round it carries the glow
          // and the tack: the tack sits past the corner, which the picture's
          // own overflow clip would cut off.
          <Box
            position="relative"
            flexShrink="0"
            boxSize="12"
            rounded="sm"
            boxShadow={pictureUp ? "0 0 10px 2px var(--chakra-colors-run-picture-up)" : undefined}
            data-picture-up={pictureUp}
          >
            <Box boxSize="12" rounded="sm" overflow="hidden">
              <AttachmentPreview
                url={item.imageUrl}
                label={item.label}
                tags={[]}
                isCover={false}
                showTags={false}
                actions={
                  item.idSceneElement != null ? (
                    <ScenePictureControls
                      idStory={idStory}
                      idSceneElement={item.idSceneElement}
                      label={item.label}
                      portalled={false}
                      onAnnotatedChange={(annotated) => replace(withAnnotated(item, annotated))}
                      onPictureChange={(picture) => replace(withPicture(item, picture))}
                    />
                  ) : undefined
                }
              />
            </Box>
            {item.annotated && <FogMark />}
            {live && onPictureUpChange && (
              <RunPictureTack label={item.label} pictureUp={pictureUp} onToggle={toggleImage} />
            )}
          </Box>
        ) : (
          // In the picture's place, beside the status: a + to give the
          // element one from the story's or the scene's attachments.
          live && (
            <Box flexShrink="0" me="-1.5">
              <RunElementImagePopover
                idStory={idStory}
                idStoryScene={idStoryScene}
                idElement={elementIdOf(item)}
                label={item.label}
                onPicked={(imageUrl, picture) =>
                  replace(
                    picture ? withPicture({ ...item, imageUrl }, picture) : { ...item, imageUrl },
                  )
                }
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
          {!live || !fields ? (
            <Text
              fontWeight={highlighted ? "bold" : "medium"}
              color={highlighted && !isDisabled ? "run.initialName" : undefined}
              truncate
            >
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
                      onValueChange={(e) => pickShowing(e.value)}
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
          {/* The title, with the whole of it as a tooltip when it is cut off. */}
          {item.detail && (
            <OverflowTooltip
              fontSize="sm"
              color={isDisabled || isHidden ? "fg.subtle" : "fg.muted"}
            >
              {item.detail}
            </OverflowTooltip>
          )}
        </Stack>
        {/* The die opens the stat blocks alone under the pill. */}
        {linked && rolls && (
          <IconButtonWithTooltip
            label={`Stat blocks for ${item.label}`}
            expanded={open === "stats"}
            onClick={() => toggle("stats")}
          >
            <Dices />
          </IconButtonWithTooltip>
        )}
        {/* The chevron at the end opens the panel under the pill, and turns
            over while it is open. */}
        {linked && (
          <IconButtonWithTooltip
            label={`About ${item.label}`}
            expanded={open === "about"}
            onClick={() => toggle("about")}
          >
            <chakra.span
              display="inline-flex"
              transition="transform 0.15s"
              transform={open === "about" ? "rotate(180deg)" : undefined}
            >
              <ChevronDown />
            </chakra.span>
          </IconButtonWithTooltip>
        )}
      </HStack>
      {/* Mounted only while open, so each opening loads the blocks afresh.
          A region named as the die is, so it is found by what opened it. */}
      {linked && rolls && open === "stats" && (
        <Box
          role="region"
          aria-label={`Stat blocks for ${item.label}`}
          borderTopWidth="1px"
          px="3"
          pt="2"
          pb="3"
        >
          <ElementStatBlocks
            holder={{ idStory, idSceneElement: item.idSceneElement! }}
            canEdit={!locked}
            // A roll is said in the chat as the players know the element;
            // an invisible element's stays with the storyteller.
            rollAs={{ title: item.label, quiet: isHidden }}
          />
        </Box>
      )}
      {/* Mounted only while open, so each opening loads the element afresh.
          A region named as the chevron is, so it is found by what opened it. */}
      {linked && open === "about" && (
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
            idSceneElement={item.idSceneElement ?? null}
            label={item.label}
            locked={locked}
            canEdit={!locked}
            heading={(text) => (
              <Heading as="h3" size="sm">
                {text}
              </Heading>
            )}
            stackTag={stackTag}
            sceneStacks={sceneStacks}
          />
        </Box>
      )}
    </Stack>
  );
}
