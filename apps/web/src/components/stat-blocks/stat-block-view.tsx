"use client";

import { useEffect, useState } from "react";
import { Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { ClipboardPaste, Copy, Pencil } from "lucide-react";
import { toaster } from "@/components/ui/toaster";
import { DeleteButton, type DeleteOutcome } from "@/components/confirm/delete-button";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { isRepeating, type EvaluatedGroup } from "@/lib/stat-blocks";
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
import { Fold } from "./fold";
import { plural } from "@/lib/plural";
import { rollText } from "@/lib/roll";
import { ROLLS_FAILED, toastRollAll } from "./roll-toasts";
import { GroupView, type Roller } from "./stat-block-group-view";
import { RepeatingGroupView } from "./stat-block-repeating-view";

/**
 * A holder's stat blocks at the table, under its rows in the element
 * panel: loaded as this mounts (sa_getStatBlocks), one StatBlockView per
 * system. The holder is the scene element when the panel was opened from
 * a pill, so play changes the scene's copy, and the element itself when it
 * was opened from the library. Nothing is drawn for a holder with no block
 * and no story system to start one, and nothing while loading, so the rows
 * above do not jump. Folded, the blocks start closed behind a line that
 * counts them (Fold), as the panel's scene card wants them, so the
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
  // Whether the holder carries stats a paste of the element's would replace,
  // in any system, since the paste writes every system's at once.
  const carriesStats = blocks.some((block) => block.stored && block.carried.length > 0);
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
          pasteOverwrites={carriesStats}
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
    <Fold
      open={open}
      onOpenChange={setOpen}
      summary={
        count === 0
          ? "No stat blocks in this scene yet"
          : `${plural(count, "stat block")} in this scene`
      }
    >
      {views}
    </Fold>
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
 * its "/ max" as a button that refills it, said in its tooltip, a rack ◀ ▶
 * where the template asks for them (`leftRight`) and the rack is not static;
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
 * starting the scene element again from what it was prepared with. Either
 * asks first when it would overwrite stats: the paste when the scene
 * element carries any (`pasteOverwrites`), the copy back when the element
 * carries a block of this system (`onElement`).
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
  pasteOverwrites = true,
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
  /**
   * Whether the holder carries stats the paste would replace, so it asks
   * first; left out, it is assumed to, so a paste never overwrites unasked.
   */
  pasteOverwrites?: boolean;
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

  // The copy back to the element, offered while a scene element's form is
  // open. Once it is made the element carries this system's block, so the
  // next copy asks first.
  async function copyToElement(): Promise<DeleteOutcome> {
    const result = await sa_copyStatBlocksToElement(holder, block.idSystem);
    if (result.ok) onChange({ ...block, onElement: true });
    return result;
  }

  // The element's blocks over the holder's, every system at once: what the
  // element was prepared with becomes the scene element's again, whatever
  // play made of them.
  async function pasteFromElement(): Promise<DeleteOutcome> {
    const result = await sa_copyStatBlocksFromElement(holder);
    if (result.ok) onBlocks(result.blocks);
    return result.ok ? { ok: true } : result;
  }

  // A copy that loses nothing is made at once, toasted as DeleteButton
  // toasts the one it asked about.
  async function copyUnasked(copy: () => Promise<DeleteOutcome>, done: string) {
    setCopying(true);
    try {
      const result = await copy();
      if (result && !result.ok) toaster.create({ title: result.error, type: "error" });
      else toaster.create({ title: done, type: "success" });
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
          const result = await sa_rollStat(holder, {
            idSystem: block.idSystem,
            group,
            stat,
            as: rollAs,
            rowKey,
          });
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
      toastRollAll(group.label, await sa_rollGroupRows(holder, block.idSystem, group.name, rollAs));
    } catch {
      toaster.create({ title: ROLLS_FAILED, type: "error" });
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
      const result = await sa_setStat(holder, {
        idSystem: block.idSystem,
        group,
        stat,
        patch,
        rowKey,
      });
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
              {/* Each copy writes over stats that may hold what play or prep
                  made of them, so it asks first, through DeleteButton, when
                  there are any to lose, and is made at once when there are
                  none: a scene element with no stats yet, or an element with
                  no block of this system. */}
              {!editing &&
                copyFromElement &&
                "idSceneElement" in holder &&
                (pasteOverwrites ? (
                  <DeleteButton
                    label="Copy stats from the element"
                    icon={<ClipboardPaste />}
                    verb="Overwrite"
                    thing="the stats in this scene"
                    done="Stats copied from the element"
                    failed="The stats could not be copied. Try again."
                    onDelete={pasteFromElement}
                  >
                    The element&apos;s stats replace the ones it has in this scene, and what play
                    has made of them is lost. This cannot be undone.
                  </DeleteButton>
                ) : (
                  <IconButtonWithTooltip
                    label="Copy stats from the element"
                    disabled={copying}
                    onClick={() =>
                      void copyUnasked(pasteFromElement, "Stats copied from the element")
                    }
                  >
                    <ClipboardPaste />
                  </IconButtonWithTooltip>
                ))}
              {editing &&
                "idSceneElement" in holder &&
                (block.onElement === false ? (
                  <IconButtonWithTooltip
                    label="Copy stats to the element"
                    disabled={copying}
                    onClick={() => void copyUnasked(copyToElement, "Stats copied to the element")}
                  >
                    <Copy />
                  </IconButtonWithTooltip>
                ) : (
                  <DeleteButton
                    label="Copy stats to the element"
                    icon={<Copy />}
                    verb="Overwrite"
                    thing="the element's stats"
                    done="Stats copied to the element"
                    failed="The stats could not be copied. Try again."
                    onDelete={copyToElement}
                  >
                    {`The element's own ${block.label} stats, the ones it is prepared with, are replaced by these as they stand in this scene. This cannot be undone.`}
                  </DeleteButton>
                ))}
              <IconButtonWithTooltip
                label={editing ? "Done editing stat blocks" : "Edit stat blocks"}
                expanded={editing}
                onClick={() => setEditing(!editing)}
              >
                <Pencil />
              </IconButtonWithTooltip>
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
              label={group.label}
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
