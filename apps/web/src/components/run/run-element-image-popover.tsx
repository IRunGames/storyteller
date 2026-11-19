"use client";

import { useEffect, useId, useState } from "react";
import {
  Box,
  Button,
  HStack,
  Input,
  InputGroup,
  List,
  Popover,
  Portal,
  SegmentGroup,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Plus, Search } from "lucide-react";
import type { Attachment } from "@/lib/attachments";
import { attachmentLabel } from "@/lib/run";
import { sa_listAttachments } from "@/components/uploads/actions";
import { sa_setElementImage } from "@/components/elements/actions";
import { toaster } from "@/components/ui/toaster";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { useAttachmentSearch } from "@/components/uploads/use-attachment-search";
import type { PictureState } from "@/lib/annotations";

type Props = {
  idStory: number;
  /** The scene the table is on, whose attachments Scene lists; null for none. */
  idStoryScene: number | null;
  idElement: number;
  /** What the pill calls the element, to name the button. */
  label: string;
  /** The picture chosen, once the action has taken it, with its annotation controls' state. */
  onPicked: (imageUrl: string, picture: PictureState | null) => void;
};

/** Whose attachments the picker lists: the story's own, or the scene's. */
type PickFrom = "STORY" | "STORY_SCENE";

/**
 * A pill's + for an element with no picture: a popover listing attachments
 * to pick one from, as the library's Attachments tab lists them, with a
 * Story / Scene switch and a search box. Picking one points the element at
 * it (sa_setElementImage); it stays in its own list.
 *
 * Only finished attachments are listed, since an upload in flight has no
 * address to show. Fetched as the popover opens and again when the switch
 * moves, so it lists what is there now.
 */
