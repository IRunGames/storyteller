"use client";

import { useId } from "react";
import { chakra, HStack, Input, InputGroup, Portal, Stack, Tooltip } from "@chakra-ui/react";
import { Search } from "lucide-react";
import type { StatusOption } from "@/lib/status";
import { pillStyle } from "./pill-style";

/**
 * What a column is being narrowed to: the words typed, and the statuses still
 * switched on. `statuses` is every status of the workflow to start with, so a
 * list that applies it shows everything; each one switched off takes its rows
 * out. All of them off shows nothing, which is what it says.
 */
export type StatusSearchValue = {
  query: string;
  statuses: string[];
};

/** Every status selected, which is what a column starts with. */
export function allSelected(options: StatusOption[]): StatusSearchValue {
  return { query: "", statuses: options.map((option) => option.key) };
}

type Props = {
  /** What is being searched, for the labels: "Timeline", "Scenes". */
  label: string;
  /**
   * The workflow of the rows being searched, loaded from the database. No
   * options means the rows have no statuses, and only the box is shown.
   */
  options: StatusOption[];
  value: StatusSearchValue;
  onChange: (next: StatusSearchValue) => void;
  /**
   * What a screen reader hears the pills called. Defaults to "Filter <label>
   * by status"; a column whose pills are not statuses (the Attachments
   * column's Covers) says what they are instead.
   */
  groupLabel?: string;
};

// A toggle, not a status: same colours as the pill that shows a row's status,
// so the two read as the same thing, and dimmed to a plain outline when it is
// switched off.
const ToggleButton = chakra("button");

/**
 * A search box with the statuses of what it searches above it: one pill per
 * status, all on to begin with, and switching one off takes its rows out of
 * the results.
 *
 * The two belong together — a column is narrowed by words and by status at
 * once, and a list has to be told both in one go — so they are one component
 * with one value rather than two that a caller has to keep in step. What
 * either of them means for a row is the caller's business: the Timeline
 * filters the rows it holds, the Scenes column asks the database again.
 *
 * The pills come from the workflow, so a status added to it appears here
 * without anything being changed.
 */
export function StatusSearch({ label, options, value, onChange, groupLabel }: Props) {
  const groupId = useId();

  function toggle(key: string) {
    const statuses = value.statuses.includes(key)
      ? value.statuses.filter((status) => status !== key)
      : // Put it back where the workflow has it, so the selection never
        // depends on the order things were clicked in.
        options
          .filter((option) => option.key === key || value.statuses.includes(option.key))
          .map((option) => option.key);
    onChange({ ...value, statuses });
  }

  return (
    <Stack gap="2">
      {options.length > 0 && (
        // The pills run off the side of a narrow column rather than wrapping
        // onto a second line and pushing the box down; the row scrolls.
        <HStack
          role="group"
          aria-labelledby={groupId}
          gap="1"
          overflowX="auto"
          flexWrap="nowrap"
          pb="1"
          // A scrollbar over a one-line row takes more height than the row
          // itself on the platforms that always show one.
          css={{ scrollbarWidth: "thin" }}
        >
          <chakra.span id={groupId} srOnly>
            {groupLabel ?? `Filter ${label} by status`}
          </chakra.span>
          {options.map((option) => {
            const on = value.statuses.includes(option.key);
            return (
              // The tooltip says what the pill is doing to the list right
              // now, so the two states need no legend. It takes the place of
              // the status's description as a title attribute, which would
              // be a second tooltip over the same pill.
              <Tooltip.Root key={option.key} openDelay={200} positioning={{ placement: "top" }}>
                <Tooltip.Trigger asChild>
                  <ToggleButton
                    type="button"
                    // A toggle rather than a checkbox: it is pressed or it is not,
                    // and pressing it changes what is listed rather than filling
                    // in a form.
                    aria-pressed={on}
                    data-status={option.key}
                    onClick={() => toggle(option.key)}
                    flex="none"
                    cursor="pointer"
                    {...pillStyle()}
                    {...(on
                      ? {}
                      : {
                          // Switched off: the colour goes, the outline stays, so
                          // the row keeps its shape and the eye goes to what is
                          // still on.
                          bg: "transparent",
                          color: "fg.muted",
                          borderColor: "border",
                          opacity: 0.7,
                        })}
                  >
                    {option.label}
                  </ToggleButton>
                </Tooltip.Trigger>
                <Portal>
                  <Tooltip.Positioner>
                    <Tooltip.Content>
                      {on ? `Including ${option.label}` : `Excluding ${option.label}`}
                    </Tooltip.Content>
                  </Tooltip.Positioner>
                </Portal>
              </Tooltip.Root>
            );
          })}
        </HStack>
      )}

      <InputGroup startElement={<Search size={14} />}>
        <Input
          type="search"
          size="sm"
          aria-label={`Search ${label}`}
          placeholder={`Search ${label.toLowerCase()}`}
          value={value.query}
          onChange={(event) => onChange({ ...value, query: event.target.value })}
        />
      </InputGroup>
    </Stack>
  );
}
