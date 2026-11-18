"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Badge, Box, chakra, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { Dices, Star } from "lucide-react";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import type { EvaluatedGroup, EvaluatedRow, EvaluatedStat } from "@/lib/stat-blocks";
import { type StatPatch } from "./actions";
import { GroupHeading, StatItem, StatLines } from "./stat-block-group-view";

/**
 * A repeating group at the table: the group's label, then each row
 * (RepeatingRow), and one quiet line when there are no rows yet. Rows reach
 * the table tidied, so every key is there and distinct.
 */
export function RepeatingGroupView({
  group,
  canEdit,
  busy,
  onChange,
  onRoll,
  onRollAll,
  onDefault,
}: {
  group: EvaluatedGroup;
  canEdit: boolean;
  busy: boolean;
  onChange: (stat: string, patch: StatPatch, rowKey: string) => void;
  onRoll?: (stat: string, rowKey: string) => void;
  /** Given, the heading carries a die that rolls every row's first die at once. */
  onRollAll?: () => void;
  onDefault?: (rowKey: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Stack gap="2">
      <HStack gap="1">
        <GroupHeading
          label={group.label}
          open={open}
          onToggle={() => setOpen((current) => !current)}
        />
        {onRollAll && (
          <IconButtonWithTooltip label="Roll All" size="2xs" disabled={busy} onClick={onRollAll}>
            <Dices />
          </IconButtonWithTooltip>
        )}
      </HStack>
      {open && group.rows.length === 0 && (
        <Text fontSize="sm" color="fg.muted">
          No {group.label} yet
        </Text>
      )}
      {open &&
        group.rows.map((row, index) => (
          <RepeatingRow
            key={String(row.key)}
            row={row}
            stats={row.stats.filter((stat) => stat.visible && stat.name !== group.keyedBy)}
            isDefault={index === 0}
            canEdit={canEdit}
            busy={busy}
            onChange={onChange}
            onRoll={onRoll}
            onDefault={onDefault}
          />
        ))}
    </Stack>
  );
}
/**
 * One row of a repeating group: its key in a pill, led by its star and
 * holding how many of it the element has, and the row's other visible
 * stats. On one line when they all fit across the row, the stats side by
 * side after the key; otherwise the key on a line of its own over the stats on their lines,
 * as a plain group draws them. The first row is the group's default, marked
 * with a filled star; with onDefault, every other row has an empty one that
 * makes it the default (sa_setDefaultRow). A row with no star keeps its
 * place, so the keys line up.
 *
 * Whether the line fits turns on the values shown, so it is measured, as
 * OverflowTooltip measures: drawn on one line, a row whose content runs past
 * its width (scrollWidth past clientWidth) is drawn stacked before the
 * browser paints, and the width the line needed is kept. A stacked row tries
 * the line again once it is that wide, or when its stats change, since the
 * width kept was for the values as they were.
 */
function RepeatingRow({
  row,
  stats,
  isDefault,
  canEdit,
  busy,
  onChange,
  onRoll,
  onDefault,
}: {
  row: EvaluatedRow;
  stats: EvaluatedStat[];
  isDefault: boolean;
  canEdit: boolean;
  busy: boolean;
  onChange: (stat: string, patch: StatPatch, rowKey: string) => void;
  onRoll?: (stat: string, rowKey: string) => void;
  onDefault?: (rowKey: string) => void;
}) {
  const key = String(row.key);
  const ref = useRef<HTMLDivElement>(null);
  const [oneLine, setOneLine] = useState(true);
  // What the one line needed when it last ran over, and for which values.
  const needed = useRef<{ row: EvaluatedRow; width: number } | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      if (oneLine) {
        if (element.scrollWidth > element.clientWidth) {
          needed.current = { row, width: element.scrollWidth };
          setOneLine(false);
        }
        return;
      }
      const known = needed.current;
      if (!known || known.row !== row || element.clientWidth >= known.width) setOneLine(true);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [oneLine, row]);

  const star = isDefault ? (
    <Box
      as="span"
      role="img"
      aria-label={`${key} is the default`}
      color="fg.muted"
      display="inline-flex"
    >
      <Star size={12} fill="currentColor" />
    </Box>
  ) : onDefault ? (
    <chakra.button
      type="button"
      aria-label={`Make ${key} the default`}
      color="fg.subtle"
      display="inline-flex"
      cursor="pointer"
      rounded="sm"
      disabled={busy}
      _hover={{ color: "fg" }}
      _disabled={{ opacity: 0.5, cursor: "default" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
      onClick={() => onDefault(key)}
    >
      <Star size={12} />
    </chakra.button>
  ) : (
    // The star's room, so this row's key starts where the others' do.
    <Box as="span" w="12px" flexShrink="0" aria-hidden />
  );
  const title = (
    <HStack gap="1" flexShrink="0">
      {star}
      {/* A solid pill, so each row's key stands out from the stats beside and under it. */}
      <Badge size="md" variant="solid" colorPalette="gray" rounded="full" fontWeight="semibold">
        {key}
        {/* How many of the row the element has, where more than one. */}
        {row.multiple > 1 && (
          <chakra.span fontWeight="normal" opacity="0.8">
            ×{row.multiple}
          </chakra.span>
        )}
      </Badge>
    </HStack>
  );
  const change = (stat: string, patch: StatPatch) => onChange(stat, patch, key);
  const roll = onRoll && ((stat: string) => onRoll(stat, key));

  if (oneLine) {
    return (
      <Flex
        ref={ref}
        align="center"
        columnGap="5"
        overflow="hidden"
        data-layout="line"
        data-testid={`stat-row-${key}`}
      >
        {title}
        {stats.map((stat) => (
          <StatItem
            key={stat.name}
            stat={stat}
            canEdit={canEdit}
            busy={busy}
            onChange={change}
            onRoll={roll}
          />
        ))}
      </Flex>
    );
  }
  return (
    <Stack ref={ref} gap="1" data-layout="stacked" data-testid={`stat-row-${key}`}>
      {title}
      <StatLines stats={stats} canEdit={canEdit} busy={busy} onChange={change} onRoll={roll} />
    </Stack>
  );
}
