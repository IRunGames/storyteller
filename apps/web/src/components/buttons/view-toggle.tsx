"use client";

import type { ReactNode } from "react";
import { HStack, IconButton, Portal, Tooltip } from "@chakra-ui/react";
import { LayoutGrid, List } from "lucide-react";

/** How a page of things is shown: as cards, or as a table. */
export type CardsOrList = "cards" | "list";

const VIEWS: { view: CardsOrList; label: string; icon: ReactNode }[] = [
  { view: "cards", label: "Icon view", icon: <LayoutGrid /> },
  { view: "list", label: "List view", icon: <List /> },
];

/**
 * The pair of buttons in a page's upper right that shows its things as
 * cards or as a list, the one pressed being the view on show: the Stories
 * page and the Store. The page keeps the choice, as a preference of its own.
 */
export function ViewToggle({
  value,
  onChange,
}: {
  value: CardsOrList;
  onChange: (view: CardsOrList) => void;
}) {
  return (
    <HStack role="group" aria-label="View" gap="1">
      {VIEWS.map((option) => (
        <Tooltip.Root key={option.view} openDelay={200} positioning={{ placement: "top" }}>
          <Tooltip.Trigger asChild>
            <IconButton
              type="button"
              aria-label={option.label}
              aria-pressed={value === option.view}
              size="sm"
              variant={value === option.view ? "solid" : "outline"}
              onClick={() => onChange(option.view)}
            >
              {option.icon}
            </IconButton>
          </Tooltip.Trigger>
          <Portal>
            <Tooltip.Positioner>
              <Tooltip.Content>{option.label}</Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        </Tooltip.Root>
      ))}
    </HStack>
  );
}
