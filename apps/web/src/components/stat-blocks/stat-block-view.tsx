"use client";

import { useEffect, useState } from "react";
import { Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw } from "lucide-react";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { DetailSection } from "@/components/run/run-element-detail";
import { isRepeating, type EvaluatedGroup, type EvaluatedStat } from "@/lib/stat-blocks";
import {
  sa_getElementStatBlocks,
  sa_setElementStat,
  type ElementStatBlock,
  type StatPatch,
} from "./actions";

/**
 * An element's stat blocks at the table, under its rows in the element
 * panel: loaded as this mounts (sa_getElementStatBlocks), one StatBlockView
 * per system. Nothing is drawn for an element with no block and no story
 * system to start one, and nothing while loading, so the rows above do not
 * jump.
 */
export function ElementStatBlocks({
  idStory,
  idElement,
  canEdit,
}: {
  idStory: number;
  idElement: number;
  canEdit: boolean;
}) {
  const [blocks, setBlocks] = useState<ElementStatBlock[] | null>(null);

  useEffect(() => {
    let live = true;
    sa_getElementStatBlocks(idStory, idElement).then(
      (found) => live && setBlocks(found ?? []),
      () => live && setBlocks([]),
    );
    return () => {
      live = false;
    };
  }, [idStory, idElement]);

  if (!blocks || blocks.length === 0) return null;
  return (
    <Stack gap="3" data-testid="element-stat-blocks">
      {blocks.map((block) => (
        <StatBlockView
          key={block.idSystem}
          idStory={idStory}
          idElement={idElement}
          block={block}
          canEdit={canEdit}
          onChange={(changed) =>
            setBlocks((current) =>
              current
                ? current.map((b) => (b.idSystem === changed.idSystem ? changed : b))
                : current,
            )
          }
        />
      ))}
    </Stack>
  );
}

/**
 * One system's block as the table shows it: the system's name, then each
 * group as a section of label / value rows. A group that repeats is drawn
 * as its label and then one block per row, headed by the row's key, with
 * the row's other stats under it; the key is set on the prep form, not
 * here. With canEdit, a pool has − + and a refill, a stack − +, a rack
 * ◀ ▶; a display and a computed stat are shown as they are, the computed
 * one dimmer. Every control sends one change (sa_setElementStat), a row's
 * with the row's key, which comes back clamped and worked out, so a + at
 * the max simply stays; a refusal is toasted, as the Tags row's is.
 */
