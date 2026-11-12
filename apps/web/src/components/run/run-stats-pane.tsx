"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { Box, Heading, HStack, Portal, Stack, Text, Tooltip } from "@chakra-ui/react";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import {
  ArrowDown10,
  ArrowDownUp,
  ArrowUp01,
  Dices,
  Maximize2,
  Minimize2,
  Pencil,
} from "lucide-react";
import { toaster } from "@/components/ui/toaster";
import { StatBlockView } from "@/components/stat-blocks/stat-block-view";
import {
  sa_getSceneStatBlocks,
  sa_rollStatForAll,
  type ElementStatBlock,
  type SceneStatBlocks,
} from "@/components/stat-blocks/actions";
import { SCENE_ELEMENT_HIDDEN, type PlayItem } from "@/lib/run";
import { statLabel } from "@/lib/stat-blocks";
import type { StatusOption } from "@/lib/status";
import { rollText } from "@/lib/roll";
import { sa_listStatusOptions } from "@/components/status/actions";
import { StatusPill } from "@/components/status/status-pill";

/** One global stat the pane offers to roll for all, found on the blocks it lists. */
type GlobalStat = { idSystem: number; group: string; stat: string; label: string };

/**
 * The storyteller's stats pane, beside the library: every element in the
 * scene that carries a stat block, invisible ones too, each under a pill
 * the pane's width that carries what its play pill shows it as and its
 * scene status, with its blocks drawn and changed as the element panel
 * draws them (StatBlockView), without the system's name, so a pool is
 * spent and a die rolled here without opening a pill. The blocks are read
 * as the pane opens (sa_getSceneStatBlocks) and again when the scene
 * changes, an element joins or leaves it, or the table's reload asks
 * (`version`); a change made in a pill's own view shows here after one of
 * those.
 *
 * The titles and statuses come from the table's own items when it has
 * them, so a pill renamed or hidden at the table is followed at once, and
 * from the read otherwise. The status is the same StatusPill the play pill
 * has, on the scene_elements workflow read as the pane opens
 * (sa_listStatusOptions), moved here the same way and told to the table
 * (`onStatusChange`), so the play pill follows. Beside it, one pencil per element opens every
 * one of its blocks' edit forms at once, and closes with the last of them
 * saved or left. An invisible element's dice roll quietly, as its pill's
 * do.
 *
 * Each element is one memoised row (StatsPaneRow) given only its own blocks,
 * its own item and callbacks that keep their identity, so a stat changed
 * in one element, or a status moved at the table, redraws that element's
 * article and no other.
 *
 * Beside the heading, one die per global stat the listed blocks carry
 * (`global` on the template) rolls it for every element at once
 * (sa_rollStatForAll): the rolls the chat gets are said there, and the
 * quiet ones, an invisible element's or every one while no session is
 * played, are toasted here together. Each element's total then stands in
 * parentheses after its title, the stat it came from as its tooltip, and a
 * sort button appears by the dice:
 * pressed, it orders the elements by their totals high to low, and again
 * low to high, its icon showing the order in force; an element without a
 * total keeps to the end. The totals stand until the next roll for all. Wider than the library, since a block
 * lays several stats on a line, and widened to half the page from the
 * button at the heading's end, and back; the page's own state, forgotten
 * on a reload.
 */