export function RunElementImagePopover({
  idStory,
  idStoryScene,
  idElement,
  label,
  onPicked,
}: Props) {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const tooltip = "Add image (attachment)";

  return (
    <Popover.Root
      ids={{ trigger: triggerId }}
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      positioning={{ placement: "bottom-start" }}
    >
      <IconButtonWithTooltip
        label={`Add an image to ${label}`}
        tooltip={tooltip}
        popoverTrigger={triggerId}
      >
        <Plus />
      </IconButtonWithTooltip>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="md">
            <Popover.Arrow />
            <Popover.Header>
              <Popover.Title fontWeight="semibold">Image for {label}</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              {/* Only drawn while open, so each opening lists afresh. */}
              {open && (
                <RunElementImagePicker
                  idStory={idStory}
                  idStoryScene={idStoryScene}
                  idElement={idElement}
                  onPicked={(url, picture) => {
                    onPicked(url, picture);
                    setOpen(false);
                  }}
                />
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

/**
 * What the picker does with the attachment its Add picks: points an element
 * that exists at it (sa_setElementImage) and reports the picture's address,
 * or, for one not made yet, only hands the choice back for its form to send.
 */
type PickerTarget =
  | { idElement: number; onPicked: (imageUrl: string, picture: PictureState | null) => void }
  | { onChosen: (attachment: Attachment) => void };

/**
 * The list to pick an element's picture from: a Story / Scene switch, a
 * search box and the finished attachments, each with its picture, which
 * opens it full size, and an Add button that picks it. The pill's + shows
 * it in a popover; the info popovers' and the new-element form's Add
 * picture show it in place.
 */
export function RunElementImagePicker({
  idStory,
  idStoryScene,
  ...target
}: { idStory: number; idStoryScene: number | null } & PickerTarget) {
  const [from, setFrom] = useState<PickFrom>("STORY");
  // The list as fetched, with the holder it was fetched for, so a switch
  // shows Loading… until its own list is in rather than the last one's.
  const [loaded, setLoaded] = useState<{ key: string; rows: Attachment[] } | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<number | null>(null);

  const holder =
    from === "STORY_SCENE" && idStoryScene !== null
      ? { kind: "STORY_SCENE" as const, idExternal: idStoryScene }
      : { kind: "STORY" as const, idExternal: idStory };
  const holderKey = `${holder.kind}:${holder.idExternal}`;
  const needle = query.trim();

  useEffect(() => {
    let live = true;
    sa_listAttachments(holder.kind, holder.idExternal)
      .then((rows) => live && setLoaded({ key: holderKey, rows }))
      .catch(() => live && setLoaded({ key: holderKey, rows: [] }));
    return () => {
      live = false;
    };
  }, [holder.kind, holder.idExternal, holderKey]);

  // The search goes to the database after the library's pause, as its own
  // does.
  const search = useAttachmentSearch(holder.kind, holder.idExternal, query);

  const rows = loaded?.key === holderKey ? loaded.rows : null;
  // With nothing typed, everything; while a search is out, what the last one
  // matched would mislead, so nothing narrows until it is in.
  const ids = needle === "" ? null : search.isSearching ? new Set<number>() : search.shownIds;

  async function pick(row: Attachment) {
    if ("onChosen" in target) {
      target.onChosen(row);
      return;
    }
    setSaving(row.idAttachment);
    try {
      const result = await sa_setElementImage(idStory, target.idElement, row.idAttachment);
      // Picking an attachment always gives a picture; only clearing gives null.
      if (result.ok && result.imageUrl) target.onPicked(result.imageUrl, result.picture);
      else if (!result.ok) toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The image could not be added. Try again.", type: "error" });
    } finally {
      setSaving(null);
    }
  }

  // Every match, in a list that scrolls, rather than the library's first
  // ten: a story's pool can run to dozens, and a picture past the cut was
  // nowhere to be found unless the storyteller thought to search for it.
  const shown = (rows ?? [])
    .filter((row) => row.status === "READY" && row.url !== null)
    .filter((row) => ids === null || ids.has(row.idAttachment));

  return (
    <Stack gap="3">
      <SegmentGroup.Root
        size="xs"
        aria-label="Whose attachments"
        value={holder.kind}
        onValueChange={(details) => setFrom(details.value as PickFrom)}
        alignSelf="flex-start"
      >
        <SegmentGroup.Indicator />
        <SegmentGroup.Items
          items={[
            { value: "STORY", label: "Story" },
            { value: "STORY_SCENE", label: "Scene", disabled: idStoryScene === null },
          ]}
        />
      </SegmentGroup.Root>
      <InputGroup startElement={<Search size={14} />}>
        <Input
          type="search"
          size="sm"
          aria-label="Search the attachments"
          placeholder="Search the attachments"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </InputGroup>
      {rows === null ? (
        <Text color="fg.muted">Loading…</Text>
      ) : shown.length === 0 ? (
        <Text color="fg.muted">{needle ? "No matches." : "No attachments here yet."}</Text>
      ) : (
        <List.Root gap="1" listStyleType="none" maxH="60" overflowY="auto" aria-label="Attachments">
          {shown.map((row) => {
            const name = attachmentLabel(row);
            return (
              <List.Item key={row.idAttachment}>
                {/* The picture opens the attachment full size, as it does in
                    the library, so the storyteller can look before choosing;
                    Add is what picks it. */}
                <HStack gap="2" p="1">
                  <Box boxSize="12" flexShrink="0" rounded="sm" overflow="hidden" bg="bg.muted">
                    <AttachmentPreview
                      url={row.url!}
                      label={name}
                      tags={row.tags}
                      isCover={row.isCover}
                    />
                  </Box>
                  {/* Two lines, broken anywhere, with the whole name on
                      hover: generated file names share a long prefix and
                      differ only further along, so one truncated line made
                      them all read the same. */}
                  <Text
                    flex="1"
                    minW="0"
                    fontSize="sm"
                    lineClamp="2"
                    wordBreak="break-all"
                    title={name}
                  >
                    {name}
                  </Text>
                  <Button
                    size="xs"
                    variant="outline"
                    flexShrink="0"
                    aria-label={`Add ${name}`}
                    loading={saving === row.idAttachment}
                    disabled={saving !== null && saving !== row.idAttachment}
                    onClick={() => void pick(row)}
                  >
                    <Plus />
                    Add
                  </Button>
                </HStack>
              </List.Item>
            );
          })}
        </List.Root>
      )}
    </Stack>
  );
}
