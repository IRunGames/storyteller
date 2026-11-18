"use client";

import { Box, chakra, HStack, Portal, Text, Tooltip } from "@chakra-ui/react";
import { ChevronLeft, ChevronRight, Dices } from "lucide-react";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import {
  formatStatValue,
  isNumberFormat,
  isSignedFormat,
  signOf,
  statTooltip,
  type EvaluatedStat,
} from "@/lib/stat-blocks";
import type { StatPatch } from "./actions";
import { StatNumber } from "./stat-number";

/**
 * A stat's label in the panel, with its description and what it is
 * initialized as (statTooltip), when the template gives either, as a
 * tooltip over it.
 */
export function StatLabel({
  stat,
}: {
  stat: Pick<EvaluatedStat, "label" | "description" | "initialRoll" | "initialFromLabel">;
}) {
  const tooltip = statTooltip(stat);
  const label = (
    <Text
      as="span"
      fontSize="sm"
      color="fg.muted"
      textDecoration={tooltip === "" ? undefined : "underline dotted"}
      cursor={tooltip === "" ? undefined : "help"}
    >
      {stat.label}
    </Text>
  );
  if (tooltip === "") return label;
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>{label}</Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{tooltip}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
/**
 * The die beside a stat with a roll, saying what it rolls. Given onRoll, a
 * button that makes the roll; otherwise only the mark.
 */
export function RollMark({
  roll,
  onRoll,
  disabled = false,
}: {
  roll: string;
  onRoll?: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        {onRoll ? (
          <chakra.button
            type="button"
            aria-label={`Rolls ${roll}`}
            color="fg.muted"
            display="inline-flex"
            cursor="pointer"
            rounded="sm"
            disabled={disabled}
            _hover={{ color: "fg" }}
            _disabled={{ opacity: 0.5, cursor: "default" }}
            _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
            onClick={onRoll}
          >
            <Dices size={14} />
          </chakra.button>
        ) : (
          <Box
            as="span"
            role="img"
            aria-label={`Rolls ${roll}`}
            color="fg.muted"
            display="inline-flex"
          >
            <Dices size={14} />
          </Box>
        )}
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>Rolls {roll}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
/**
 * One stat's value and, by its type and format, its controls. Whether a
 * number gets a box is decided by canEdit alone, and busy only quiets the
 * box and the buttons while a change is on its way, so the box stays the
 * same element across a change rather than flashing to words and back.
 */
export function StatCell({
  stat,
  canEdit,
  busy,
  onChange,
  onRoll,
}: {
  stat: EvaluatedStat;
  canEdit: boolean;
  busy: boolean;
  onChange: (patch: StatPatch) => void;
  onRoll?: () => void;
}) {
  const active = canEdit && !busy;
  const numeric = typeof stat.value === "number" || stat.value === null;
  // A box with a clicker where the value is a number the holder stores and
  // the stat is not static; words otherwise.
  const boxed = canEdit && isNumberFormat(stat.format) && !stat.static && numeric;
  const sign =
    isSignedFormat(stat.format) && typeof stat.value === "number" ? signOf(stat.value) : undefined;
  const words = (
    <Text as="span" data-testid={`stat-${stat.name}`}>
      {formatStatValue(stat)}
    </Text>
  );

  switch (stat.type) {
    case "display":
      return (
        <HStack gap="2">
          {boxed ? (
            <StatNumber
              label={stat.label}
              value={stat.value as number | null}
              sign={sign}
              canEdit={active}
              clicker={stat.upDown}
              onCommit={(value) => onChange({ value })}
              testId={`stat-${stat.name}`}
            />
          ) : (
            words
          )}
          {stat.roll !== "" && <RollMark roll={stat.roll} onRoll={onRoll} disabled={busy} />}
        </HStack>
      );
    case "computed":
      return (
        <Text as="span" color="fg.muted" data-testid={`stat-${stat.name}`}>
          {formatStatValue(stat)}
        </Text>
      );
    case "pool":
    case "stack": {
      const max = typeof stat.max === "number" ? stat.max : null;
      return (
        <HStack gap="1">
          {boxed ? (
            <StatNumber
              label={stat.label}
              value={stat.value as number | null}
              sign={sign}
              canEdit={active}
              clicker={stat.upDown}
              min={stat.min}
              max={stat.max}
              onCommit={(value) => onChange({ value })}
              testId={`stat-${stat.name}`}
            />
          ) : (
            words
          )}
          {/* A pool's max is the refill: pressing it puts the value back to
              the max, as the tooltip says. A stack's max is only shown. */}
          {max !== null &&
            (active && stat.type === "pool" ? (
              <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
                <Tooltip.Trigger asChild>
                  <chakra.button
                    type="button"
                    aria-label={`Refill ${stat.label}`}
                    fontSize="sm"
                    color="fg.muted"
                    cursor="pointer"
                    rounded="sm"
                    px="1"
                    _hover={{ color: "fg" }}
                    _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
                    onClick={() => onChange({ value: max })}
                  >
                    / {max}
                  </chakra.button>
                </Tooltip.Trigger>
                <Portal>
                  <Tooltip.Positioner>
                    <Tooltip.Content>
                      Click to refill {stat.label} to {max}
                    </Tooltip.Content>
                  </Tooltip.Positioner>
                </Portal>
              </Tooltip.Root>
            ) : (
              <Text as="span" fontSize="sm" color="fg.muted">
                / {max}
              </Text>
            ))}
          {stat.roll !== "" && <RollMark roll={stat.roll} onRoll={onRoll} disabled={busy} />}
        </HStack>
      );
    }
    case "dice":
      return (
        <HStack gap="2">
          {words}
          {typeof stat.value === "string" && (
            <RollMark roll={stat.value} onRoll={onRoll} disabled={busy} />
          )}
        </HStack>
      );
    case "rack": {
      const rack = stat.rack ?? [];
      const index = stat.rackIndex ?? -1;
      // The buttons where the template asks for them (Left/right), and never
      // on a static rack, which is shown as it is, as a static number is.
      const moves = active && stat.leftRight && !stat.static;
      return (
        <HStack gap="1">
          {moves && (
            <IconButtonWithTooltip
              label={`${stat.label} down`}
              onClick={() => index > 0 && onChange({ value: rack[index - 1] })}
            >
              <ChevronLeft />
            </IconButtonWithTooltip>
          )}
          {words}
          {moves && (
            <IconButtonWithTooltip
              label={`${stat.label} up`}
              onClick={() =>
                index >= 0 && index < rack.length - 1 && onChange({ value: rack[index + 1] })
              }
            >
              <ChevronRight />
            </IconButtonWithTooltip>
          )}
        </HStack>
      );
    }
  }
}
