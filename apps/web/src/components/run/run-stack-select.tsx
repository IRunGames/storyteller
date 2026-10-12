"use client";

import { useState } from "react";
import { Button, chakra, Menu, Portal } from "@chakra-ui/react";
import { ChevronDown, Plus } from "lucide-react";
import { RunNewStackDialog } from "./run-new-stack-dialog";

type Props = {
  idStory: number;
  idStoryScene: number;
  /** The scene's stacks, in order. */
  tags: string[];
  /** The stack chosen, or null for a scene with no stacks. */
  value: string | null;
  onChange: (tag: string) => void;
  /** The scene's stacks after Create new stack, with the new one chosen. */
  onTagsChange: (tags: string[]) => void;
};

/**
 * The library footer's In select: which stack what the library adds goes
 * in, by the arrow or the +. A menu of the scene's stacks and Create new
 * stack, which opens RunNewStackDialog and chooses the stack it makes. A
 * scene with no stacks has only its Default one, so the menu lists none
 * and the button says Default.
 */
export function RunStackSelect({
  idStory,
  idStoryScene,
  tags,
  value,
  onChange,
  onTagsChange,
}: Props) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Menu.Root
        positioning={{ placement: "top-end" }}
        onSelect={(details) => {
          if (details.value === "new") setCreating(true);
        }}
      >
        <Menu.Trigger asChild>
          {/* Shrinks before the switch beside it does, its name truncating. */}
          <Button
            size="xs"
            variant="ghost"
            minW="0"
            flexShrink="1"
            overflow="hidden"
            aria-label={`Add to the ${value ?? "Default"} stack`}
          >
            <chakra.span color="fg.muted" flexShrink="0">
              In:
            </chakra.span>
            <chakra.span truncate minW="0">
              {value ?? "Default"}
            </chakra.span>
            <ChevronDown />
          </Button>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content>
              {tags.length > 0 && (
                <>
                  <Menu.RadioItemGroup
                    value={value ?? undefined}
                    onValueChange={(details) => onChange(details.value)}
                  >
                    {tags.map((tag) => (
                      <Menu.RadioItem key={tag} value={tag}>
                        <Menu.ItemIndicator />
                        <Menu.ItemText>{tag}</Menu.ItemText>
                      </Menu.RadioItem>
                    ))}
                  </Menu.RadioItemGroup>
                  <Menu.Separator />
                </>
              )}
              <Menu.Item value="new">
                <Plus />
                Create new stack
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
      <RunNewStackDialog
        idStory={idStory}
        idStoryScene={idStoryScene}
        tags={tags}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(next, name) => {
          onTagsChange(next);
          onChange(name);
          setCreating(false);
        }}
      />
    </>
  );
}