export function RunStatsPane({
  id,
  idStory,
  idStoryScene,
  items,
  locked,
  version,
  onStatusChange,
}: {
  id: string;
  idStory: number;
  /** The scene at the table; null while there is none, when there are no stats to list. */
  idStoryScene: number | null;
  /** The play space's items, for each element's title and scene status. */
  items: PlayItem[];
  /** A complete scene: the blocks are shown and rolled but not changed. */
  locked: boolean;
  /** An element's scene status has been moved from here: its item's key and the new status. */
  onStatusChange: (key: string, status: string) => void;
  /** Bumped by the table when the space is read again, so the pane reads its blocks again too. */
  version: number;
}) {
  // What was last read, with the key it was read for: rows for another key
  // are stale, so a new scene or a reload shows nothing until its own read
  // lands, without the effect having to clear them.
  const [loaded, setLoaded] = useState<{ key: string; rows: SceneStatBlocks[] } | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  // The last roll for all: which stat it was, each link's total by its id,
  // and the order the sort button has put the elements in, if any.
  const [totals, setTotals] = useState<{ label: string; byLink: Record<number, number> } | null>(
    null,
  );
  const [sort, setSort] = useState<"desc" | "asc" | null>(null);
  // The scene_elements workflow, for the status pills: the table's own
  // options are the scenes', which would make every status look final here.
  const [sceneOptions, setSceneOptions] = useState<StatusOption[] | null>(null);
  useEffect(() => {
    let live = true;
    sa_listStatusOptions("scene_elements").then(
      (options) => live && setSceneOptions(options),
      () => live && setSceneOptions([]),
    );
    return () => {
      live = false;
    };
  }, []);
  // Which links are in the scene, so an element joining or leaving it reads
  // the blocks again; a status or title change does not need to.
  const membership = items
    .map((item) => item.idSceneElement)
    .filter((idSceneElement) => idSceneElement !== undefined)
    .join(",");
  const loadKey = `${idStory}:${idStoryScene}:${version}:${membership}`;

  useEffect(() => {
    if (idStoryScene === null) return;
    let live = true;
    sa_getSceneStatBlocks(idStory, idStoryScene).then(
      (found) => live && setLoaded({ key: loadKey, rows: found ?? [] }),
      () => {
        if (!live) return;
        setLoaded({ key: loadKey, rows: [] });
        toaster.create({ title: "The stats could not be loaded. Try again.", type: "error" });
      },
    );
    return () => {
      live = false;
    };
  }, [idStory, idStoryScene, loadKey]);

  const rows: SceneStatBlocks[] | null =
    idStoryScene === null ? [] : loaded?.key === loadKey ? loaded.rows : null;

  // One row's blocks replaced, the other rows kept as they are, so only
  // that row's props change; one identity, so the rows need not redraw for it.
  const replaceBlocks = useCallback(
    (idSceneElement: number, next: ElementStatBlock[]) =>
      setLoaded((current) =>
        current
          ? {
              ...current,
              rows: current.rows.map((row) =>
                row.idSceneElement === idSceneElement ? { ...row, blocks: next } : row,
              ),
            }
          : current,
      ),
    [],
  );

  async function rollAll(global: GlobalStat) {
    if (idStoryScene === null) return;
    const key = globalKey(global);
    setRolling(key);
    try {
      const result = await sa_rollStatForAll(
        idStory,
        idStoryScene,
        global.idSystem,
        global.group,
        global.stat,
      );
      if (!result.ok) {
        toaster.create({ title: result.error, type: "error" });
        return;
      }
      if (result.rolls.length === 0) {
        toaster.create({ title: "There was nothing to roll.", type: "info" });
        return;
      }
      const byLink: Record<number, number> = {};
      for (const rolled of result.rolls) {
        if (rolled.idSceneElement !== undefined) byLink[rolled.idSceneElement] = rolled.roll.total;
      }
      setTotals({ label: global.label, byLink });
      const quiet = result.rolls.filter((roll) => !roll.posted);
      if (quiet.length > 0) {
        toaster.create({
          title: `${global.label} rolled quietly`,
          description: quiet.map((roll) => rollText(roll.roll)).join(" · "),
          type: "info",
        });
      }
    } catch {
      toaster.create({ title: "The rolls could not be made. Try again.", type: "error" });
    } finally {
      setRolling(null);
    }
  }

  const globals = rows ? globalStatsOf(rows) : [];
  // Sorted by the last roll's totals when asked; an element without one last.
  const ordered =
    rows && sort && totals
      ? [...rows].sort((a, b) => {
          const left = totals.byLink[a.idSceneElement];
          const right = totals.byLink[b.idSceneElement];
          if (left === undefined || right === undefined) {
            return (left === undefined ? 1 : 0) - (right === undefined ? 1 : 0);
          }
          return sort === "desc" ? right - left : left - right;
        })
      : rows;

  return (
    <Box
      as="section"
      id={id}
      aria-labelledby="run-stats-heading"
      w={wide ? "50vw" : { base: "80", md: "lg" }}
      flexShrink="0"
      data-wide={wide ? "true" : undefined}
      minH="0"
      display="flex"
      flexDirection="column"
      gap="3"
      p="4"
      borderRightWidth="1px"
      bg="bg.subtle"
    >
      <HStack gap="2" wrap="wrap">
        <Heading id="run-stats-heading" size="sm">
          Stats
        </Heading>
        {globals.map((global) => (
          <PrepIconButton
            key={globalKey(global)}
            label={`Roll ${global.label} for all`}
            expanded={rolling === globalKey(global)}
            disabled={rolling !== null}
            onClick={() => void rollAll(global)}
          >
            <Dices />
          </PrepIconButton>
        ))}
        {totals && (
          <PrepIconButton
            label={
              sort === "desc"
                ? "Sort by the last roll low to high"
                : "Sort by the last roll high to low"
            }
            onClick={() => setSort((current) => (current === "desc" ? "asc" : "desc"))}
          >
            {sort === "desc" ? <ArrowDown10 /> : sort === "asc" ? <ArrowUp01 /> : <ArrowDownUp />}
          </PrepIconButton>
        )}
        <Box ml="auto">
          <PrepIconButton
            label={wide ? "Shrink the stats pane" : "Expand the stats pane"}
            onClick={() => setWide((current) => !current)}
          >
            {wide ? <Minimize2 /> : <Maximize2 />}
          </PrepIconButton>
        </Box>
      </HStack>
      <Stack flex="1" minH="0" overflowY="auto" gap="5">
        {idStoryScene === null ? (
          <Text fontSize="sm" color="fg.muted">
            No scene at the table.
          </Text>
        ) : rows && rows.length === 0 ? (
          <Text fontSize="sm" color="fg.muted">
            No element in the scene has a stat block.
          </Text>
        ) : (
          ordered?.map((row) => (
            <StatsPaneRow
              key={row.idSceneElement}
              idStory={idStory}
              row={row}
              item={items.find((candidate) => candidate.idSceneElement === row.idSceneElement)}
              rolled={
                totals && row.idSceneElement in totals.byLink
                  ? { label: totals.label, total: totals.byLink[row.idSceneElement] }
                  : undefined
              }
              sceneOptions={sceneOptions}
              locked={locked}
              onBlocks={replaceBlocks}
              onStatusChange={onStatusChange}
            />
          ))
        )}
      </Stack>
    </Box>
  );
}

