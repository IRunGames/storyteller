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
import { Star, Tag as TagIcon } from "lucide-react";
import { attachmentTagSchema } from "@/lib/attachment-schemas";
import { COVER_TAG } from "@/lib/attachments";

type Props = {
  /** What the attachment is called on its card, to name the button per row. */
  label: string;
  /** Every tag but cover, as the field holds them. */
  tags: string[];
  isCover: boolean;
  /** Whether the row may become the cover: only a READY one has a picture. */
  canCover: boolean;
  /**
   * Both resolve false when the change was refused; the field has already
   * put its rows back, and this says so inside the popover, where the user is
   * looking, rather than at the foot of the field behind it.
   */
  onTagsChange: (tags: string[]) => Promise<boolean>;
  onCoverChange: (isCover: boolean) => Promise<boolean>;
};

/**
 * The tag button on an attachment card and the popover it opens, for adding
 * and removing the row's tags. Cover is shown apart from the others, as a
 * starred chip, because it is not a tag like them: an object has one, and
 * setting it takes it from whichever attachment held it. A tag typed as
 * "cover" is therefore made the cover rather than added to the list.
 *
 * It holds no rows itself; the field does, and these callbacks are its own
 * optimistic handlers rather than server actions.
 */
export function AttachmentTagsPopover({
  label,
  tags,
  isCover,
  canCover,
  onTagsChange,
  onCoverChange,
}: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function change(run: () => Promise<boolean>, failure: string) {
    setError(null);
    if (!(await run())) setError(failure);
  }

  async function addDraft() {
    const typed = draft.trim();
    if (!typed) return;
    // Checked before the schema, which refuses "cover" as a plain tag.
    if (typed.toLowerCase() === COVER_TAG) {
      if (!canCover) {
        setError("Only a finished attachment can be the cover.");
        return;
      }
      setDraft("");
      if (!isCover) {
        await change(
          () => onCoverChange(true),
          "The cover could not be changed. Please try again.",
        );
      }
      return;
    }
    const parsed = attachmentTagSchema.safeParse(typed);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "That tag could not be added.");
      return;
    }
    setDraft("");
    if (tags.includes(parsed.data)) return;
    await change(
      () => onTagsChange([...tags, parsed.data]),
      "That tag could not be added. Please try again.",
    );
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
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Tags</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="xs">
            <Popover.Arrow />
            <Popover.Header fontWeight="semibold">
              <Popover.Title>Tags</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              <Stack gap="3">
                <Wrap gap="2" role="list" aria-label="Tags">
                  {isCover && (
                    <Tag.Root role="listitem" colorPalette="yellow" variant="solid">
                      <Tag.StartElement>
                        <Star fill="currentColor" />
                      </Tag.StartElement>
                      <Tag.Label>Cover</Tag.Label>
                      <Tag.EndElement>
                        <Tag.CloseTrigger
                          aria-label="Remove cover"
                          onClick={() =>
                            void change(
                              () => onCoverChange(false),
                              "The cover could not be changed. Please try again.",
                            )
                          }
                        />
                      </Tag.EndElement>
                    </Tag.Root>
                  )}
                  {tags.map((tag) => (
                    <Tag.Root role="listitem" key={tag}>
                      <Tag.Label>{tag}</Tag.Label>
                      <Tag.EndElement>
                        <Tag.CloseTrigger
                          aria-label={`Remove tag ${tag}`}
                          onClick={() =>
                            void change(
                              () => onTagsChange(tags.filter((other) => other !== tag)),
                              "That tag could not be removed. Please try again.",
                            )
                          }
                        />
                      </Tag.EndElement>
                    </Tag.Root>
                  ))}
                </Wrap>
                {!isCover && tags.length === 0 && (
                  <Text fontSize="sm" color="fg.muted">
                    No tags yet. Type cover to make this the cover.
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
