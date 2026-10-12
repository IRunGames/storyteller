"use client";

import { useState, type ReactNode } from "react";
import { Box, Button, DataList, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { ImagePlus, Minus } from "lucide-react";
import { ELEMENT_KIND_LABELS, isElementKind } from "@/lib/elements";
import type { ElementDetail } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { StatusPill } from "@/components/status/status-pill";
import { sa_setElementImage } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";
import { RunElementImagePicker } from "./run-element-image-popover";

/**
 * An element's own rows, as both info popovers at the table list them: the
 * pill's in the play space and the library's. The status is a StatusPill the
 * storyteller can move, which reports the move so the popover holding it
 * keeps up.
 *
 * The picture leads: the attachment it points at as a small icon, which
 * opens it full size, with a − to take it away, or Add picture, which opens the pill's picker in place
 * below the rows. Either change is reported, so the popover and the pill
 * keep up.
 */
export function ElementDetailRows({
  element,
  statusOptions,
  onStatusChange,
  idStory,
  idStoryScene,
  onImageChange,
}: {
  element: ElementDetail;
  statusOptions: StatusOption[];
  onStatusChange: (status: string) => void;
  idStory: number;
  /** The scene the table is on, whose attachments the picker's Scene lists. */
  idStoryScene: number | null;
  /** The element's picture has changed: its address, or null for none. */
  onImageChange: (imageUrl: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function removePicture() {
    setRemoving(true);
    try {
      const result = await sa_setElementImage(idStory, element.idElement, null);
      if (result.ok) onImageChange(null);
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The picture could not be removed. Try again.", type: "error" });
    } finally {
      setRemoving(false);
    }
  }

  const picture = element.imageUrl ? (
    <HStack gap="1">
      {/* Pressed, it opens full size, as the pill's picture does; the
          attachment's tags are not the element's, so they are left out. */}
      <Box boxSize="10" flexShrink="0" rounded="sm" overflow="hidden" bg="bg.muted">
        <AttachmentPreview
          url={element.imageUrl}
          label={element.name}
          tags={[]}
          isCover={false}
          showTags={false}
        />
      </Box>
      {!removing && (
        <PrepIconButton label="Remove picture" onClick={() => void removePicture()} outlined>
          <Minus />
        </PrepIconButton>
      )}
    </HStack>
  ) : (
    <Button
      size="xs"
      variant="outline"
      aria-expanded={picking}
      onClick={() => setPicking((open) => !open)}
    >
      <ImagePlus />
      Add picture
    </Button>
  );

  const rows: [string, ReactNode][] = [
    ["Picture", picture],
    // After the picture, the initial name: it is what the players know the
    // element as, and what its pill in the play space shows by default.
    ["Initial name", element.initialName],
    ["Name", always(element.name)],
    ["Kind", isElementKind(element.kind) ? ELEMENT_KIND_LABELS[element.kind] : element.kind],
    ["Title", always(element.title)],
    [
      "Status",
      <StatusPill
        key="status"
        table="elements"
        id={element.idElement}
        status={element.status}
        options={statusOptions}
        canEdit
        onChanged={onStatusChange}
      />,
    ],
    ["Tags", tagList(element.tags)],
    ["Description", always(element.description)],
    ["Notes", always(element.notes)],
  ];
  // The element's own rows need no heading: the popover is about it.
  return (
    <Stack gap="3">
      <DetailSection rows={rows} />
      {picking && !element.imageUrl && (
        <Box borderWidth="1px" rounded="md" p="2">
          <RunElementImagePicker
            idStory={idStory}
            idStoryScene={idStoryScene}
            idElement={element.idElement}
            onPicked={(imageUrl) => {
              setPicking(false);
              onImageChange(imageUrl);
            }}
          />
        </Box>
      )}
    </Stack>
  );
}

/** A tag list as one row's value, or null to leave the row out. */
export function tagList(tags: string[]): string | null {
  return tags.length > 0 ? tags.join(", ") : null;
}

// Name, title, description and notes are always listed, a dash for an empty
// one, so the storyteller sees what is still to write; the rest only when
// there is something to say.
function always(value: string | null): ReactNode {
  return value ? (
    value
  ) : (
    <Text as="span" color="fg.subtle">
      —
    </Text>
  );
}

/**
 * Label / value rows under an optional heading, with an optional control at
 * the heading's far end; a row with nothing to say is left out.
 */
export function DetailSection({
  title,
  action,
  rows,
}: {
  title?: string;
  /** A control on the heading's line, about the section as a whole. */
  action?: ReactNode;
  rows: [string, ReactNode][];
}) {
  return (
    <Stack gap="2">
      {title && (
        <HStack justify="space-between" gap="2">
          <Heading as="h3" size="xs" color="fg.muted">
            {title}
          </Heading>
          {action}
        </HStack>
      )}
      <DataList.Root orientation="horizontal" size="sm" gap="2">
        {rows
          .filter(([, value]) => value !== null && value !== "")
          .map(([name, value]) => (
            <DataList.Item key={name} alignItems="flex-start">
              <DataList.ItemLabel minW="24">{name}</DataList.ItemLabel>
              {/* pre-wrap, so a description's or notes' own line breaks show. */}
              <DataList.ItemValue whiteSpace="pre-wrap" alignItems="center">
                {value}
              </DataList.ItemValue>
            </DataList.Item>
          ))}
      </DataList.Root>
    </Stack>
  );
}