export function StatBlockView({
  idStory,
  idElement,
  block,
  canEdit,
  onChange,
}: {
  idStory: number;
  idElement: number;
  block: ElementStatBlock;
  canEdit: boolean;
  onChange: (block: ElementStatBlock) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function change(group: string, stat: string, patch: StatPatch, rowKey?: string) {
    setBusy(true);
    try {
      const result = await sa_setElementStat(
        idStory,
        idElement,
        block.idSystem,
        group,
        stat,
        patch,
        rowKey,
      );
      if (result.ok) onChange(result.block);
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The stat could not be changed. Try again.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="2" data-testid={`stat-block-view-${block.idSystem}`}>
      <Heading as="h3" size="xs">
        {block.label}
      </Heading>
      {block.groups.map((group) =>
        isRepeating(group) ? (
          <RepeatingGroupView
            key={group.name}
            group={group}
            canEdit={canEdit && !busy}
            onChange={(stat, patch, rowKey) => void change(group.name, stat, patch, rowKey)}
          />
        ) : (
          <DetailSection
            key={group.name}
            title={group.label}
            rows={group.stats.map((stat) => [
              stat.label,
              <StatCell
                key={stat.name}
                stat={stat}
                canEdit={canEdit && !busy}
                onChange={(patch) => void change(group.name, stat.name, patch)}
              />,
            ])}
          />
        ),
      )}
    </Stack>
  );
}

/**
 * A repeating group at the table: the group's label, then each row headed
 * by its key with the row's other stats as label / value lines under it,
 * and one quiet line when there are no rows yet. Rows reach the table
 * tidied, so every key is there and distinct.
 */
function RepeatingGroupView({
  group,
  canEdit,
  onChange,
}: {
  group: EvaluatedGroup;
  canEdit: boolean;
  onChange: (stat: string, patch: StatPatch, rowKey: string) => void;
}) {
  return (
    <Stack gap="2">
      <Text fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">
        {group.label}
      </Text>
      {group.rows.length === 0 && (
        <Text fontSize="sm" color="fg.muted">
          No {group.label} yet
        </Text>
      )}
      {group.rows.map((row) => {
        const key = String(row.key);
        return (
          <Stack key={key} gap="1" data-testid={`stat-row-${key}`}>
            <Text fontSize="sm" fontWeight="semibold">
              {key}
            </Text>
            <DetailSection
              rows={row.stats
                .filter((stat) => stat.name !== group.keyedBy)
                .map((stat) => [
                  stat.label,
                  <StatCell
                    key={stat.name}
                    stat={stat}
                    canEdit={canEdit}
                    onChange={(patch) => onChange(stat.name, patch, key)}
                  />,
                ])}
            />
          </Stack>
        );
      })}
    </Stack>
  );
}

const shown = (value: EvaluatedStat["value"]) => (value === null ? "—" : String(value));

/** One stat's value and, by its type, its controls. */
function StatCell({
  stat,
  canEdit,
  onChange,
}: {
  stat: EvaluatedStat;
  canEdit: boolean;
  onChange: (patch: StatPatch) => void;
}) {
  const current = typeof stat.value === "number" ? stat.value : 0;
  switch (stat.type) {
    case "display":
      return (
        <HStack gap="2">
          <Text as="span">{shown(stat.value)}</Text>
          {stat.valueFrom && (
            <Text as="span" fontSize="xs" color="fg.muted">
              from {stat.valueFrom}
            </Text>
          )}
        </HStack>
      );
    case "computed":
      return (
        <Text as="span" color="fg.muted">
          {shown(stat.value)}
        </Text>
      );
    case "pool":
    case "stack": {
      const atMax = typeof stat.max === "number" && current >= stat.max;
      const atMin = current <= (stat.min ?? 0);
      return (
        <HStack gap="1">
          {canEdit && (
            <PrepIconButton
              label={`${stat.label} −1`}
              onClick={() => !atMin && onChange({ value: current - 1 })}
            >
              <Minus />
            </PrepIconButton>
          )}
          <Text as="span" data-testid={`stat-${stat.name}`}>
            {shown(stat.value)}
            {typeof stat.max === "number" && ` / ${stat.max}`}
          </Text>
          {canEdit && (
            <PrepIconButton
              label={`${stat.label} +1`}
              onClick={() => !atMax && onChange({ value: current + 1 })}
            >
              <Plus />
            </PrepIconButton>
          )}
          {canEdit && stat.type === "pool" && typeof stat.max === "number" && (
            <PrepIconButton
              label={`Refill ${stat.label}`}
              onClick={() => onChange({ value: stat.max as number })}
            >
              <RotateCcw />
            </PrepIconButton>
          )}
          {stat.maxFrom && (
            <Text as="span" fontSize="xs" color="fg.muted">
              max from {stat.maxFrom}
            </Text>
          )}
        </HStack>
      );
    }
    case "rack": {
      const rack = stat.rack ?? [];
      const index = stat.rackIndex ?? -1;
      return (
        <HStack gap="1">
          {canEdit && (
            <PrepIconButton
              label={`${stat.label} down`}
              onClick={() => index > 0 && onChange({ value: rack[index - 1] })}
            >
              <ChevronLeft />
            </PrepIconButton>
          )}
          <Text as="span" data-testid={`stat-${stat.name}`}>
            {shown(stat.value)}
          </Text>
          {canEdit && (
            <PrepIconButton
              label={`${stat.label} up`}
              onClick={() =>
                index >= 0 && index < rack.length - 1 && onChange({ value: rack[index + 1] })
              }
            >
              <ChevronRight />
            </PrepIconButton>
          )}
        </HStack>
      );
    }
  }
}
