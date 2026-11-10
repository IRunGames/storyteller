"use client";

import { useId, useRef, useState } from "react";
import { chakra, IconButton, Popover, Portal, Stack, Text, Tooltip } from "@chakra-ui/react";
import { ChevronDown, Info, Pencil } from "lucide-react";
import type { SceneTextValues } from "@/lib/scene-schemas";
import type { SceneText, SetSceneTextResult } from "@/lib/scenes";
import { toaster } from "@/components/ui/toaster";
import type { ScenePicturesProps } from "./scene-pictures";
import { SceneTextForm } from "./scene-text-form";

type Props = {
  /** The scene's title, which heads the panel and names the chevron. */
  title: string;
  text: SceneText;
  /** Saves the panel; see SceneTextForm. */
  save: (values: SceneTextValues & { title?: string }) => Promise<SetSceneTextResult>;
  /** The text as stored, for the table to keep, and the title when the panel renames the scene. */
  onSaved: (text: SceneText, title?: string) => void;
  /** The live-edit page: the panel renames the scene too (SceneTextForm's Title). */
  editTitle?: boolean;
  /** A line under Notes; see SceneTextForm. */
  notesHint?: string;
  /** The scene's pictures under the fields, for the storyteller's panels; see SceneTextForm. */
  pictures?: ScenePicturesProps;
  /** A look at the scene (/preview/scene): the text is shown as it is, with no form. */
  readOnly?: boolean;
  /**
   * What the button shows: the storyteller's table has a chevron, which
   * turns over while the panel is open, as its pills' panels do; the
   * players' table and the preview an info button, as their pills' info is;
   * the storyboard's card a pencil, since there the panel is the one way to
   * change the scene's words, and the button is named Edit for it.
   */
  icon?: "chevron" | "info" | "pencil";
  /** The button's colour; the storyboard's card passes its white. */
  color?: string;
};

/**
 * The chevron beside the scene's title at either table, and the panel it
 * opens: the scene editor (SceneTextForm), the description and notes for
 * the storyteller at /run and the players at /play alike, so what the scene
 * is and what is being kept about it can be written up as it is played, and
 * for the storyteller the title and the scene's pictures as well.
 * The chevron turns over while the panel is open. The form is only drawn
 * while the panel is open, so each opening starts from the text as the
 * table holds it now; the title stays in the page while closed, for the
 * reason run-element-info-popover.tsx gives. Read only, the panel shows
 * the description and the notes as they are, a dash for one not written.
 */
export function SceneTextPopover({
  title,
  text,
  save,
  onSaved,
  readOnly = false,
  icon = "chevron",
  color,
  editTitle = false,
  notesHint,
  pictures,
}: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const label = icon === "pencil" ? `Edit ${title}` : `Describe ${title}`;
  // The description takes focus as the panel opens: zag would otherwise
  // settle focus on the panel itself a moment after opening, taking it off
  // whatever field was pressed first.
  const content = useRef<HTMLDivElement>(null);

  return (
    <Popover.Root
      ids={{ trigger: triggerId }}
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      positioning={{ placement: "bottom-end" }}
      initialFocusEl={() => content.current?.querySelector("textarea") ?? null}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              aria-label={label}
              aria-expanded={open}
              size="xs"
              variant="ghost"
              rounded="full"
              color={color}
            >
              {icon === "info" ? (
                <Info />
              ) : icon === "pencil" ? (
                <Pencil />
              ) : (
                <chakra.span
                  display="inline-flex"
                  transition="transform 0.15s"
                  transform={open ? "rotate(180deg)" : undefined}
                >
                  <ChevronDown />
                </chakra.span>
              )}
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>{icon === "pencil" ? label : "Description and notes"}</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content ref={content} w="md" maxH="80vh" overflowY="auto">
            <Popover.Arrow />
            <Popover.Header>
              <Popover.Title fontWeight="semibold">{title}</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              {open && readOnly && (
                <Stack gap="3">
                  {(["description", "notes"] as const).map((field) => (
                    <Stack key={field} gap="1">
                      <Text fontSize="sm" fontWeight="medium" textTransform="capitalize">
                        {field}
                      </Text>
                      {text[field] ? (
                        <Text whiteSpace="pre-wrap">{text[field]}</Text>
                      ) : (
                        <Text color="fg.subtle">—</Text>
                      )}
                    </Stack>
                  ))}
                </Stack>
              )}
              {open && !readOnly && (
                <SceneTextForm
                  text={text}
                  save={save}
                  title={editTitle ? title : undefined}
                  notesHint={notesHint}
                  pictures={pictures}
                  onSaved={(saved, savedTitle) => {
                    onSaved(saved, savedTitle);
                    setOpen(false);
                    toaster.create({ title: "Scene saved", type: "success" });
                  }}
                  onCancel={() => setOpen(false)}
                />
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
