"use client";

import { useId } from "react";
import { IconButton, Menu, Portal, Tooltip } from "@chakra-ui/react";
import { ArrowDownUp } from "lucide-react";
import { ELEMENT_SORT_KEYS, ELEMENT_SORT_LABELS, type ElementSort } from "@/lib/elements";
import {
  ATTACHMENT_SORT_KEYS,
  ATTACHMENT_SORT_LABELS,
  type AttachmentSort,
  type RunLibrarySource,
} from "@/lib/run";

type Props = {
  /** The tab the library is on: it decides which sorts the menu offers. */
  tab: RunLibrarySource;
  attachmentSort: AttachmentSort;
  elementSort: ElementSort;
  onAttachmentSortChange: (sort: AttachmentSort) => void;
  onElementSortChange: (sort: ElementSort) => void;
};

/**
 * The sort menu beside the library's heading: one button, whose menu lists
 * the sorts for the tab in view, the Attachments tab's three or the element
 * tabs' five. The choice is one radio group, so the sort in force is marked.
 * Tooltip and menu share the one trigger id for the reason NavThemeMenu
 * gives: each stamps an id on the button and positions by it.
 */
export function RunLibrarySortMenu({
  tab,
  attachmentSort,
  elementSort,
  onAttachmentSortChange,
  onElementSortChange,
}: Props) {
  const triggerId = useId();
  const forAttachments = tab === "ATTACHMENT";

  return (
    <Menu.Root positioning={{ placement: "bottom-start" }} ids={{ trigger: triggerId }}>
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Menu.Trigger asChild>
            <IconButton aria-label="Sort the library" variant="ghost" size="xs" rounded="full">
              <ArrowDownUp />
            </IconButton>
          </Menu.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Sort the library</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            {forAttachments ? (
              <Menu.RadioItemGroup
                value={attachmentSort}
                onValueChange={(details) => onAttachmentSortChange(details.value as AttachmentSort)}
              >
                {ATTACHMENT_SORT_KEYS.map((key) => (
                  <Menu.RadioItem key={key} value={key}>
                    <Menu.ItemIndicator />
                    <Menu.ItemText>{ATTACHMENT_SORT_LABELS[key]}</Menu.ItemText>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioItemGroup>
            ) : (
              <Menu.RadioItemGroup
                value={elementSort}
                onValueChange={(details) => onElementSortChange(details.value as ElementSort)}
              >
                {ELEMENT_SORT_KEYS.map((key) => (
                  <Menu.RadioItem key={key} value={key}>
                    <Menu.ItemIndicator />
                    <Menu.ItemText>{ELEMENT_SORT_LABELS[key]}</Menu.ItemText>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioItemGroup>
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
