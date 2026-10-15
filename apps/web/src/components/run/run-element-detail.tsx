"use client";

import { useState, type ReactNode } from "react";
import {
  Box,
  DataList,
  Heading,
  HStack,
  Link,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { ExternalLink } from "lucide-react";
import type { ElementLink } from "@/lib/run";
import { isWebUrl } from "@/lib/elements";
import { ELEMENT_KIND_LABELS, isElementKind } from "@/lib/elements";
import type { ElementDetail } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { StatusPill } from "@/components/status/status-pill";
import { sa_setElementImage } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";
import { RunElementImagePicker } from "./run-element-image-popover";
import { RunPictureCell } from "./run-picture-cell";

/**
 * An element's own rows, as both info popovers at the table list them: the
 * pill's in the play space and the library's. The status is a StatusPill the
 * storyteller can move, which reports the move so the popover holding it
 * keeps up.
 *
 * The picture leads: the attachment it points at as a small icon, which
 * opens it full size, with a − to take it away, or a + (RunPictureCell),
 * which opens the pill's picker in place below the rows. Either change is
 * reported, so the popover and the pill keep up.
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

  const picture = (
    <RunPictureCell
      imageUrl={element.imageUrl}
      label={element.name}
      addLabel="Add picture"
      removeLabel="Remove picture"
      picking={picking}
      onPickingChange={setPicking}
      onRemove={removing ? undefined : () => void removePicture()}
    />
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
    ["Link", linkCell(element)],
  ];
  // Headed as the scene's rows above it are, so the two parts read apart:
  // what the element is in the story, and how it stands in this scene.
  return (
    <Stack gap="3">
      <DetailSection title="In the story" rows={rows} />
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

/**
 * An external link as one row's value: the words for it, else the address,
 * opening in a new tab, with the address as the tooltip. An address that is
 * not a web address is shown as text, since the pill offers no link for it.
 * Null, to leave the row out, for none.
 */
export function linkCell(link: ElementLink): ReactNode {
  if (!link.url) return null;
  if (!isWebUrl(link.url)) return link.url;
  return (
    <Link href={link.url} target="_blank" rel="noopener noreferrer" title={link.url}>
      {link.urlText || link.url}
      <ExternalLink size={14} />
    </Link>
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
 * the heading's far end; a row with nothing to say is left out. The heading
 * can carry something beside it, such as a status pill, and a tooltip
 * (`hint`), and anything given as children is drawn after the rows.
 */
export function DetailSection({
  title,
  beside,
  hint,
  action,
  rows,
  children,
}: {
  title?: string;
  /** Drawn right after the heading, on its line: the scene status pill. */
  beside?: ReactNode;
  /** A tooltip over the heading, for a fact about the section: when it was added. */
  hint?: ReactNode;
  /** A control on the heading's line, about the section as a whole. */
  action?: ReactNode;
  rows: [string, ReactNode][];
  /** Drawn after the rows: a picker opened in place, a row of pictures. */
  children?: ReactNode;
}) {
  const shown = rows.filter(([, value]) => value !== null && value !== "");
  // Focusable when it has a tooltip, so the keyboard reaches it too.
  const heading = (
    <Heading as="h3" size="xs" color="fg.muted" tabIndex={hint ? 0 : undefined}>
      {title}
    </Heading>
  );
  return (
    <Stack gap="2">
      {title && (
        <HStack justify="space-between" gap="2">
          <HStack gap="2" minW="0">
            {hint ? (
              <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
                <Tooltip.Trigger asChild>{heading}</Tooltip.Trigger>
                <Portal>
                  <Tooltip.Positioner>
                    <Tooltip.Content>{hint}</Tooltip.Content>
                  </Tooltip.Positioner>
                </Portal>
              </Tooltip.Root>
            ) : (
              heading
            )}
            {beside}
          </HStack>
          {action}
        </HStack>
      )}
      {shown.length > 0 && (
        <DataList.Root orientation="horizontal" size="sm" gap="2">
          {shown.map(([name, value]) => (
            <DataList.Item key={name} alignItems="flex-start">
              <DataList.ItemLabel minW="24">{name}</DataList.ItemLabel>
              {/* pre-wrap, so a description's or notes' own line breaks show. */}
              <DataList.ItemValue whiteSpace="pre-wrap" alignItems="center">
                {value}
              </DataList.ItemValue>
            </DataList.Item>
          ))}
        </DataList.Root>
      )}
      {children}
    </Stack>
  );
}
