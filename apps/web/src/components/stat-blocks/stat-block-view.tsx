"use client";

import { useEffect, useState } from "react";
import { Box, chakra, Flex, Heading, HStack, Portal, Stack, Text, Tooltip } from "@chakra-ui/react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Dices,
  Pencil,
  Star,
} from "lucide-react";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import {
  formatStatValue,
  isNumberFormat,
  isRepeating,
  isSignedFormat,
  signOf,
  statLines,
  type EvaluatedGroup,
  type EvaluatedRow,
  type EvaluatedStat,
} from "@/lib/stat-blocks";
import {
  sa_copyStatBlocksFromElement,
  sa_copyStatBlocksToElement,
  sa_getStatBlocks,
  sa_rollGroupRows,
  sa_setDefaultRow,
  sa_setStat,
  type ElementStatBlock,
  type StatBlockHolder,
  type StatPatch,
  sa_rollStat,
  type RollAs,
} from "./actions";
import { StatBlockPanelForm } from "./stat-block-panel-form";
import { StatNumber } from "./stat-number";
import { FoldButton } from "./fold-button";
import { rollText } from "@/lib/roll";

/**
 * A holder's stat blocks at the table, under its rows in the element
 * panel: loaded as this mounts (sa_getStatBlocks), one StatBlockView per
 * system. The holder is the scene element when the panel was opened from
 * a pill, so play changes the scene's copy, and the element itself when it
 * was opened from the library. Nothing is drawn for a holder with no block
 * and no story system to start one, and nothing while loading, so the rows
 * above do not jump. Folded, the blocks start closed behind a line that
 * counts them (FoldButton), as the panel's scene card wants them, so the
 * card opens short; the pill's die region shows them open.
 */
export function ElementStatBlocks({
  holder,
  canEdit,
  rollAs,
  copyFromElement,
  folded,
}: {
  holder: StatBlockHolder;
  canEdit: boolean;
  /** Given, each die at the table rolls (sa_rollStat) as this says; left out, a die only says what it rolls. */
  rollAs?: RollAs;
  /** The element itself carries a block, so a scene element's view offers to paste it over this one. */
  copyFromElement?: boolean;
  /** Start closed behind a line that counts the blocks, opened by a press. */
  folded?: boolean;
}) {
  const [blocks, setBlocks] = useState<ElementStatBlock[] | null>(null);
  const [open, setOpen] = useState(false);
  const { idStory } = holder;
  const idElement = "idElement" in holder ? holder.idElement : null;
  const idSceneElement = "idSceneElement" in holder ? holder.idSceneElement : null;

  useEffect(() => {
    let live = true;
    const target: StatBlockHolder =
      idElement !== null
        ? { idStory, idElement }
        : { idStory, idSceneElement: idSceneElement as number };
    sa_getStatBlocks(target).then(
      (found) => live && setBlocks(found ?? []),
      () => live && setBlocks([]),
    );
    return () => {
      live = false;
    };
  }, [idStory, idElement, idSceneElement]);

  if (!blocks || blocks.length === 0) return null;
  const views = (
    <Stack gap="3" data-testid="element-stat-blocks">
      {blocks.map((block) => (
        <StatBlockView
          key={block.idSystem}
          holder={holder}
          block={block}
          canEdit={canEdit}
          rollAs={rollAs}
          copyFromElement={copyFromElement}
          onChange={(changed) =>
            setBlocks((current) =>
              current
                ? current.map((b) => (b.idSystem === changed.idSystem ? changed : b))
                : current,
            )
          }
          onBlocks={setBlocks}
        />
      ))}
    </Stack>
  );
  if (!folded) return views;
  // The blocks the holder has filled in, counted on the fold's line.
  const count = blocks.reduce((sum, block) => sum + (block.stored ? block.carried.length : 0), 0);
  return (
    <Stack gap="2">
      <FoldButton open={open} onToggle={() => setOpen((current) => !current)}>
        {count === 0
          ? "No stat blocks in this scene yet"
          : count === 1
            ? "1 stat block in this scene"
            : `${count} stat blocks in this scene`}
      </FoldButton>
      {open && views}
    </Stack>
  );
}

