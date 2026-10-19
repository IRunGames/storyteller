"use client";

import { useState } from "react";
import { Button, chakra, Menu, Portal, Text } from "@chakra-ui/react";
import { ChevronDown } from "lucide-react";
import type { PlayItem } from "@/lib/run";
import { sa_setSceneElementTags } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";
import { tagList } from "./run-element-detail";

type Props = {
  idStory: number;
  idStoryScene: number;
  idElement: number;
  /** What the element is called, to name the button. */
  name: string;
  /** The scene's stacks, in order. */
  stacks: string[];
  /** The link's tags: the stacks it is filed under. */
  tags: string[];
  /** The stacks saved after a tick, as the pill now is. */
  onSaved: (item: PlayItem) => void;
};

/**
 * The stacks an element is filed under in the scene, on the In this scene
 * line beside its status: a menu of the scene's stacks with a tick by each
 * it is in. A tick or an untick saves at once (sa_setSceneElementTags) and
 * the menu stays open for the next, so filing an element under two stacks
 * is two presses rather than a dialog and a Save. The button reads the
 * stacks as the pill's row did, "scene, assets", or No stacks for none.
 * Nothing is drawn as changed until the action has answered, so a refusal
 * leaves the menu as it was with a toast saying why.
 */
export function RunSceneStacksMenu({
  idStory,
  idStoryScene,
  idElement,
  name,
  stacks,
  tags,
  onSaved,
}: Props) {
  const [saving, setSaving] = useState(false);
  const shown = tagList(tags);

  async function tick(stack: string, checked: boolean) {
    // The scene's order, not the order of ticking, so the pill files the
    // same way however the stacks were chosen.
    const next = stacks.filter((each) => (each === stack ? checked : tags.includes(each)));
    setSaving(true);
    try {
      const result = await sa_setSceneElementTags(idStory, idStoryScene, idElement, next);
      if (result.ok) onSaved(result.item);
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The stacks could not be saved. Try again.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (stacks.length === 0) {
    return (
      <Text as="span" fontSize="xs" color="fg.subtle">
        No stacks
      </Text>
    );
  }

  return (
    <Menu.Root positioning={{ placement: "bottom-start" }}>
      <Menu.Trigger asChild>
        <Button
          size="xs"
          variant="ghost"
          minW="0"
          overflow="hidden"
          color={shown ? undefined : "fg.subtle"}
          aria-label={`Stacks for ${name}`}
        >
          <chakra.span truncate minW="0">
            {shown ?? "No stacks"}
          </chakra.span>
          <ChevronDown />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            {stacks.map((stack) => (
              <Menu.CheckboxItem
                key={stack}
                value={stack}
                checked={tags.includes(stack)}
                disabled={saving}
                closeOnSelect={false}
                onCheckedChange={(checked) => void tick(stack, checked)}
              >
                <Menu.ItemIndicator />
                <Menu.ItemText>{stack}</Menu.ItemText>
              </Menu.CheckboxItem>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
