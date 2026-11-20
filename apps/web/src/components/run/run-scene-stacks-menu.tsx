"use client";

import { useState } from "react";
import { Button, chakra, Menu, Portal, Text } from "@chakra-ui/react";
import { ChevronDown } from "lucide-react";
import type { SceneItem } from "@/lib/scene-elements";
import { sa_moveSceneElement } from "@/components/scene-elements/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  idStory: number;
  idStoryScene: number;
  idSceneElement: number;
  /** What the element is called, to name the button. */
  name: string;
  /** The scene's stacks, in order. */
  stacks: string[];
  /** The link's tags: the stacks it is filed under. */
  tags: string[];
  /**
   * The stack of the pill the panel was opened from, which a move takes the
   * element out of. Null from the library, which has no pill.
   */
  stackTag: string | null;
  /** The element has been moved, as the pill now is. */
  onMoved: (item: SceneItem) => void;
};

/**
 * The stack an element is in, at the end of the SCENE pill on its panel: a
 * menu of the scene's stacks with the one it is in chosen, and choosing
 * another moves it there (sa_moveSceneElement), which redraws its pill in
 * that stack. A move, never a copy: the element leaves the stack it was in.
 *
 * From a pill, that is the pill's own stack. From the library, which has no
 * pill, it is the first stack the element is filed under, where the tables
 * show it (playStacks), or the first of the scene's when it is filed under
 * none. A scene with one stack has nowhere to move to, so its name is only
 * shown. Nothing is drawn as changed until the action has answered, so a
 * refusal leaves the menu as it was with a toast saying why.
 */
export function RunSceneStacksMenu({
  idStory,
  idStoryScene,
  idSceneElement,
  name,
  stacks,
  tags,
  stackTag,
  onMoved,
}: Props) {
  const [moving, setMoving] = useState(false);
  const current = stackTag ?? stacks.find((stack) => tags.includes(stack)) ?? stacks[0];

  async function move(to: string) {
    if (to === current) return;
    setMoving(true);
    try {
      const result = await sa_moveSceneElement(
        idStory,
        idStoryScene,
        idSceneElement,
        current ?? null,
        to,
      );
      if (result.ok) onMoved(result.item);
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The element could not be moved. Try again.", type: "error" });
    } finally {
      setMoving(false);
    }
  }

  if (stacks.length < 2) {
    return (
      <Text as="span" fontSize="xs" color={current ? "fg.muted" : "fg.subtle"}>
        {current ?? "No stacks"}
      </Text>
    );
  }

  return (
    <Menu.Root
      positioning={{ placement: "bottom-start" }}
      onSelect={(details) => void move(details.value)}
    >
      <Menu.Trigger asChild>
        <Button
          size="xs"
          variant="ghost"
          minW="0"
          overflow="hidden"
          loading={moving}
          aria-label={`Stack for ${name}`}
        >
          <chakra.span truncate minW="0">
            {current}
          </chakra.span>
          <ChevronDown />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            <Menu.RadioItemGroup value={current}>
              {stacks.map((stack) => (
                <Menu.RadioItem key={stack} value={stack}>
                  <Menu.ItemIndicator />
                  <Menu.ItemText>{stack}</Menu.ItemText>
                </Menu.RadioItem>
              ))}
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