/**
 * One system's block as the table shows it: the system's name with a
 * pencil, then each carried stat block as a section of its label and its
 * stats on the lines statLines lays out, leaving out the stats the template
 * hides and a block with nothing left to show. A block that repeats is
 * drawn as its label and then one run of lines per row, headed by the
 * row's key; the key is set on the edit form, not here. A repeating group
 * the template marks Roll all has a die on its heading that rolls the first
 * die of every row at once (sa_rollGroupRows), the rolls the chat does not
 * get toasted together. With canEdit, a
 * number is an entry box, with an up/down clicker where the template asks
 * for one (StatNumber, `upDown`), a pool has
 * its "/ max" as a button that refills it, said in its tooltip, a rack ◀ ▶;
 * a display word, a computed stat and a static stat
 * are shown as they are, the computed one dimmer. A signed format
 * shows its sign beside the number. Every control sends one change
 * (sa_setStat), a row's with the row's key, which comes back clamped and
 * worked out, so an up at the max simply stays; a refusal is toasted, as
 * the Tags row's is. The pencil turns the whole into the edit form with
 * the picker (StatBlockPanelForm), and back when it is saved or left; while
 * a scene element's form is open, a copy button beside the pencil writes
 * the block as it stands over the element's own
 * (sa_copyStatBlocksToElement), making play's changes the new baseline.
 * The other way, while the form is closed and the element carries a block
 * of its own (copyFromElement), a paste button beside the pencil writes the
 * element's blocks over the holder's (sa_copyStatBlocksFromElement),
 * starting the scene element again from what it was prepared with.
 *
 * The stats pane names each element itself and keeps the pencil on that
 * line, so it leaves the heading line out (`showLabel` and `showControls`
 * false) and holds whether the form is open (`editing`, told back through
 * `onEditingChange` when the form saves or is left).
 */
