"use client";

import { useId, useState } from "react";
import {
  Button,
  Field,
  HStack,
  IconButton,
  Input,
  Popover,
  Portal,
  Stack,
  Tag,
  Text,
  Tooltip,
  Wrap,
} from "@chakra-ui/react";
import { Tag as TagIcon } from "lucide-react";
import type { z } from "zod";

type Props = {
  /** What the thing is called, to name the button. */
  label: string;
  tags: string[];
  /** What one typed tag must be: trimmed, cased and bounded by the holder's schema. */
  tagSchema: z.ZodType<string>;
  /**
   * Resolves false when the change was refused; the holder has already put
   * its tags back, and this says so inside the popover, where the user is
   * looking.
   */
  onTagsChange: (tags: string[]) => Promise<boolean>;
  /**
   * False draws the popover where the button is rather than at the end of
   * the page: inside a modal dialog, which makes everything outside itself
   * inert.
   */
  portalled?: boolean;
};

/**
 * A tag button and the popover it opens, for adding and removing a thing's
 * tags: the attachment card's editor (AttachmentTagsPopover) without the
 * cover, which is an attachment's alone, for the element panel's Tags row.
 * It holds no tags itself; the holder does, and the callback is the
 * holder's own handler rather than a server action.
 */
export function TagsPopover({ label, tags, tagSchema, onTagsChange, portalled = true }: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function change(next: string[], failure: string) {
    setError(null);
    if (!(await onTagsChange(next))) setError(failure);
  }

  async function addDraft() {
    const parsed = tagSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "That tag could not be added.");
      return;
    }
    setDraft("");
    if (tags.includes(parsed.data)) return;
    await change([...tags, parsed.data], "That tag could not be added. Please try again.");
  }

  return (
    // Not lazyMount: zag only links the dialog to its Popover.Title when the
    // title is in the page as the machine starts, so a lazily mounted popover
    // opens as an unnamed dialog.
    <Popover.Root
      ids={{ trigger: triggerId }}
      positioning={{ placement: "bottom-start" }}
      onOpenChange={(details) => {
        if (!details.open) setError(null);
      }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton aria-label={`Tags for ${label}`} size="xs" variant="ghost">
              <TagIcon />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal disabled={!portalled}>
          <Tooltip.Positioner>
            <Tooltip.Content>Tags</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal disabled={!portalled}>
        <Popover.Positioner>
          <Popover.Content w="xs">
            <Popover.Arrow />
            <Popover.Header fontWeight="semibold">
              <Popover.Title>Tags</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              <Stack gap="3">
                <Wrap gap="2" role="list" aria-label="Tags">
                  {tags.map((tag) => (
                    <Tag.Root role="listitem" key={tag}>
                      <Tag.Label>{tag}</Tag.Label>
                      <Tag.EndElement>
                        <Tag.CloseTrigger
                          aria-label={`Remove tag ${tag}`}
                          onClick={() =>
                            void change(
                              tags.filter((other) => other !== tag),
                              "That tag could not be removed. Please try again.",
                            )
                          }
                        />
                      </Tag.EndElement>
                    </Tag.Root>
                  ))}
                </Wrap>
                {tags.length === 0 && (
                  <Text fontSize="sm" color="fg.muted">
                    No tags yet.
                  </Text>
                )}

                <Field.Root invalid={!!error}>
                  <Field.Label>New tag</Field.Label>
                  <HStack w="full">
                    <Input
                      flex="1"
                      size="sm"
                      autoComplete="off"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void addDraft();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      type="button"
                      aria-disabled={!draft.trim()}
                      onClick={() => void addDraft()}
                    >
                      Add
                    </Button>
                  </HStack>
                  <Field.ErrorText>{error}</Field.ErrorText>
                </Field.Root>
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
