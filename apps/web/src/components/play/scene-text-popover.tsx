"use client";

import { useId, useRef, useState } from "react";
import { chakra, IconButton, Popover, Portal, Stack, Text, Tooltip } from "@chakra-ui/react";
import { ChevronDown, Info } from "lucide-react";
import type { SceneTextValues } from "@/lib/scene-schemas";
import type { SceneText, SetSceneTextResult } from "@/lib/scenes";
import { toaster } from "@/components/ui/toaster";
import { SceneTextForm } from "./scene-text-form";

type Props = {
  /** The scene's title, which heads the panel and names the chevron. */
  title: string;
  text: SceneText;
  /** Saves the panel; see SceneTextForm. */
  save: (values: SceneTextValues) => Promise<SetSceneTextResult>;
  /** The text as stored, for the table to keep. */
  onSaved: (text: SceneText) => void;
  /** A look at the scene (/preview/scene): the text is shown as it is, with no form. */
  readOnly?: boolean;
  /**
   * What the button shows: the storyteller's table has a chevron, which
   * turns over while the panel is open, as its pills' panels do; the
   * players' table and the preview an info button, as their pills' info is.
   */
  icon?: "chevron" | "info";
};

/**
 * The chevron beside the scene's title at either table, and the panel it
 * opens: the scene's description and notes in a form (SceneTextForm), for
 * the storyteller at /run and the players at /play alike, so what the scene
 * is and what is being kept about it can be written up as it is played.
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
}: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const label = `Describe ${title}`;
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
            >
              {icon === "info" ? (
                <Info />
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
            <Tooltip.Content>Description and notes</Tooltip.Content>
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
                  onSaved={(saved) => {
                    onSaved(saved);
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
