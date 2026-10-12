"use client";

import { useEffect, useId, useState } from "react";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  InputGroup,
  List,
  Popover,
  Portal,
  SegmentGroup,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Plus, Search } from "lucide-react";
import type { Attachment } from "@/lib/attachments";
import { ELEMENT_SEARCH_DELAY_MS } from "@/lib/elements";
import { attachmentLabel, RUN_LIST_SIZE } from "@/lib/run";
import { sa_listAttachments, sa_searchAttachments } from "@/components/uploads/actions";
import { sa_setElementImage } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";

type Props = {
  idStory: number;
  /** The scene the table is on, whose attachments Scene lists; null for none. */
  idStoryScene: number | null;
  idElement: number;
  /** What the pill calls the element, to name the button. */
  label: string;
  /** The picture chosen, once the action has taken it. */
  onPicked: (imageUrl: string) => void;
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
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
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
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              aria-label={`Add an image to ${label}`}
              size="xs"
              variant="ghost"
              rounded="full"
            >
              <Plus />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>{tooltip}</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
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
                  onPicked={(url) => {
                    onPicked(url);
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
  | { idElement: number; onPicked: (imageUrl: string) => void }
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
  // What the search matched, with the query it was for: a stale answer, or
  // one for a box since cleared, is not applied.
  const [matched, setMatched] = useState<{ key: string; ids: ReadonlySet<number> } | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const holder =
    from === "STORY_SCENE" && idStoryScene !== null
      ? { kind: "STORY_SCENE" as const, idExternal: idStoryScene }
      : { kind: "STORY" as const, idExternal: idStory };
  const holderKey = `${holder.kind}:${holder.idExternal}`;
  const needle = query.trim();
  const searchKey = `${holderKey}:${needle}`;

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
  // does. Each answer is kept with the query it was for, so only the one
  // for what the box holds now is applied.
  useEffect(() => {
    if (needle === "") return;
    const timer = setTimeout(async () => {
      try {
        const ids = await sa_searchAttachments(holder.kind, holder.idExternal, needle);
        setMatched({ key: searchKey, ids: new Set(ids) });
      } catch {
        // Leave the last results in place; the next keystroke tries again.
      }
    }, ELEMENT_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [holder.kind, holder.idExternal, needle, searchKey]);

  const rows = loaded?.key === holderKey ? loaded.rows : null;
  // With nothing typed, everything; while a search is out, what the last one
  // for this holder matched would mislead, so nothing narrows until it is in.
  const ids = needle === "" ? null : matched?.key === searchKey ? matched.ids : new Set<number>();

  async function pick(row: Attachment) {
    if ("onChosen" in target) {
      target.onChosen(row);
      return;
    }
    setSaving(row.idAttachment);
    try {
      const result = await sa_setElementImage(idStory, target.idElement, row.idAttachment);
      // Picking an attachment always gives a picture; only clearing gives null.
      if (result.ok && result.imageUrl) target.onPicked(result.imageUrl);
      else if (!result.ok) toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The image could not be added. Try again.", type: "error" });
    } finally {
      setSaving(null);
    }
  }

  const shown = (rows ?? [])
    .filter((row) => row.status === "READY" && row.url !== null)
    .filter((row) => ids === null || ids.has(row.idAttachment))
    .slice(0, RUN_LIST_SIZE);

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
                  <Box boxSize="8" flexShrink="0" rounded="sm" overflow="hidden" bg="bg.muted">
                    <AttachmentPreview
                      url={row.url!}
                      label={name}
                      tags={row.tags}
                      isCover={row.isCover}
                    />
                  </Box>
                  <Text flex="1" minW="0" truncate>
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
