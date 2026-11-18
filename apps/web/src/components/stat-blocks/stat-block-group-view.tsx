"use client";

import { useState } from "react";
import { chakra, Flex, HStack, Stack } from "@chakra-ui/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { statLines, type EvaluatedStat } from "@/lib/stat-blocks";
import type { StatPatch } from "./actions";
import { StatCell, StatLabel } from "./stat-block-cells";

/** Rolls one stat's die, a row's by the row's key. */
export type Roller = (group: string, stat: string, rowKey?: string) => Promise<void>;
/**
 * A stat block's heading at the table: its label as a button that folds the
 * block's lines away and brings them back, open to start with.
 */
export function GroupHeading({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <chakra.button
      type="button"
      display="inline-flex"
      alignItems="center"
      gap="1"
      alignSelf="flex-start"
      cursor="pointer"
      rounded="sm"
      fontSize="xs"
      fontWeight="semibold"
      color="fg.muted"
      textTransform="uppercase"
      aria-expanded={open}
      onClick={onToggle}
      _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
    >
      <chakra.span display="inline-flex" aria-hidden>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </chakra.span>
      {label}
    </chakra.button>
  );
}
/** A plain group: its label, folding its visible stats on their lines away and back. */
export function GroupView({
  label,
  stats,
  canEdit,
  busy,
  onChange,
  onRoll,
  testId,
}: {
  label: string;
  stats: EvaluatedStat[];
  canEdit: boolean;
  busy: boolean;
  onChange: (stat: string, patch: StatPatch) => void;
  onRoll?: (stat: string) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(true);
  const visible = stats.filter((stat) => stat.visible);
  if (visible.length === 0) return null;
  return (
    <Stack gap="1" data-testid={testId}>
      <GroupHeading label={label} open={open} onToggle={() => setOpen((current) => !current)} />
      {open && (
        <StatLines
          stats={visible}
          canEdit={canEdit}
          busy={busy}
          onChange={onChange}
          onRoll={onRoll}
        />
      )}
    </Stack>
  );
}
export function StatLines({
  stats,
  canEdit,
  busy,
  onChange,
  onRoll,
}: {
  stats: EvaluatedStat[];
  canEdit: boolean;
  busy: boolean;
  onChange: (stat: string, patch: StatPatch) => void;
  onRoll?: (stat: string) => void;
}) {
  return (
    <Stack gap="1">
      {statLines(stats).map((line) => (
        <Flex key={line[0].name} wrap="wrap" columnGap="5" rowGap="1" data-stat-line>
          {line.map((stat) => (
            <StatItem
              key={stat.name}
              stat={stat}
              canEdit={canEdit}
              busy={busy}
              onChange={onChange}
              onRoll={onRoll}
            />
          ))}
        </Flex>
      ))}
    </Stack>
  );
}
/** One stat on a line: its label, then its value and controls. */
export function StatItem({
  stat,
  canEdit,
  busy,
  onChange,
  onRoll,
}: {
  stat: EvaluatedStat;
  canEdit: boolean;
  busy: boolean;
  onChange: (stat: string, patch: StatPatch) => void;
  onRoll?: (stat: string) => void;
}) {
  return (
    <HStack gap="2" align="center" flexShrink="0">
      <StatLabel stat={stat} />
      <StatCell
        stat={stat}
        canEdit={canEdit}
        busy={busy}
        onChange={(patch) => onChange(stat.name, patch)}
        onRoll={onRoll && (() => onRoll(stat.name))}
      />
    </HStack>
  );
}