/**
 * One element's article: its line as a pill, with its title, its status
 * pill and the pencil that opens its blocks' edit forms, then its blocks.
 * Memoised on what it is given, which is only its own: the table's item
 * for it (replaced only when that element changes), its row of blocks
 * (replaced only when one of them changes), the workflow, and callbacks
 * that keep their identity. The holder and the roller are built here, so
 * the pane's own renders do not reach the blocks.
 */
const StatsPaneRow = memo(function StatsPaneRow({
  idStory,
  row,
  item,
  rolled,
  sceneOptions,
  locked,
  onBlocks,
  onStatusChange,
}: {
  idStory: number;
  row: SceneStatBlocks;
  /** The table's item for the element, for its title and status; left out when the table has none. */
  item: PlayItem | undefined;
  /** The element's total from the last roll for all and the stat it rolled, shown after its title; left out for none. */
  rolled?: { label: string; total: number };
  /** The scene_elements workflow; null until read, when the status is not yet drawn. */
  sceneOptions: StatusOption[] | null;
  locked: boolean;
  /** The row's blocks as an action gave them back. */
  onBlocks: (idSceneElement: number, blocks: ElementStatBlock[]) => void;
  /** The element's scene status has been moved from here. */
  onStatusChange: (key: string, status: string) => void;
}) {
  // Whether the blocks' edit forms are open, from the pencil on the line.
  const [editing, setEditing] = useState(false);
  const title = item?.label ?? row.title;
  const hidden = item ? item.sceneStatus === SCENE_ELEMENT_HIDDEN : row.hidden;
  const holder = { idStory, idSceneElement: row.idSceneElement };
  return (
    <Stack as="article" aria-label={title} gap="2" data-testid={`stats-pane-${row.idSceneElement}`}>
      {/* The element's own line as a pill the pane's width, on a tinted
          ground, so each element's blocks read under it. */}
      <HStack
        justify="space-between"
        gap="2"
        w="full"
        rounded="full"
        bg="bg.emphasized"
        px="3"
        py="1"
      >
        <Text fontWeight="semibold" truncate>
          {title}
          {rolled !== undefined && (
            <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
              <Tooltip.Trigger asChild>
                {/* Focusable, so the keyboard reaches the tooltip too. */}
                <Text
                  as="span"
                  fontWeight="normal"
                  color="fg.muted"
                  tabIndex={0}
                  data-testid="rolled-total"
                >
                  {" "}
                  ({rolled.total})
                </Text>
              </Tooltip.Trigger>
              <Portal>
                <Tooltip.Positioner>
                  <Tooltip.Content>{rolled.label}</Tooltip.Content>
                </Tooltip.Positioner>
              </Portal>
            </Tooltip.Root>
          )}
        </Text>
        <HStack gap="1" flexShrink="0">
          {item?.sceneStatus !== undefined && sceneOptions && (
            <StatusPill
              table="scene_elements"
              id={row.idSceneElement}
              status={item.sceneStatus}
              options={sceneOptions}
              canEdit={!locked}
              onChanged={(status) => onStatusChange(item.key, status)}
            />
          )}
          {!locked && (
            <PrepIconButton
              label={editing ? "Done editing stat blocks" : "Edit stat blocks"}
              expanded={editing}
              onClick={() => setEditing((current) => !current)}
            >
              <Pencil />
            </PrepIconButton>
          )}
        </HStack>
      </HStack>
      {row.blocks.map((block) => (
        <StatBlockView
          key={block.idSystem}
          holder={holder}
          block={block}
          canEdit={!locked}
          rollAs={{ title, quiet: hidden }}
          showLabel={false}
          showControls={false}
          editing={editing}
          onEditingChange={setEditing}
          onChange={(changed) =>
            onBlocks(
              row.idSceneElement,
              row.blocks.map((b) => (b.idSystem === changed.idSystem ? changed : b)),
            )
          }
          onBlocks={(blocks) => onBlocks(row.idSceneElement, blocks)}
        />
      ))}
    </Stack>
  );
});

const globalKey = (global: GlobalStat) => `${global.idSystem}.${global.group}.${global.stat}`;

/** The global stats on the groups the listed blocks carry, each once, in the order met. */
function globalStatsOf(rows: SceneStatBlocks[]): GlobalStat[] {
  const found = new Map<string, GlobalStat>();
  for (const row of rows) {
    for (const block of row.blocks) {
      for (const group of block.definition.groups) {
        if (!block.carried.includes(group.name)) continue;
        for (const stat of group.stats) {
          if (!stat.global) continue;
          const global = {
            idSystem: block.idSystem,
            group: group.name,
            stat: stat.name,
            label: statLabel(stat),
          };
          const key = globalKey(global);
          if (!found.has(key)) found.set(key, global);
        }
      }
    }
  }
  return [...found.values()];
}
