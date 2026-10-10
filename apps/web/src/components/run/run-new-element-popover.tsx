"use client";

import { useId, useState } from "react";
import { IconButton, Popover, Portal, Tooltip } from "@chakra-ui/react";
import { Plus } from "lucide-react";
import { RUN_ADD_INVISIBLE, SCENE_ELEMENT_HIDDEN, type PlayItem } from "@/lib/run";
import { sa_createSceneElement } from "@/app/(app)/run/[id]/actions";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { RunElementForm } from "./run-element-form";

type Props = {
  idStory: number;
  idStoryScene: number;
  /** The stack's tag, which the new element is filed under; null for Default. */
  tag: string | null;
  /** The stack's name, for the button's label and the popover's title. */
  title: string;
  /** The new element, linked to the scene, for the stack to show. */
  onCreated: (item: PlayItem) => void;
};

/**
 * A stack's +: a popover with a short form for a new element, which is
 * written into the story and linked to the scene under the stack's tag
 * (sa_createSceneElement). The form is RunElementForm, the same one a
 * pill's info popover edits with.
 */
export function RunNewElementPopover({ idStory, idStoryScene, tag, title, onCreated }: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const label = `New element in ${title}`;
  const addInvisible = useUserPreferences().get<boolean>(RUN_ADD_INVISIBLE, false);

  return (
    // Not lazyMount: zag only links the dialog to its Popover.Title when the
    // title is in the page as the machine starts (attachment-tags-popover.tsx).
    <Popover.Root
      ids={{ trigger: triggerId }}
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      positioning={{ placement: "bottom-start" }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton aria-label={label} size="xs" variant="ghost" rounded="full">
              <Plus />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>{label}</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="sm" maxH="80vh" overflowY="auto">
            <Popover.Arrow />
            <Popover.Header>
              <Popover.Title fontWeight="semibold">New element in {title}</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              {/* Only drawn while open, so each opening starts a blank form. */}
              {open && (
                <RunElementForm
                  initial={{
                    kind: "PERSON",
                    name: "",
                    initialName: "",
                    title: "",
                    description: "",
                    notes: "",
                    status: "",
                    // The library's Add as invisible switch sets where a new
                    // element starts in the scene; the pill can still change it.
                    sceneStatus: addInvisible ? SCENE_ELEMENT_HIDDEN : "",
                  }}
                  save={(values) => sa_createSceneElement(idStory, idStoryScene, tag, values)}
                  onSaved={(item) => {
                    onCreated(item);
                    setOpen(false);
                  }}
                  onCancel={() => setOpen(false)}
                  submitLabel="Add element"
                />
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
