"use client";

import { Text } from "@chakra-ui/react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { PlayStack } from "@/lib/run";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { PlayStackFrame } from "@/components/table-shell/play-stack-frame";
import { useSceneItemsContext } from "@/components/table-shell/scene-items-context";
import { RunNewElementPopover } from "./run-new-element-popover";
import { RunPlayPill } from "./run-play-pill";

type Props = {
  idStory: number;
  stack: PlayStack;
  /** Every stack's tag, in order, for each pill's Move to. */
  sceneTags: string[];
  /** The scene the table is on; null for none, which leaves out the +. */
  idStoryScene: number | null;
  /** The key of the item whose picture the storyteller last put up on the players' table, or null. */
  pictureUpKey?: string | null;
  /**
   * An item's tack was pressed: its picture goes up or comes down. Left out
   * away from the table, where the pills have no tack.
   */
  onPictureUpChange?: (key: string, up: boolean) => void;
  /**
   * The stack takes the width it is given rather than its own: a column of
   * the scene's edit page, where the stacks are one under another.
   */
  fullWidth?: boolean;
  /** The scene is complete: each pill is there to read, with nothing that changes it. */
  locked?: boolean;
  /** The stack is widened to the whole play space (useWideStacks). */
  wide?: boolean;
  /**
   * The expand button was pressed: the stack is to be wide, or narrow again.
   * Left out, as on the scene's edit page, there is no button.
   */
  onWideChange?: (wide: boolean) => void;
};

/**
 * One stack of the storyteller's play space: a scene tag, the + that makes
 * a new element filed under it, and the items it holds (playStacks says
 * which), in the frame every table draws its stacks in (PlayStackFrame).
 * Each item is a pill (RunPlayPill) on the panel colour, 45% see-through.
 * The pill blurs what is behind it, so the cover shows through as colour
 * without its detail fighting the text. The button before the + widens the
 * stack to the whole play space, its pills widened with it, side by side
 * only where the play space is wide enough for two of them, and back. Which stacks are wide is
 * the scene's (story_scenes.wide_tags), so the players' and the display
 * table draw them wide too, and the scene comes back as it was left. What
 * the + makes goes into the table's play space (useSceneItemsContext).
 */
export function RunPlayStack({
  idStory,
  stack,
  sceneTags,
  idStoryScene,
  pictureUpKey = null,
  onPictureUpChange,
  locked = false,
  fullWidth = false,
  wide = false,
  onWideChange,
}: Props) {
  const { put } = useSceneItemsContext();

  return (
    <PlayStackFrame
      title={stack.title}
      size="table"
      wide={wide}
      fullWidth={fullWidth}
      controls={
        <>
          {!fullWidth && onWideChange && (
            <IconButtonWithTooltip
              label={wide ? `Shrink ${stack.title}` : `Expand ${stack.title}`}
              onClick={() => onWideChange(!wide)}
            >
              {wide ? <Minimize2 /> : <Maximize2 />}
            </IconButtonWithTooltip>
          )}
          {/* No + on a complete scene, which takes nothing new: the action
              would refuse it anyway. */}
          {idStoryScene !== null && !locked && (
            <RunNewElementPopover
              idStory={idStory}
              idStoryScene={idStoryScene}
              tag={stack.tag}
              title={stack.title}
              onCreated={put}
            />
          )}
        </>
      }
      empty={
        <Text fontSize="sm" color="fg.muted">
          Nothing here yet.
        </Text>
      }
      items={stack.items}
      renderItem={(item) => (
        <RunPlayPill
          idStory={idStory}
          idStoryScene={idStoryScene}
          item={item}
          stackTag={stack.tag}
          otherStacks={sceneTags.filter((tag) => tag !== stack.tag)}
          sceneStacks={sceneTags}
          pictureUp={item.key === pictureUpKey}
          onPictureUpChange={onPictureUpChange}
          locked={locked}
        />
      )}
    />
  );
}