export function StatBlockView({
  holder,
  block,
  canEdit,
  rollAs,
  copyFromElement,
  showLabel = true,
  showControls = true,
  editing: editingGiven,
  onEditingChange,
  onChange,
  onBlocks,
}: {
  holder: StatBlockHolder;
  block: ElementStatBlock;
  canEdit: boolean;
  rollAs?: RollAs;
  /** The element itself carries a block, so the paste from it is offered beside the pencil. */
  copyFromElement?: boolean;
  /** Whether the system's name heads the block; false where the holder names it already. */
  showLabel?: boolean;
  /** Whether the pencil and the copy buttons are drawn here; false where the holder draws a pencil of its own. */
  showControls?: boolean;
  /** Whether the form is open, where the holder holds that; left out, the view holds it itself. */
  editing?: boolean;
  /** The form has been opened, saved or left here, for a holder that holds whether it is open. */
  onEditingChange?: (editing: boolean) => void;
  onChange: (block: ElementStatBlock) => void;
  onBlocks: (blocks: ElementStatBlock[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [ownEditing, setOwnEditing] = useState(false);
  const editing = editingGiven ?? ownEditing;
  const setEditing = (next: boolean) => {
    setOwnEditing(next);
    onEditingChange?.(next);
  };
  const [copying, setCopying] = useState(false);

  // The copy back to the element, offered while a scene element's form is open.
  async function copyToElement() {
    setCopying(true);
    try {
      const result = await sa_copyStatBlocksToElement(holder, block.idSystem);
      if (result.ok) toaster.create({ title: "Stats copied to the element", type: "success" });
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The stats could not be copied. Try again.", type: "error" });
    } finally {
      setCopying(false);
    }
  }

  // The element's blocks over the holder's, every system at once: what the
  // element was prepared with becomes the scene element's again, whatever
  // play made of them.
  async function pasteFromElement() {
    setCopying(true);
    try {
      const result = await sa_copyStatBlocksFromElement(holder);
      if (result.ok) {
        onBlocks(result.blocks);
        toaster.create({ title: "Stats copied from the element", type: "success" });
      } else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The stats could not be copied. Try again.", type: "error" });
    } finally {
      setCopying(false);
    }
  }

  // A die pressed: the roll is made on the server and said in the chat; one
  // the chat does not get (quiet, or no table) is toasted here instead.
  const roll: Roller | undefined = rollAs
    ? async (group, stat, rowKey) => {
        setBusy(true);
        try {
          const result = await sa_rollStat(holder, block.idSystem, group, stat, rollAs, rowKey);
          if (!result.ok) toaster.create({ title: result.error, type: "error" });
          else if (!result.posted) {
            toaster.create({
              title: rollText(result.roll),
              description: result.roll.detail,
              type: "info",
            });
          }
        } catch {
          toaster.create({ title: "The roll could not be made. Try again.", type: "error" });
        } finally {
          setBusy(false);
        }
      }
    : undefined;

  // The group's Roll All: every row's first die, as one press; said as a
  // die's roll is, the quiet ones toasted together.
  async function rollAll(group: EvaluatedGroup) {
    if (!rollAs) return;
    setBusy(true);
    try {
      const result = await sa_rollGroupRows(holder, block.idSystem, group.name, rollAs);
      if (!result.ok) toaster.create({ title: result.error, type: "error" });
      else if (result.rolls.length === 0) {
        toaster.create({ title: "There was nothing to roll.", type: "info" });
      } else {
        const quiet = result.rolls.filter((rolled) => !rolled.posted);
        if (quiet.length > 0) {
          toaster.create({
            title: `${group.label} rolled quietly`,
            description: quiet.map((rolled) => rollText(rolled.roll)).join(" · "),
            type: "info",
          });
        }
      }
    } catch {
      toaster.create({ title: "The rolls could not be made. Try again.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  // A row's star: the row becomes the group's default, the first row.
  async function setDefault(group: string, rowKey: string) {
    setBusy(true);
    try {
      const result = await sa_setDefaultRow(holder, block.idSystem, group, rowKey);
      if (result.ok) onChange(result.block);
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The default could not be set. Try again.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function change(group: string, stat: string, patch: StatPatch, rowKey?: string) {
    setBusy(true);
    try {
      const result = await sa_setStat(holder, block.idSystem, group, stat, patch, rowKey);
      if (result.ok) onChange(result.block);
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The stat could not be changed. Try again.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  const carried = block.groups.filter((group) => block.carried.includes(group.name));
  return (
    <Stack gap="2" data-testid={`stat-block-view-${block.idSystem}`}>
      {(showLabel || (showControls && canEdit)) && (
        <HStack justify={showLabel ? "space-between" : "flex-end"} gap="2">
          {showLabel && (
            <Heading as="h3" size="xs">
              {block.label}
            </Heading>
          )}
          {showControls && canEdit && (
            <HStack gap="0">
              {!editing && copyFromElement && "idSceneElement" in holder && (
                <PrepIconButton
                  label="Copy stats from the element"
                  disabled={copying}
                  onClick={() => void pasteFromElement()}
                >
                  <ClipboardPaste />
                </PrepIconButton>
              )}
              {editing && "idSceneElement" in holder && (
                <PrepIconButton
                  label="Copy stats to the element"
                  disabled={copying}
                  onClick={() => void copyToElement()}
                >
                  <Copy />
                </PrepIconButton>
              )}
              <PrepIconButton
                label={editing ? "Done editing stat blocks" : "Edit stat blocks"}
                expanded={editing}
                onClick={() => setEditing(!editing)}
              >
                <Pencil />
              </PrepIconButton>
            </HStack>
          )}
        </HStack>
      )}
      {editing ? (
        <StatBlockPanelForm
          holder={holder}
          block={block}
          onSaved={(blocks) => {
            onBlocks(blocks);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : carried.length === 0 ? (
        <Text fontSize="sm" color="fg.muted">
          No stat blocks yet
        </Text>
      ) : (
        carried.map((group) =>
          isRepeating(group) ? (
            <RepeatingGroupView
              key={group.name}
              group={group}
              canEdit={canEdit}
              busy={busy}
              onChange={(stat, patch, rowKey) => void change(group.name, stat, patch, rowKey)}
              onRoll={roll && ((stat, rowKey) => void roll(group.name, stat, rowKey))}
              onRollAll={roll && group.rollAll ? () => void rollAll(group) : undefined}
              onDefault={canEdit ? (rowKey) => void setDefault(group.name, rowKey) : undefined}
            />
          ) : (
            <GroupView
              key={group.name}
              label={groupTitle(group)}
              stats={group.stats}
              canEdit={canEdit}
              busy={busy}
              onChange={(stat, patch) => void change(group.name, stat, patch)}
              onRoll={roll && ((stat) => void roll(group.name, stat))}
            />
          ),
        )
      )}
    </Stack>
  );
}

/** A group's heading: its label, with how many of it the element has where that is more than one. */
const groupTitle = (group: EvaluatedGroup) =>
  group.canHaveMultiples && group.multiple > 1 ? `${group.label} ×${group.multiple}` : group.label;

/** Rolls one stat's die, a row's by the row's key. */
type Roller = (group: string, stat: string, rowKey?: string) => Promise<void>;

/**
 * A stat block's heading at the table: its label as a button that folds the
 * block's lines away and brings them back, open to start with.
 */
function GroupHeading({
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
function GroupView({
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

function StatLines({
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
            <HStack key={stat.name} gap="2" align="center">
              <StatLabel stat={stat} />
              <StatCell
                stat={stat}
                canEdit={canEdit}
                busy={busy}
                onChange={(patch) => onChange(stat.name, patch)}
                onRoll={onRoll && (() => onRoll(stat.name))}
              />
            </HStack>
          ))}
        </Flex>
      ))}
    </Stack>
  );
}

/**
 * A repeating group at the table: the group's label, then each row headed
 * by its key with the row's other visible stats on their lines under it,
 * and one quiet line when there are no rows yet. Rows reach the table
 * tidied, so every key is there and distinct. The first row is the group's
 * default, marked with a filled star; with onDefault, every other row has
 * an empty one that makes it the default (sa_setDefaultRow).
 */
function RepeatingGroupView({
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
  const others = (row: EvaluatedRow) =>
    row.stats.filter((stat) => stat.visible && stat.name !== group.keyedBy);
  return (
    <Stack gap="2">
      <HStack gap="1">
        <GroupHeading
          label={groupTitle(group)}
          open={open}
          onToggle={() => setOpen((current) => !current)}
        />
        {onRollAll && (
          <PrepIconButton label="Roll All" size="2xs" disabled={busy} onClick={onRollAll}>
            <Dices />
          </PrepIconButton>
        )}
      </HStack>
      {open && group.rows.length === 0 && (
        <Text fontSize="sm" color="fg.muted">
          No {group.label} yet
        </Text>
      )}
      {open &&
        group.rows.map((row, index) => {
          const key = String(row.key);
          return (
            <Stack key={key} gap="1" data-testid={`stat-row-${key}`}>
              <HStack gap="1">
                <Text fontSize="sm" fontWeight="semibold">
                  {key}
                </Text>
                {index === 0 ? (
                  <Box
                    as="span"
                    role="img"
                    aria-label={`${key} is the default`}
                    color="fg.muted"
                    display="inline-flex"
                  >
                    <Star size={12} fill="currentColor" />
                  </Box>
                ) : (
                  onDefault && (
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
                      _focusVisible={{
                        outline: "2px solid",
                        outlineColor: "colorPalette.focusRing",
                      }}
                      onClick={() => onDefault(key)}
                    >
                      <Star size={12} />
                    </chakra.button>
                  )
                )}
              </HStack>
              <StatLines
                stats={others(row)}
                canEdit={canEdit}
                busy={busy}
                onChange={(stat, patch) => onChange(stat, patch, key)}
                onRoll={onRoll && ((stat) => onRoll(stat, key))}
              />
            </Stack>
          );
        })}
    </Stack>
  );
}

/**
 * A stat's label in the panel, with its description, when the template
 * gives one, as a tooltip over it.
 */
function StatLabel({ stat }: { stat: Pick<EvaluatedStat, "label" | "description"> }) {
  const label = (
    <Text
      as="span"
      fontSize="sm"
      color="fg.muted"
      textDecoration={stat.description === "" ? undefined : "underline dotted"}
      cursor={stat.description === "" ? undefined : "help"}
    >
      {stat.label}
    </Text>
  );
  if (stat.description === "") return label;
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>{label}</Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{stat.description}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}

/**
 * The die beside a stat with a roll, saying what it rolls. Given onRoll, a
 * button that makes the roll; otherwise only the mark.
 */
function RollMark({
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
function StatCell({
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
          {stat.valueFrom === undefined && boxed ? (
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
          {stat.valueFrom && (
            <Text as="span" fontSize="xs" color="fg.muted">
              from {stat.valueFrom}
            </Text>
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
          {stat.maxFrom && (
            <Text as="span" fontSize="xs" color="fg.muted">
              max from {stat.maxFrom}
            </Text>
          )}
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
      return (
        <HStack gap="1">
          {active && (
            <PrepIconButton
              label={`${stat.label} down`}
              onClick={() => index > 0 && onChange({ value: rack[index - 1] })}
            >
              <ChevronLeft />
            </PrepIconButton>
          )}
          {words}
          {active && (
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
