"use client";

import { chakra, Menu, Portal } from "@chakra-ui/react";
import { statusLabel, type StatusOption } from "@/lib/status";
import { pillStyle } from "./pill-style";

type Props = {
  /** The status chosen so far. */
  value: string;
  /** The workflow's statuses in order, from sa_listStatusOptions. */
  options: StatusOption[];
  onChange: (status: string) => void;
  /** Names the button for a screen reader, which hears the status after it. */
  label: string;
};

// A real button, as StatusPill's is, so it never submits the form it sits in.
const PillButton = chakra("button");

/**
 * A status pill inside a form: it looks like StatusPill and opens the same
 * menu, but choosing only changes the form's value, which the form saves
 * with everything else. Every status of the workflow is offered, since the
 * row may not exist yet and the action checks the choice when it saves.
 */
export function StatusChoicePill({ value, options, onChange, label }: Props) {
  const shown = options.find((option) => option.key === value)?.label ?? statusLabel(value);

  return (
    <Menu.Root onSelect={(details) => onChange(details.value)}>
      <Menu.Trigger asChild>
        <PillButton
          type="button"
          aria-label={`${label}: ${shown}`}
          data-status={value}
          cursor="pointer"
          {...pillStyle()}
          _hover={{ borderColor: "status.contrast" }}
        >
          {shown}
        </PillButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="10rem">
            {options
              .filter((option) => option.key !== value)
              .map((option) => (
                <Menu.Item key={option.key} value={option.key}>
                  {option.label}
                </Menu.Item>
              ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
